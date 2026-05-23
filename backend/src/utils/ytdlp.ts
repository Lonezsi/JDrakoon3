import { exec, spawn } from "child_process";
import { promisify } from "util";
import fsPromises from "fs/promises";
import fs from "fs";
import path from "path";
import https from "https";
import fetch from "node-fetch";
import logger from "./logger";

const execAsync = promisify(exec);

export interface VideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
}

const BIN_DIR = path.join(process.cwd(), "bin");

// Determine the correct yt-dlp binary for the current Windows architecture
function getYtDlpBinaryName(): string {
  // process.arch is 'ia32' for 32-bit, 'x64' for 64-bit
  const is32bit = process.arch === "ia32";
  return is32bit ? "yt-dlp_x86.exe" : "yt-dlp.exe";
}

function getYtDlpLocalPath(): string {
  return path.join(BIN_DIR, getYtDlpBinaryName());
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
  const binaryName = getYtDlpBinaryName();
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
    }
  } catch (e) {
    logger.warn("Could not unblock yt-dlp, but it may still work");
  }

  ytdlpPath = localPath;
  logger.info("yt-dlp downloaded successfully");
  return ytdlpPath;
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const ytdlp = await ensureYtDlp();
  try {
    const { stdout } = await execAsync(`"${ytdlp}" -j "${url}"`, {
      timeout: 15000,
    });
    const data = JSON.parse(stdout);
    return {
      id: data.id || url,
      title: data.title || url,
      duration: data.duration || 0,
      thumbnail: data.thumbnail || "",
    };
  } catch (err) {
    logger.warn("yt-dlp info extraction failed, returning minimal info");
    return { id: url, title: url, duration: 0, thumbnail: "" };
  }
}

export async function downloadThumbnail(
  url: string,
  outputPath: string,
): Promise<void> {
  try {
    const response = await fetch(url);
    const buffer = await response.buffer();
    await fsPromises.writeFile(outputPath, buffer);
  } catch (err) {
    logger.warn("Thumbnail download failed:", (err as Error).message);
  }
}

export async function streamVideo(url: string, res: any): Promise<void> {
  const ytdlp = await ensureYtDlp();

  const isDirectMedia = /\.(mp3|mp4|webm|ogg|flac|wav)(\?.*)?$/i.test(url);
  const contentType = isDirectMedia
    ? url.endsWith(".mp3")
      ? "audio/mpeg"
      : url.endsWith(".mp4")
        ? "video/mp4"
        : "video/webm"
    : "video/mp4"; // default for YouTube

  res.setHeader("Content-Type", contentType);

  const args: string[] = ["-o", "-"];
  if (isDirectMedia) {
    args.push(url);
  } else {
    args.push("-f", "best[ext=mp4]/bestaudio[ext=m4a]/bestaudio", url);
  }

  const proc = spawn(ytdlp, args, { windowsHide: true });
  proc.stdout.pipe(res);
  proc.stderr.on("data", (data: Buffer) => {
    logger.debug(`yt-dlp stderr: ${data.toString()}`);
  });

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
