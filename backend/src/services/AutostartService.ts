import { exec } from "child_process";
import logger from "../utils/logger";
import { isWindows } from "../platform";

// HKCU Run entry — launches the app at login, no admin needed.
const RUN_KEY = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const VALUE_NAME = "JDrakoon3";

/** Reconciles a Windows "start at login" registry entry with a desired state.
 *  Single source of truth is `settings.system.autostart`; the launcher
 *  (launcher.cs) hands us its own exe path via `JD_EXE_PATH` so we can point the
 *  Run entry at the real launcher rather than guessing from cwd. */
class AutostartService {
  /** Apply the desired autostart state. Windows-only; a no-op elsewhere or when
   *  enabling without a known exe path (e.g. `npm run dev`, no launcher). */
  async apply(enabled: boolean): Promise<void> {
    if (!isWindows) return;
    const exePath = process.env.JD_EXE_PATH;
    if (enabled && !exePath) {
      logger.warn(
        "[autostart] JD_EXE_PATH unset (not launched by JDrakoon3.exe) — cannot enable; skipping",
      );
      return;
    }

    // Run via -EncodedCommand (UTF-16LE base64) so a launcher path with spaces
    // or quotes never trips shell quoting. The stored value is wrapped in real
    // double-quotes so Windows runs a spaced path correctly.
    const script = enabled
      ? `Set-ItemProperty -Path '${RUN_KEY}' -Name '${VALUE_NAME}' -Value '"${exePath}"' -Force`
      : `Remove-ItemProperty -Path '${RUN_KEY}' -Name '${VALUE_NAME}' -ErrorAction SilentlyContinue`;

    await new Promise<void>((resolve) => {
      const enc = Buffer.from(script, "utf16le").toString("base64");
      exec(
        `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${enc}`,
        { timeout: 8000, windowsHide: true },
        (err) => {
          if (err)
            logger.warn(
              "[autostart] failed to update Run key:",
              (err as Error).message,
            );
          else
            logger.info(
              enabled ? `[autostart] enabled → ${exePath}` : "[autostart] disabled",
            );
          resolve();
        },
      );
    });
  }
}

export const autostartService = new AutostartService();
