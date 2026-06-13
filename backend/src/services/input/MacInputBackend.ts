import { execFile } from "child_process";
import logger from "../../utils/logger";
import { commandExists } from "../../platform";
import { InputBackend, KeyName } from "./InputBackend";

// ---------------------------------------------------------------
// macOS input backend.
//   • Keyboard + text → AppleScript (`osascript` → System Events). Requires the
//     backend process to have Accessibility permission (System Settings →
//     Privacy & Security → Accessibility) — the OS prompts on first use.
//   • Mouse move/click → `cliclick` if installed (`brew install cliclick`).
//     AppleScript can't move the cursor, so without cliclick the mouse is
//     disabled but keys/text still work.
//
// Note: macOS shortcuts use Command, not Control. We map "ctrl" → Command so a
// phone's ".ctrl c" does the expected copy; use ".control c" for literal ⌃.
// ---------------------------------------------------------------

// KeyName → macOS virtual key code (for `key code N`).
const MAC_KEYCODE: Partial<Record<KeyName, number>> = {
  ESC: 53,
  ENTER: 36,
  BACKSPACE: 51,
  UP: 126,
  DOWN: 125,
  LEFT: 123,
  RIGHT: 124,
  SPACE: 49,
  TAB: 48,
  DELETE: 117,
  HOME: 115,
  END: 119,
  PAGEUP: 116,
  PAGEDOWN: 121,
  INSERT: 114, // "help" key slot — closest analogue
  F1: 122,
  F2: 120,
  F3: 99,
  F4: 118,
  F5: 96,
  F6: 97,
  F7: 98,
  F8: 100,
  F9: 101,
  F10: 109,
  F11: 103,
  F12: 111,
};

const MOD_AS: Record<string, string> = {
  ctrl: "command down", // see note above
  control: "control down",
  shift: "shift down",
  alt: "option down",
  option: "option down",
  win: "command down",
  meta: "command down",
  cmd: "command down",
  command: "command down",
};

function asString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export class MacInputBackend implements InputBackend {
  enabled = true; // keys/text always available via osascript
  private hasCliclick: boolean;

  constructor() {
    this.hasCliclick = commandExists("cliclick");
    if (!this.hasCliclick) {
      logger.warn(
        "[inputControl] cliclick not found — phone mouse control disabled on macOS (keys/text still work). Install with: brew install cliclick",
      );
    }
    logger.info("[inputControl] macOS input driver: osascript" + (this.hasCliclick ? " + cliclick" : ""));
  }

  private osa(script: string) {
    execFile("osascript", ["-e", script], (err) => {
      if (err) logger.warn(`[inputControl] osascript failed: ${err.message}`);
    });
  }
  private cli(arg: string) {
    if (!this.hasCliclick) return;
    execFile("cliclick", [arg], (err) => {
      if (err) logger.warn(`[inputControl] cliclick failed: ${err.message}`);
    });
  }

  warm() {
    /* nothing to pre-spawn */
  }

  move(dx: number, dy: number) {
    this.cli(`m:+${dx},+${dy}`);
  }
  click(button: "left" | "right") {
    this.cli(button === "right" ? "rc:." : "c:.");
  }
  mouseDown() {
    this.cli("dd:.");
  }
  mouseUp() {
    this.cli("du:.");
  }
  scroll(_amount: number) {
    /* cliclick has no scroll primitive — unsupported on macOS */
  }

  tapKey(name: KeyName) {
    if (name === "ALTTAB") {
      this.osa('tell application "System Events" to key code 48 using command down');
      return;
    }
    if (name === "WIN") return; // bare Command tap is meaningless
    const code = MAC_KEYCODE[name];
    if (code === undefined) return;
    this.osa(`tell application "System Events" to key code ${code}`);
  }

  type(text: string) {
    this.osa(`tell application "System Events" to keystroke "${asString(text)}"`);
  }

  combo(mods: string[], key: string) {
    const using = mods
      .map((m) => MOD_AS[m.toLowerCase()])
      .filter(Boolean);
    const usingClause = using.length ? ` using {${using.join(", ")}}` : "";
    const k = key.toLowerCase();
    // Single printable char → keystroke; otherwise try a named special key.
    if (k.length === 1) {
      this.osa(
        `tell application "System Events" to keystroke "${asString(k)}"${usingClause}`,
      );
    } else {
      const code = MAC_KEYCODE[k.toUpperCase() as KeyName];
      if (code !== undefined)
        this.osa(`tell application "System Events" to key code ${code}${usingClause}`);
    }
  }
}
