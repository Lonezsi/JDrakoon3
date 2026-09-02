import { spawn, ChildProcess, execSync } from "child_process";
import fs from "fs";
import path from "path";
import logger from "../utils/logger";
import { writeRunningFile, removeRunningFile } from "./RunningFile";

// Launches a target (exe path or protocol URI like steam://) via a
// long-lived PowerShell that reports lifecycle markers on stdout:
//   LAUNCHED <pid>   the process WE started (often just a bootstrapper)
//   TRACK <pid>      the REAL app window's process we'll actually track + kill
//   READY <hwnd>     that window exists and was foregrounded
//   DETACHED         no app window ever appeared; can't track exit
//   EXITED <code>    the tracked process closed
//
// Why TRACK matters: games are frequently launched through a launcher (Steam,
// Epic, a bootstrapper .exe, or a steam:// URI). The process WE spawn exits or
// detaches while the actual game runs as a SEPARATE process — so tracking the
// spawned PID falsely reports "closed", and a steam:// URI gives us no PID at
// all (uncloseable). Instead we snapshot the windowed processes before launch,
// then watch for a NEW one to take the foreground and stay there — that's the
// real app. We track and kill THAT pid (and its tree).
const PS_SCRIPT_TEMPLATE = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@

# NOTE: $pid / $args are RESERVED automatic vars — we read $PID (own id) but
# never assign them; our own vars are $procArgs / $procId etc.
$raw = '<RAW>'
$exe = '<EXE>'
$procArgs = '<ARGS>'
$myPid = $PID

# Protocol launchers (steam://, com.epicgames.launcher://, …) all use '://'.
$isProtocol = $raw -match '://'

# Snapshot processes that already own a top-level window, so we can spot the
# NEW one the launch produces (even if a different process than we spawn).
$before = @{}
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $before[$_.Id] = $true }

$spawned = $null
if ($isProtocol) {
  Start-Process $raw
  Write-Output 'LAUNCHED 0'
} else {
  if ($procArgs -and $procArgs -ne '') {
    $spawned = Start-Process -FilePath $exe -ArgumentList $procArgs -PassThru -ErrorAction Stop
  } else {
    $spawned = Start-Process -FilePath $exe -PassThru -ErrorAction Stop
  }
  if (-not $spawned) { Write-Output 'ERROR spawn_failed'; exit 1 }
  Write-Output ('LAUNCHED ' + $spawned.Id)
}

# Find the real app: poll up to ~45s for a NEW windowed process that holds the
# foreground for ~1s (avoids latching onto a launcher splash that flashes by).
$gamePid = 0
$hwnd = [IntPtr]::Zero
$stableId = 0
$stableCount = 0
for ($i = 0; $i -lt 180; $i++) {
  Start-Sleep -Milliseconds 250

  $fg = [Win32]::GetForegroundWindow()
  $fgPid = [uint32]0
  if ($fg -ne [IntPtr]::Zero) { [Win32]::GetWindowThreadProcessId($fg, [ref]$fgPid) | Out-Null }

  if ($fgPid -ne 0 -and -not $before.ContainsKey([int]$fgPid) -and [int]$fgPid -ne $myPid) {
    if ([int]$fgPid -eq $stableId) { $stableCount++ } else { $stableId = [int]$fgPid; $stableCount = 1 }
    if ($stableCount -ge 4) {
      $gp = Get-Process -Id ([int]$fgPid) -ErrorAction SilentlyContinue
      if ($gp) { $gamePid = [int]$fgPid; $hwnd = $gp.MainWindowHandle; break }
    }
  } else {
    $stableCount = 0
  }

  # Direct-exe fallback: if the process we spawned itself shows a window and
  # nothing else has grabbed the foreground, track it.
  if (-not $isProtocol -and $spawned) {
    $spawned.Refresh()
    if ($spawned.HasExited) {
      # Bootstrapper already gone — keep looking for the new window it spawned.
    } elseif ($spawned.MainWindowHandle -ne 0 -and $i -gt 6) {
      $gamePid = $spawned.Id; $hwnd = $spawned.MainWindowHandle; break
    }
  }
}

if ($gamePid -eq 0) {
  Write-Output 'DETACHED'
  exit 0
}

Write-Output ('TRACK ' + $gamePid)

if ($hwnd -ne [IntPtr]::Zero) {
  # Foreground-lock workaround: tap Alt so Windows lets us steal focus.
  $shell = New-Object -ComObject WScript.Shell
  for ($i = 0; $i -lt 8; $i++) {
    $shell.SendKeys('%')
    [Win32]::ShowWindow($hwnd, 9) | Out-Null
    [Win32]::SetForegroundWindow($hwnd) | Out-Null
    Start-Sleep -Milliseconds 250
    if ([Win32]::GetForegroundWindow() -eq $hwnd) { break }
  }
}
Write-Output ('READY ' + $hwnd)

$gp = Get-Process -Id $gamePid -ErrorAction SilentlyContinue
if ($gp) { $gp.WaitForExit(); Write-Output ('EXITED ' + $gp.ExitCode) }
else { Write-Output 'EXITED 0' }
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
  } else if (fs.existsSync(raw)) {
    // An unquoted path that exists as-is (e.g. "C:\Program Files\app.exe" or a
    // .lnk with spaces) must NOT be split on whitespace — it's the whole exe.
    exeOnly = raw;
    argsOnly = "";
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
        // The process we spawned — may just be a bootstrapper. TRACK overrides
        // this with the real window's pid once it's found.
        app.pid = parseInt(val) || null;
        logger.info(
          `[launcher] spawned ${exeOnly} (pid ${app.pid ?? "detached"})`,
        );
      } else if (tag === "TRACK") {
        // The real app-window process — this is what we kill + watch for exit.
        const realPid = parseInt(val) || null;
        if (realPid && realPid > 0) {
          app.pid = realPid;
          logger.info(`[launcher] tracking ${exeOnly} window pid ${realPid}`);
          try {
            writeRunningFile({ pid: realPid, app: exeOnly, startedAt: Date.now() });
          } catch (e) {
            logger.warn("Failed to write running file for windowed app:", e);
          }
        }
      } else if (tag === "READY") {
        handlers.onReady?.(val !== "0");
      } else if (tag === "DETACHED") {
        // No app window ever appeared (e.g. a launcher that only updates, or a
        // background task). We can't track its exit, but report ready so the UI
        // doesn't hang on the loading overlay.
        detached = true;
        logger.warn(`[launcher] ${exeOnly}: no window found — exit can't be tracked`);
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
