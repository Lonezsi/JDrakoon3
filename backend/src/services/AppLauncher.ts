import { spawn, ChildProcess } from "child_process";
import logger from "../utils/logger";
import { AppEntry } from "../models/types";
import { broadcast } from "../websocket/broadcast";
import { writeRunningFile, removeRunningFile } from "./RunningFile";

class AppLauncher {
  private currentProcess: ChildProcess | null = null;
  private currentAppId: string | null = null;
  private onExitCallbacks: ((appId: string, code: number | null) => void)[] =
    [];

  async launch(app: AppEntry): Promise<boolean> {
    if (this.currentProcess) {
      logger.warn("App already running, please close first");
      return false;
    }

    return new Promise((resolve) => {
      try {
        const proc = spawn(app.path, app.args, {
          detached: false,
          stdio: "ignore",
          windowsHide: false,
        });
        this.currentProcess = proc;
        this.currentAppId = app.id;

        try {
          writeRunningFile({
            pid: proc.pid!,
            app: app.id,
            startedAt: Date.now(),
          });
          broadcast("mode-change", {
            mode: "app-running",
            pid: proc.pid,
            app: app.id,
          });
        } catch (e) {
          logger.warn("Failed to write running file:", e);
        }

        proc.on("exit", (code) => {
          logger.info(`App ${app.id} exited with code ${code}`);
          this.currentProcess = null;
          const id = this.currentAppId;
          this.currentAppId = null;
          try {
            removeRunningFile();
          } catch (err) {}
          broadcast("mode-change", { mode: "normal" });
          this.onExitCallbacks.forEach((cb) => cb(id!, code));
        });

        proc.on("error", (err) => {
          logger.error(`Failed to launch ${app.id}:`, err);
          this.currentProcess = null;
          this.currentAppId = null;
          try {
            removeRunningFile();
          } catch (e) {}
          broadcast("mode-change", { mode: "normal" });
          resolve(false);
        });

        resolve(true);
      } catch (err) {
        logger.error(`Exception launching ${app.id}:`, err);
        try {
          removeRunningFile();
        } catch {}
        resolve(false);
      }
    });
  }

  async close(): Promise<void> {
    if (this.currentProcess) {
      try {
        this.currentProcess.kill();
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        if (this.currentProcess && !this.currentProcess.killed) {
          this.currentProcess.kill("SIGKILL");
        }
      } catch {}
      this.currentProcess = null;
      this.currentAppId = null;
    }

    try {
      removeRunningFile();
    } catch (e) {}
    broadcast("mode-change", { mode: "normal" });
  }

  onExit(cb: (appId: string, code: number | null) => void) {
    this.onExitCallbacks.push(cb);
  }

  isRunning(): boolean {
    return this.currentProcess !== null;
  }

  getCurrentAppId(): string | null {
    return this.currentAppId;
  }
}

export const appLauncher = new AppLauncher();
