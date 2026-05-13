import { spawn, ChildProcess } from 'child_process';
import logger from '../utils/logger';
import { AppEntry } from '../models/types';

class AppLauncher {
  private currentProcess: ChildProcess | null = null;
  private currentAppId: string | null = null;
  private onExitCallbacks: ((appId: string, code: number | null) => void)[] = [];

  async launch(app: AppEntry): Promise<boolean> {
    if (this.currentProcess) {
      logger.warn('App already running, please close first');
      return false;
    }

    return new Promise((resolve) => {
      try {
        const proc = spawn(app.path, app.args, {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        });
        proc.unref();
        this.currentProcess = proc;
        this.currentAppId = app.id;

        proc.on('exit', (code) => {
          logger.info(`App ${app.id} exited with code ${code}`);
          this.currentProcess = null;
          const id = this.currentAppId;
          this.currentAppId = null;
          this.onExitCallbacks.forEach(cb => cb(id!, code));
        });

        proc.on('error', (err) => {
          logger.error(`Failed to launch ${app.id}:`, err);
          this.currentProcess = null;
          this.currentAppId = null;
          resolve(false);
        });

        resolve(true);
      } catch (err) {
        logger.error(`Exception launching ${app.id}:`, err);
        resolve(false);
      }
    });
  }

  async close(): Promise<void> {
    if (this.currentProcess) {
      this.currentProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 500));
      if (this.currentProcess && !this.currentProcess.killed) {
        this.currentProcess.kill('SIGKILL');
      }
      this.currentProcess = null;
      this.currentAppId = null;
    }
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
