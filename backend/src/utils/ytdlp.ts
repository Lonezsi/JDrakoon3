import { exec, spawn } from "child_process";
import { promisify } from "util";
import fsPromises from "fs/promises";
import fs from "fs";
import path from "path";
import https from "https";
import fetch from "node-fetch";
import logger from "./logger";
import { ytDlpBinaryName } from "../platform";

const execAsync = promisify(exec);

export interface VideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
}

const BIN_DIR = path.join(process.cwd(), "bin");

function getYtDlpLocalPath(): string {
  return path.join(BIN_DIR, ytDlpBinaryName());
}

let ytdlpPath: string | null = null;

async function ensureYtDlp(): Promise<string> {
  if (ytdlpPath) return ytdlpPath;

  // 1. Check if it's in PATH
  try {
    await execAsync("yt-dlp --version");
    ytdlpPath = "yt-dlp";
    logger.info("yt-dlp found in PATH");
    return ytdlpPath;
  } catch {
    logger.info("yt-dlp not in PATH, checking local binary...");
  }

  // 2. Check local bin folder
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }
  const localPath = getYtDlpLocalPath();
  if (fs.existsSync(localPath)) {
    ytdlpPath = localPath;
    logger.info(`Using local yt-dlp: ${localPath}`);
    return ytdlpPath;
  }

  // 3. Download the correct binary
  const binaryName = ytDlpBinaryName();
  const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${binaryName}`;
  logger.info(`Downloading ${binaryName} from ${downloadUrl} ...`);

  await new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(localPath);
    https
      .get(downloadUrl, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          https
            .get(response.headers.location!, (redirectRes) => {
              redirectRes.pipe(file);
              file.on("finish", () => {
                file.close();
                resolve();
              });
            })
            .on("error", reject);
        } else if (response.statusCode === 200) {
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        } else {
          reject(
            new Error(`Download failed with status ${response.statusCode}`),
          );
        }
      })
      .on("error", reject);
  });

  try {
    if (process.platform === "win32") {
      await execAsync(
        `powershell -Command "Unblock-File -Path '${localPath}'"`,
      );
    } else {
      // The yt-dlp release binaries for macOS/Linux arrive without the execute
      // bit set when fetched over HTTP — mark it runnable.
      await fsPromises.chmod(localPath, 0o755);
    }
  } catch (e) {
    logger.warn("Could not finalize yt-dlp binary, but it may still work");
  }

  ytdlpPath = localPath;
  logger.info("yt-dlp downloaded successfully");
  return ytdlpPath;
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const ytdlp = await ensureYtDlp();
  const isDirectMedia = /\.(mp3|mp4|webm|ogg|flac|wav)(\?.*)?$/i.test(url);

  try {
    // --no-playlist: a link that carries a playlist (YouTube `&list=…`) adds
    // only the current video, not the whole list.
    const { stdout } = await execAsync(`"${ytdlp}" --no-playlist -j "${url}"`, {
      timeout: 60000,
    });
    const data = JSON.parse(stdout);

    // If yt-dlp returned JSON but it's missing a title, treat that as an
    // extraction failure for non-direct-media URLs so the add operation
    // will fail and the client can be notified.
    const id = data.id || url;
    const title = data.title;
    if (!title && !isDirectMedia) {
      throw new Error("Incomplete metadata from yt-dlp");
    }

    return {
      id,
      title: title || url,
      duration: data.duration || 0,
      thumbnail: data.thumbnail || "",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (isDirectMedia) {
      // Allow minimal info for direct media links so streaming can still
      // work even if yt-dlp can't extract metadata.
      return { id: url, title: url, duration: 0, thumbnail: "" };
    }

    // For non-direct media, surface the error so callers can reject the add
    // and notify the originating client.
    throw err;
  }
}

export async function downloadThumbnail(
  url: string,
  outputPath: string,
): Promise<void> {
  try {
    // Bounded: a hanging thumbnail host must not keep a queue item "pending"
    // forever — the thumbnail is best-effort, so just skip it on timeout/404.
    const response = await fetch(url, { timeout: 10000 });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.buffer();
    await fsPromises.writeFile(outputPath, buffer);
  } catch (err) {
    logger.warn("Thumbnail download failed:", (err as Error).message);
  }
}

// Resolved direct-URL cache. CDN URLs (e.g. googlevideo) are time-limited but
// valid for hours; a short TTL avoids re-resolving on replay while staying safe.
const directUrlCache = new Map<string, { direct: string; at: number }>();
const DIRECT_URL_TTL = 5 * 60 * 1000;

const DIRECT_MEDIA_RE = /\.(mp3|mp4|m4a|webm|ogg|oga|flac|wav|mov|mkv)(\?.*)?$/i;

// Resolve a page URL (YouTube/SoundCloud/…) to a single direct media URL via
// `yt-dlp -g`. Returns null if it can't get a single progressive stream.
async function resolveDirectUrl(url: string): Promise<string | null> {
  const cached = directUrlCache.get(url);
  if (cached && Date.now() - cached.at < DIRECT_URL_TTL) return cached.direct;

  const ytdlp = await ensureYtDlp();
  const { stdout } = await execAsync(
    `"${ytdlp}" --no-playlist -g -f "best[ext=mp4]/best" "${url}"`,
    { timeout: 15000, maxBuffer: 1024 * 1024 },
  );
  const urls = stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Exactly one URL = a progressive (a+v) stream the browser can seek. More than
  // one = separate video/audio that would need muxing → let the caller fall back
  // to piping (which serves a single combined-ish stream, just without seeking).
  if (urls.length !== 1) return null;
  directUrlCache.set(url, { direct: urls[0], at: Date.now() });
  return urls[0];
}

export async function streamVideo(url: string, res: any): Promise<void> {
  const isDirectMedia = DIRECT_MEDIA_RE.test(url);

  // Direct file → redirect; the browser range-requests it itself (seekable).
  if (isDirectMedia) {
    res.redirect(302, url);
    return;
  }

  // Page URL → resolve the CDN media URL and redirect, so the browser streams +
  // SEEKS against the CDN directly (fast start, working scrubbing) instead of us
  // piping yt-dlp's stdout with no Range support.
  try {
    const direct = await resolveDirectUrl(url);
    if (direct) {
      res.redirect(302, direct);
      return;
    }
  } catch (err) {
    logger.warn("yt-dlp -g failed; falling back to pipe:", (err as Error).message);
  }

  // Fallback: pipe yt-dlp's output (single stream, no seeking) — used when the
  // source has only separate audio/video tracks.
  const ytdlp = await ensureYtDlp();
  res.setHeader("Content-Type", "video/mp4");
  const proc = spawn(ytdlp, ["--no-playlist", "-o", "-", "-f", "best[ext=mp4]/bestaudio[ext=m4a]/bestaudio", url], {
    windowsHide: true,
  });
  proc.stdout.pipe(res);
  proc.stderr.on("data", (data: Buffer) =>
    logger.debug(`yt-dlp stderr: ${data.toString()}`),
  );
  proc.on("error", (err: any) => {
    logger.error("Stream error:", err);
    if (!res.headersSent) res.status(500).end();
  });
  proc.on("close", (code: number) => {
    if (code !== 0 && !res.headersSent) {
      logger.error(`yt-dlp exited with code ${code}`);
      res.status(500).end();
    }
  });
}
