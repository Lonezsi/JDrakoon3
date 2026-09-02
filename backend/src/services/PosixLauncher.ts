import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import logger from "../utils/logger";
import { isMac } from "../platform";
import { writeRunningFile, removeRunningFile } from "./RunningFile";
import type { RunningApp } from "./WindowedLauncher";

// ---------------------------------------------------------------
// macOS / Linux app launcher — the cross-platform counterpart to
// WindowedLauncher (Windows). There's no portable equivalent of the Win32
// window-foreground dance, so this is simpler:
//
//   • protocol URI (steam://, http(s)://) → open / xdg-open, detached
//     (the handler process can't be tracked → report ready, no exit tracking)
//   • .app bundle (mac) → `open -W <app>` so we get a trackable wait
//   • plain executable → spawn directly and track its exit
// ---------------------------------------------------------------

const PROTOCOL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const ABS_PATH_RE = /^[\\/]/;

export function launchPosixApp(
  rawTarget: string,
  handlers: {
    onReady?: (focused: boolean) => void;
    onExit?: (code: number | null) => void;
  },
): RunningApp {
  const raw = rawTarget.trim();
  const app: RunningApp = { pid: null, kill: () => {} };
  let child: ChildProcess | null = null;
  let exitReported = false;

  const reportExit = (code: number | null) => {
    if (exitReported) return;
    exitReported = true;
    try {
      removeRunningFile();
    } catch {}
    logger.info(`App ${raw} exited with code ${code}`);
    handlers.onExit?.(code);
  };

  // Protocol URIs (steam://) and non-path targets → hand off to the OS opener.
  // These detach, so we can't observe their lifetime; report ready immediately.
  const isProtocol = PROTOCOL_RE.test(raw) && !ABS_PATH_RE.test(raw);
  const isAppBundle = isMac && raw.endsWith(".app");
  const isExistingPath = ABS_PATH_RE.test(raw) && fs.existsSync(raw.split(/\s+/)[0]);

  try {
    if (isProtocol) {
      const opener = isMac ? "open" : "xdg-open";
      child = spawn(opener, [raw], { detached: true, stdio: "ignore" });
      child.unref();
      logger.info(`[launcher] opened protocol ${raw} via ${opener} (detached)`);
      handlers.onReady?.(true);
      return app; // no pid, no exit tracking
    }

    const parts = raw.split(/\s+/);
    const exe = parts[0];
    const isBareCommand = !!exe && !/[\\/]/.test(exe); // e.g. "firefox %U" → "firefox"

    if (isAppBundle) {
      // `open -W` blocks until the app quits → we can report exit.
      child = spawn("open", ["-W", raw], { stdio: "ignore" });
    } else if (isExistingPath || isBareCommand) {
      // An absolute exe, or a command resolved via PATH (cleaned .desktop Exec).
      child = spawn(exe, parts.slice(1), { stdio: "ignore" });
    } else {
      // Last resort: hand the whole string to the desktop opener.
      const opener = isMac ? "open" : "xdg-open";
      child = spawn(opener, [raw], { detached: true, stdio: "ignore" });
      child.unref();
      handlers.onReady?.(true);
      return app;
    }
  } catch (e) {
    logger.error(`[launcher] failed to launch ${raw}: ${(e as Error).message}`);
    reportExit(-1);
    return app;
  }

  app.pid = child.pid ?? null;
  if (app.pid) {
    try {
      writeRunningFile({ pid: app.pid, app: raw, startedAt: Date.now() });
    } catch {}
  }
  logger.info(`[launcher] started ${raw} (pid ${app.pid ?? "untracked"})`);
  // No portable "main window ready" signal; treat spawn as ready.
  handlers.onReady?.(true);

  child.on("exit", (code) => reportExit(code));
  child.on("error", (err) => {
    logger.error(`[launcher] ${raw} error: ${err.message}`);
    reportExit(-1);
  });

  app.kill = () => {
    try {
      if (child && child.pid) process.kill(child.pid, "SIGTERM");
    } catch {}
  };

  return app;
}
