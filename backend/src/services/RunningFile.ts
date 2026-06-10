import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { RUNNING_FILE } from "../config/constants";

export interface RunningState {
  running: boolean;
  pid: number;
  app: string | null;
  startedAt: number;
}

export function writeRunningFile(payload: {
  pid: number;
  app?: string | null;
  startedAt?: number;
}) {
  const dir = path.dirname(RUNNING_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const obj = {
    running: true,
    pid: payload.pid,
    app: payload.app ?? null,
    startedAt: payload.startedAt ?? Date.now(),
  };
  fs.writeFileSync(RUNNING_FILE, JSON.stringify(obj));
}

export function readRunningFile(): RunningState | null {
  try {
    if (!fs.existsSync(RUNNING_FILE)) return null;
    const raw = fs.readFileSync(RUNNING_FILE, "utf-8") || "";
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.pid !== "number") return null;
    return {
      running: !!data.running,
      pid: Number(data.pid),
      app: data.app ?? null,
      startedAt: Number(data.startedAt || 0),
    };
  } catch (e) {
    return null;
  }
}

export function removeRunningFile() {
  try {
    if (fs.existsSync(RUNNING_FILE)) fs.unlinkSync(RUNNING_FILE);
  } catch (e) {}
}

export function isPidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isProcessNameRunning(appPathOrName: string | null) {
  try {
    if (!appPathOrName) return false;
    const name = path.basename(appPathOrName).toLowerCase();
    if (!name) return false;
    if (process.platform === "win32") {
      const cmd = `tasklist /FI "IMAGENAME eq ${name}" /FO CSV /NH`;
      const out = execSync(cmd, { encoding: "utf8" });
      if (!out) return false;
      return out.toLowerCase().includes(name.toLowerCase());
    } else {
      const out = execSync(`pgrep -f ${name}`, { encoding: "utf8" });
      return !!out.trim();
    }
  } catch (e) {
    return false;
  }
}

export function validateRunningFileStartup(): {
  existed: boolean;
  removed: boolean;
  pid?: number;
} {
  const cur = readRunningFile();
  if (!cur) return { existed: false, removed: false };

  // If the PID is missing or dead, check whether an instance still exists
  // by executable name (handles launchers that spawn and exit).
  if (!cur.pid || !isPidAlive(cur.pid)) {
    if (isProcessNameRunning(cur.app)) {
      // Process exists by name — consider it still running
      return { existed: true, removed: false, pid: cur.pid };
    }

    try {
      removeRunningFile();
    } catch {}
    return { existed: true, removed: true, pid: cur.pid };
  }
  return { existed: true, removed: false, pid: cur.pid };
}
