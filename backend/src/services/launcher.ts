import { isWindows } from "../platform";
import { launchWindowedApp, RunningApp } from "./WindowedLauncher";
import { launchPosixApp } from "./PosixLauncher";

// Platform dispatcher for launching apps. Windows keeps the rich
// window-foregrounding launcher; macOS/Linux use the simpler opener.
export function launchApp(
  rawTarget: string,
  handlers: {
    onReady?: (focused: boolean) => void;
    onExit?: (code: number | null) => void;
  },
): RunningApp {
  return isWindows
    ? launchWindowedApp(rawTarget, handlers)
    : launchPosixApp(rawTarget, handlers);
}

export type { RunningApp } from "./WindowedLauncher";
