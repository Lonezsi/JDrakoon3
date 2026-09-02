import { exec } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { CACHE_DIR } from "../config/constants";
import { isWindows } from "../platform";
import logger from "../utils/logger";

// ---------------------------------------------------------------
// Extracts the real Windows icon for an .exe / .lnk and computes its average
// colour, both cached on disk. Used so dropped-in / picked apps show their
// actual icon and a matching accent colour instead of a generic letter tile.
//
// Windows-only (System.Drawing.Icon via PowerShell). On other platforms it
// resolves to a null icon + default colour, and the card falls back to lucide.
// ---------------------------------------------------------------

const ICON_DIR = path.join(CACHE_DIR, "app-icons");
const DEFAULT_COLOR = "#6366f1";

export interface IconMeta {
  /** Absolute path to the cached PNG, or null if none could be extracted. */
  pngPath: string | null;
  /** Average colour of the icon (hex), or the default accent. */
  color: string;
}

const inFlight = new Map<string, Promise<IconMeta>>();

function keyFor(p: string): string {
  return crypto.createHash("md5").update(p.toLowerCase()).digest("hex");
}

// Run a PowerShell script via -EncodedCommand (UTF-16LE base64) — no shell
// quoting pitfalls regardless of paths/quotes inside the script.
function runPs(script: string, timeout = 8000): Promise<string> {
  return new Promise((resolve) => {
    const enc = Buffer.from(script, "utf16le").toString("base64");
    exec(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${enc}`,
      { timeout, windowsHide: true },
      (_err, stdout) => resolve((stdout || "").trim()),
    );
  });
}

const psStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function resolveTarget(p: string): Promise<string> {
  if (!/\.lnk$/i.test(p)) return p;
  const out = await runPs(
    `$s=New-Object -ComObject WScript.Shell; $s.CreateShortcut(${psStr(p)}).TargetPath`,
    5000,
  );
  return out && fs.existsSync(out) ? out : p;
}

function extract(src: string, outPng: string): Promise<string> {
  // Save the associated icon to PNG and print its average non-transparent
  // colour. GetPixel is slow but icons are tiny (≤256²) and we step by 2.
  const script = [
    "Add-Type -AssemblyName System.Drawing;",
    "try {",
    `  $i=[System.Drawing.Icon]::ExtractAssociatedIcon(${psStr(src)});`,
    "  if($i){",
    "    $b=$i.ToBitmap();",
    `    $b.Save(${psStr(outPng)},[System.Drawing.Imaging.ImageFormat]::Png);`,
    "    $sr=0;$sg=0;$sb=0;$n=0;",
    "    for($x=0;$x -lt $b.Width;$x+=2){for($y=0;$y -lt $b.Height;$y+=2){",
    "      $c=$b.GetPixel($x,$y); if($c.A -gt 128){$sr+=$c.R;$sg+=$c.G;$sb+=$c.B;$n++}}}",
    "    if($n -gt 0){'#{0:x2}{1:x2}{2:x2}' -f [int]($sr/$n),[int]($sg/$n),[int]($sb/$n)}",
    `    else {'${DEFAULT_COLOR}'}`,
    "  }",
    "} catch {}",
  ].join("\n");
  return runPs(script).then((c) =>
    /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : DEFAULT_COLOR,
  );
}

/** Extract (or read cached) the icon + average colour for an app path. */
export function appIconMeta(rawPath: string): Promise<IconMeta> {
  if (!isWindows || !rawPath)
    return Promise.resolve({ pngPath: null, color: DEFAULT_COLOR });

  const key = keyFor(rawPath);
  const png = path.join(ICON_DIR, `${key}.png`);
  const metaFile = path.join(ICON_DIR, `${key}.json`);

  if (fs.existsSync(png) && fs.existsSync(metaFile)) {
    try {
      const color = JSON.parse(fs.readFileSync(metaFile, "utf8")).color;
      return Promise.resolve({ pngPath: png, color: color || DEFAULT_COLOR });
    } catch {
      /* fall through to re-extract */
    }
  }

  if (inFlight.has(key)) return inFlight.get(key)!;

  const job = (async (): Promise<IconMeta> => {
    try {
      if (!fs.existsSync(ICON_DIR)) fs.mkdirSync(ICON_DIR, { recursive: true });
      const target = await resolveTarget(rawPath);
      if (!fs.existsSync(target)) return { pngPath: null, color: DEFAULT_COLOR };
      const color = await extract(target, png);
      try {
        fs.writeFileSync(metaFile, JSON.stringify({ color }));
      } catch {}
      return { pngPath: fs.existsSync(png) ? png : null, color };
    } catch (e) {
      logger.warn("[app-icon] extract failed:", (e as Error).message);
      return { pngPath: null, color: DEFAULT_COLOR };
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, job);
  return job;
}

/** Title-cased app name from a launcher path, extension stripped. */
export function cleanAppName(launcher: string): string {
  const base =
    launcher
      .replace(/^"+|"+$/g, "")
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.(exe|lnk|app|url|bat|cmd)$/i, "")
      ?.replace(/:.*$/, "") || "App";
  return base.charAt(0).toUpperCase() + base.slice(1);
}
