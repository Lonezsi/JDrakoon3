import { execFile } from "child_process";
import logger from "../../utils/logger";
import { commandExists } from "../../platform";
import { InputBackend, KeyName } from "./InputBackend";

// ---------------------------------------------------------------
// Linux input backend. Prefers `xdotool` (X11); falls back to `ydotool`
// (Wayland — needs the ydotoold daemon + uinput permissions). Each command
// is a quick spawn; the service already coalesces mouse moves so we're not
// spawning per raw touch event.
//
// Install on the host:  X11   →  sudo apt install xdotool
//                        Wayland→  sudo apt install ydotool  (and run ydotoold)
// ---------------------------------------------------------------

// KeyName → X keysym (xdotool `key`). ALTTAB is handled specially (combo).
const XDO_KEYSYM: Record<KeyName, string> = {
  ESC: "Escape",
  ENTER: "Return",
  WIN: "super",
  ALTTAB: "alt+Tab",
  BACKSPACE: "BackSpace",
  UP: "Up",
  DOWN: "Down",
  LEFT: "Left",
  RIGHT: "Right",
  SPACE: "space",
  TAB: "Tab",
  DELETE: "Delete",
  HOME: "Home",
  END: "End",
  PAGEUP: "Prior",
  PAGEDOWN: "Next",
  INSERT: "Insert",
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

const MOD_MAP: Record<string, string> = {
  ctrl: "ctrl",
  control: "ctrl",
  shift: "shift",
  alt: "alt",
  option: "alt",
  win: "super",
  meta: "super",
  cmd: "super",
  command: "super",
};

export class LinuxInputBackend implements InputBackend {
  enabled: boolean;
  private tool: "xdotool" | "ydotool" | null;

  constructor() {
    if (commandExists("xdotool")) this.tool = "xdotool";
    else if (commandExists("ydotool")) this.tool = "ydotool";
    else this.tool = null;
    this.enabled = this.tool !== null;
    if (!this.enabled) {
      logger.warn(
        "[inputControl] No xdotool/ydotool found — phone mouse/keyboard control is disabled. Install xdotool (X11) or ydotool (Wayland).",
      );
    } else {
      logger.info(`[inputControl] Linux input driver: ${this.tool}`);
    }
  }

  private run(args: string[]) {
    if (!this.tool) return;
    execFile(this.tool, args, (err) => {
      if (err) logger.warn(`[inputControl] ${this.tool} failed: ${err.message}`);
    });
  }

  warm() {
    /* nothing to pre-spawn — commands are short-lived */
  }

  move(dx: number, dy: number) {
    if (this.tool === "xdotool") this.run(["mousemove_relative", "--", String(dx), String(dy)]);
    else if (this.tool === "ydotool") this.run(["mousemove", "-x", String(dx), "-y", String(dy)]);
  }

  click(button: "left" | "right") {
    const n = button === "right" ? "3" : "1";
    if (this.tool === "xdotool") this.run(["click", n]);
    else this.run(["click", button === "right" ? "0xC1" : "0xC0"]);
  }

  mouseDown() {
    if (this.tool === "xdotool") this.run(["mousedown", "1"]);
    else this.run(["click", "0x40"]); // ydotool: press left
  }

  mouseUp() {
    if (this.tool === "xdotool") this.run(["mouseup", "1"]);
    else this.run(["click", "0x80"]); // ydotool: release left
  }

  scroll(amount: number) {
    const a = Math.round(amount);
    if (a === 0) return;
    // xdotool scrolls one "notch" per click: button 4 = up, 5 = down.
    const button = a < 0 ? "4" : "5";
    const notches = Math.min(Math.abs(a) || 1, 10);
    if (this.tool === "xdotool") {
      for (let i = 0; i < notches; i++) this.run(["click", button]);
    } else {
      this.run(["mousemove", "-w", "-x", "0", "-y", a < 0 ? "1" : "-1"]);
    }
  }

  tapKey(name: KeyName) {
    const sym = XDO_KEYSYM[name];
    if (!sym) return;
    this.run(["key", sym]);
  }

  type(text: string) {
    if (this.tool === "xdotool") this.run(["type", "--clearmodifiers", "--", text]);
    else this.run(["type", text]);
  }

  combo(mods: string[], key: string) {
    const parts = mods.map((m) => MOD_MAP[m.toLowerCase()]).filter(Boolean);
    const k = key.toLowerCase();
    const spec = [...parts, k].join("+");
    // xdotool and ydotool both accept "ctrl+c" style specs for `key`.
    this.run(["key", spec]);
  }
}
