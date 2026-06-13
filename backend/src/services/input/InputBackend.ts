// ---------------------------------------------------------------
// Platform-agnostic contract for driving the real OS mouse/keyboard.
// InputControlService keeps the high-level concerns (move coalescing,
// key-name normalization, combo parsing) and delegates these low-level
// primitives to a per-OS backend (Windows PowerShell, Linux xdotool,
// macOS osascript/cliclick).
// ---------------------------------------------------------------

/** Canonical special-key names the service emits to a backend. Printable text
 *  goes through `type()`, never here. */
export type KeyName =
  | "ESC"
  | "ENTER"
  | "WIN"
  | "ALTTAB"
  | "BACKSPACE"
  | "UP"
  | "DOWN"
  | "LEFT"
  | "RIGHT"
  | "SPACE"
  | "TAB"
  | "DELETE"
  | "HOME"
  | "END"
  | "PAGEUP"
  | "PAGEDOWN"
  | "INSERT"
  | "F1"
  | "F2"
  | "F3"
  | "F4"
  | "F5"
  | "F6"
  | "F7"
  | "F8"
  | "F9"
  | "F10"
  | "F11"
  | "F12";

export interface InputBackend {
  /** False when this OS has no usable driver (or its helper isn't installed),
   *  so the service can no-op cleanly instead of erroring per event. */
  readonly enabled: boolean;

  /** Pre-warm any long-lived helper so the first real input isn't delayed. */
  warm(): void;

  /** Relative mouse move. The service already coalesces these per tick. */
  move(dx: number, dy: number): void;
  click(button: "left" | "right"): void;
  mouseDown(): void;
  mouseUp(): void;
  scroll(amount: number): void;

  /** Tap a single special key (printable characters go through type()). */
  tapKey(name: KeyName): void;
  type(text: string): void;

  /** Hold `mods` (e.g. ["ctrl","shift"]) while tapping `key` (e.g. "c"). */
  combo(mods: string[], key: string): void;
}
