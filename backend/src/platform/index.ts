import { execSync } from "child_process";

// ---------------------------------------------------------------
// Central place for OS detection and per-platform resolution. Every
// Windows-only assumption that used to be scattered across services
// (input driver, app launcher, yt-dlp binary) funnels through here so
// macOS / Linux support is a matter of adding a branch, not hunting.
// ---------------------------------------------------------------

export type OS = "win32" | "darwin" | "linux" | "other";

export const PLATFORM: OS = ((): OS => {
  if (process.platform === "win32") return "win32";
  if (process.platform === "darwin") return "darwin";
  if (process.platform === "linux") return "linux";
  return "other";
})();

export const isWindows = PLATFORM === "win32";
export const isMac = PLATFORM === "darwin";
export const isLinux = PLATFORM === "linux";

/** The yt-dlp release asset name for this OS/arch. */
export function ytDlpBinaryName(): string {
  if (isWindows) return process.arch === "ia32" ? "yt-dlp_x86.exe" : "yt-dlp.exe";
  if (isMac) return "yt-dlp_macos";
  return "yt-dlp"; // linux generic binary
}

const _exists: Record<string, boolean> = {};

/** Is a CLI command available on PATH? Cached. Used to detect optional helpers
 *  like xdotool / cliclick at runtime without throwing. */
export function commandExists(cmd: string): boolean {
  if (cmd in _exists) return _exists[cmd];
  try {
    const probe = isWindows ? `where ${cmd}` : `command -v ${cmd}`;
    execSync(probe, { stdio: "ignore" });
    _exists[cmd] = true;
  } catch {
    _exists[cmd] = false;
  }
  return _exists[cmd];
}
