import { spawn, ChildProcess, execSync } from "child_process";
import fs from "fs";
import path from "path";
import logger from "../utils/logger";
import { writeRunningFile, removeRunningFile } from "./RunningFile";

// Launches a target (exe path or protocol URI like steam://) via a
// long-lived PowerShell that reports lifecycle markers on stdout:
//   LAUNCHED <pid>   process started
//   READY <hwnd>     main window exists and was foregrounded (0 = no window found)
//   DETACHED         protocol URI; process can't be tracked (best-effort ready)
//   EXITED <code>    app closed
const PS_SCRIPT_TEMPLATE = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@

# NOTE: $pid and $args are RESERVED automatic variables in PowerShell.
# Assigning to $pid fails silently under SilentlyContinue, which made every
# lifecycle step track the PowerShell wrapper instead of the real app
# (WaitForExit deadlocked on itself, EXITED never fired, kills missed).
$raw = '<RAW>'
$exe = '<EXE>'
$procArgs = '<ARGS>'

if (($raw -match '^[a-zA-Z][a-zA-Z0-9+.-]*:') -and ($raw -notmatch '^[a-zA-Z]:[\\/]')) {
  # Protocol URI (steam:// etc.) - the handler process detaches, we can't track it
  Start-Process $raw
  Write-Output 'LAUNCHED 0'
  Start-Sleep -Seconds 4
  Write-Output 'DETACHED'
  exit 0
}

if ($procArgs -and $procArgs -ne '') {
  $p = Start-Process -FilePath $exe -ArgumentList $procArgs -PassThru -ErrorAction Stop
} else {
  $p = Start-Process -FilePath $exe -PassThru -ErrorAction Stop
}
if (-not $p) { Write-Output 'ERROR spawn_failed'; exit 1 }
$procId = $p.Id
Write-Output ('LAUNCHED ' + $procId)

# Give the spawned process time to fully initialize before waiting
Start-Sleep -Milliseconds 500

# Re-fetch the process by PID to ensure we have a valid object (fixes WaitForExit issues)
$p = Get-Process -Id $procId -ErrorAction SilentlyContinue
if (-not $p) {
  # Process already exited immediately (unexpected)
  Write-Output 'EXITED -1'
  exit 0
}

# Wait up to ~5s for the app's main window to exist (= "fully loaded enough")
$hwnd = [IntPtr]::Zero
for ($i = 0; $i -lt 32; $i++) {
  Start-Sleep -Milliseconds 150
  $p.Refresh()
  if ($p.HasExited) { break }
  if ($p.MainWindowHandle -ne 0) { $hwnd = $p.MainWindowHandle; break }
}

if ($hwnd -ne [IntPtr]::Zero) {
  # Foreground-lock workaround: tap Alt so Windows lets us steal focus, retry until it sticks
  $shell = New-Object -ComObject WScript.Shell
  for ($i = 0; $i -lt 10; $i++) {
    $shell.SendKeys('%')
    [Win32]::ShowWindow($hwnd, 9) | Out-Null
    [Win32]::SetForegroundWindow($hwnd) | Out-Null
    Start-Sleep -Milliseconds 300
    if ([Win32]::GetForegroundWindow() -eq $hwnd) { break }
  }
}
Write-Output ('READY ' + $hwnd)

$p.WaitForExit()
Write-Output ('EXITED ' + $p.ExitCode)
`;

export interface RunningApp {
  pid: number | null;
  kill: () => void;
}

export function launchWindowedApp(
  rawTarget: string,
  handlers: {
    onReady?: (focused: boolean) => void;
    onExit?: (code: number | null) => void;
  },
): RunningApp {
  const raw = rawTarget.trim();

  // Split raw target into executable and args so Start-Process can be called
  // with -FilePath and -ArgumentList. Handles quoted paths.
  let exeOnly = raw;
  let argsOnly = "";
  if (raw.startsWith('"')) {
    const m = raw.match(/^"([^"]+)"\s*(.*)$/s);
    if (m) {
      exeOnly = m[1];
      argsOnly = m[2] || "";
    }
  } else {
    const parts = raw.split(/\s+/);
    if (parts.length > 1) {
      exeOnly = parts.shift() as string;
      argsOnly = parts.join(" ");
    }
  }

  const script = PS_SCRIPT_TEMPLATE.replace("<RAW>", raw.replace(/'/g, "''"))
    .replace(/<EXE>/g, exeOnly.replace(/'/g, "''"))
    .replace(/<ARGS>/g, argsOnly.replace(/'/g, "''"));

  logger.debug(`[launcher] exec raw=${raw} exe=${exeOnly} args=${argsOnly}`);

  const ps: ChildProcess = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );

  let detached = false;
  let exitReported = false;
  const app: RunningApp = { pid: null, kill: () => {} };

  const reportExit = (code: number | null) => {
    if (exitReported) return;
    exitReported = true;
    logger.info(`App ${exeOnly} exited with code ${code}`);
    handlers.onExit?.(code);
  };

  ps.stdout?.on("data", (buf: Buffer) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      const [tag, val] = line.trim().split(" ");
      if (tag === "LAUNCHED") {
        app.pid = parseInt(val) || null;
        logger.info(
          `[launcher] started ${exeOnly} (pid ${app.pid ?? "untracked"})`,
        );
        try {
          if (app.pid && app.pid > 0) {
            writeRunningFile({
              pid: app.pid,
              app: exeOnly,
              startedAt: Date.now(),
            });
          }
        } catch (e) {
          logger.warn("Failed to write running file for windowed app:", e);
        }
      } else if (tag === "READY") {
        handlers.onReady?.(val !== "0");
      } else if (tag === "DETACHED") {
        detached = true; // protocol URI: can't track exit
        handlers.onReady?.(true);
      } else if (tag === "EXITED") {
        try {
          removeRunningFile();
        } catch (e) {}
        reportExit(parseInt(val) || 0);
      } else if (tag === "ERROR") {
        logger.error(`[launcher] ${line}`);
        reportExit(-1);
      }
    }
  });

  ps.stderr?.on("data", (d) => logger.warn("[launcher]", d.toString().trim()));
  ps.on("exit", () => {
    if (!detached) {
      try {
        removeRunningFile();
      } catch {}
      reportExit(null);
    } // PS died unexpectedly → treat as closed
  });

  app.kill = () => {
    if (app.pid) {
      try {
        execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" });
      } catch {}
    }
    try {
      ps.kill();
    } catch {}
  };

  return app;
}
