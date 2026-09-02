import { createInputBackend, InputBackend } from "./input";
import { isWindows } from "../platform";
import { KeyName } from "./input/InputBackend";

// ---------------------------------------------------------------
// Drives the real OS mouse/keyboard so the phone's touchpad can control the PC.
//
// This class owns the platform-agnostic concerns — coalescing high-frequency
// mouse moves, normalizing key names, parsing combo specs — and delegates the
// actual OS calls to a per-platform InputBackend (Windows PowerShell driver,
// Linux xdotool/ydotool, macOS osascript/cliclick). See ./input.
// ---------------------------------------------------------------

const KEY_ALIASES: Record<string, KeyName> = {
  ESC: "ESC",
  ESCAPE: "ESC",
  ENTER: "ENTER",
  RETURN: "ENTER",
  WIN: "WIN",
  ALTTAB: "ALTTAB",
  BACKSPACE: "BACKSPACE",
  BKSP: "BACKSPACE",
  UP: "UP",
  ARROWUP: "UP",
  DOWN: "DOWN",
  ARROWDOWN: "DOWN",
  LEFT: "LEFT",
  ARROWLEFT: "LEFT",
  RIGHT: "RIGHT",
  ARROWRIGHT: "RIGHT",
  SPACE: "SPACE",
  TAB: "TAB",
  DELETE: "DELETE",
  DEL: "DELETE",
  HOME: "HOME",
  END: "END",
  PAGEUP: "PAGEUP",
  PAGEDOWN: "PAGEDOWN",
  INSERT: "INSERT",
  F1: "F1",
  F2: "F2",
  F3: "F3",
  F4: "F4",
  F5: "F5",
  F6: "F6",
  F7: "F7",
  F8: "F8",
  F9: "F9",
  F10: "F10",
  F11: "F11",
  F12: "F12",
};

class InputControlService {
  private backend: InputBackend = createInputBackend();
  private get enabled() {
    return this.backend.enabled;
  }

  // Mouse moves arrive at touch frequency; coalesce them so we issue at most
  // one move per tick instead of flooding the OS driver. (On Windows the driver
  // is a single pipe; on Linux/mac each move is a quick spawn — coalescing
  // matters even more there.)
  private pendingDx = 0;
  private pendingDy = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  // A little slower off Windows, where every move is a fresh xdotool/cliclick
  // spawn rather than a write to a long-lived pipe.
  private readonly flushMs = isWindows ? 8 : 16;

  /** Pre-spawn any long-lived helper so the FIRST real input isn't delayed by
   *  its startup (that was the "first touch feels laggy" bug). */
  warm() {
    this.backend.warm();
  }

  move(dx: number, dy: number) {
    if (!this.enabled) return;
    this.pendingDx += dx;
    this.pendingDy += dy;
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushMove(), this.flushMs);
    }
  }

  private flushMove() {
    this.flushTimer = null;
    const dx = Math.round(this.pendingDx);
    const dy = Math.round(this.pendingDy);
    this.pendingDx = 0;
    this.pendingDy = 0;
    if (dx !== 0 || dy !== 0) this.backend.move(dx, dy);
  }

  click(button: "left" | "right") {
    if (!this.enabled) return;
    this.backend.click(button);
  }

  /** Hold / release the left button — used for touch click-and-drag. */
  mouseDown() {
    if (this.enabled) this.backend.mouseDown();
  }

  mouseUp() {
    if (this.enabled) this.backend.mouseUp();
  }

  scroll(amount: number) {
    if (this.enabled && amount !== 0) this.backend.scroll(amount);
  }

  key(raw: string) {
    if (!this.enabled) return;
    const k = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (k === "CLICK") return this.click("left");
    if (k === "RIGHTCLICK") return this.click("right");
    const name = KEY_ALIASES[k];
    if (name) this.backend.tapKey(name);
    // unknown key names are ignored
  }

  text(str: string) {
    if (this.enabled && str) this.backend.type(str);
  }

  /** Send a key combo like "ctrl+c", "ctrl shift esc", "alt+f4".
   *  Modifiers are held while the final key taps. */
  combo(spec: string) {
    if (!this.enabled) return;
    const s = (spec || "").trim().toLowerCase();
    if (!s) return;
    // Tokens may be separated by space and/or '+'. The LAST token is the key,
    // everything before it is a modifier.
    const tokens = s.split(/[\s+]+/).filter(Boolean);
    if (tokens.length === 0) return;
    const key = tokens[tokens.length - 1];
    const mods = tokens.slice(0, -1);
    // A trailing mouse action (".ctrl click") holds the modifiers while
    // clicking, rather than tapping a (nonexistent) "click" key.
    const mouse: Record<string, "left" | "right"> = {
      click: "left",
      leftclick: "left",
      lclick: "left",
      rightclick: "right",
      rclick: "right",
      rightclic: "right",
    };
    if (mouse[key]) {
      this.backend.comboClick(mods, mouse[key]);
      return;
    }
    this.backend.combo(mods, key);
  }
}

export const inputControl = new InputControlService();
