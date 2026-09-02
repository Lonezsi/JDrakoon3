import { exec } from "child_process";
import { isWindows } from "../platform";
import logger from "../utils/logger";

// Debounce so a burst of close events (home + close_app + onExit) only
// foregrounds once.
let lastFocus = 0;

/** Bring the JDrakoon3 kiosk window to the foreground and give it focus.
 *
 *  When an app is launched we steal the foreground for it (`WindowedLauncher`);
 *  on close, Windows doesn't reliably hand focus back to our borderless kiosk,
 *  so the dashboard can end up behind the dying app / desktop. This finds our
 *  window (the WebView2 host runs in the launcher process — `JD_EXE_PATH` — and
 *  its title is "JDrakoon3"; the Edge-kiosk fallback is `msedge`) and raises it.
 *  Windows-only; a no-op in dev (no launcher / no JD_EXE_PATH). */
export function focusKiosk(): void {
  if (!isWindows) return;
  const now = Date.now();
  if (now - lastFocus < 700) return;
  lastFocus = now;

  const exe = process.env.JD_EXE_PATH;
  const exeMatch = exe
    ? `try { $t = Get-Process | Where-Object { $_.Path -eq '${exe.replace(/'/g, "''")}' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1 } catch {}`
    : "";

  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Fg {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, IntPtr e);
}
'@
$t = $null
${exeMatch}
if (-not $t) { $t = Get-Process | Where-Object { $_.MainWindowTitle -eq 'JDrakoon3' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1 }
if (-not $t) { $t = Get-Process -Name msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 }
if ($t) {
  $h = $t.MainWindowHandle
  # Tap Alt so Windows lets us steal the foreground (same trick the launcher uses).
  [Fg]::keybd_event(0x12, 0, 0, [IntPtr]::Zero)
  [Fg]::keybd_event(0x12, 0, 2, [IntPtr]::Zero)
  [Fg]::ShowWindow($h, 9) | Out-Null   # SW_RESTORE
  [Fg]::SetForegroundWindow($h) | Out-Null
}
`;

  const enc = Buffer.from(script, "utf16le").toString("base64");
  exec(
    `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${enc}`,
    { timeout: 6000, windowsHide: true },
    (err) => {
      if (err) logger.warn("[kiosk] focus failed:", (err as Error).message);
    },
  );
}
