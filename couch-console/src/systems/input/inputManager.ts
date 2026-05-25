import type { DeviceAction } from "../../shared/types";

type ActionCallback = (actions: DeviceAction[]) => void;

export class InputManager {
  private keys = new Map<string, boolean>();
  private listeners: ActionCallback[] = [];

  // Gamepad
  private rafId: number | null = null;
  private gamepadIndex: number | null = null;

  private externalActions: DeviceAction[] = [];

  // ─── Start / Stop ──────────────────────────────────────
  start() {
    const onKeyDown = (e: KeyboardEvent) => {
      this.keys.set(e.key.toLowerCase(), true);
      this.processInput();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.set(e.key.toLowerCase(), false);
      this.processInput();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const loop = () => {
      this.processInput();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (this.rafId) cancelAnimationFrame(this.rafId);
    };
  }

  injectActions(actions: DeviceAction[]) {
    this.externalActions.push(...actions);
    this.processInput();
  }

  // ─── Process all inputs each frame ──────────────────────
  private processInput() {
    const actions: DeviceAction[] = [];

    // ===== KEYBOARD MOVEMENT (continuous) =====
    let x1 = 0,
      y1 = 0;
    if (this.keys.get("w")) y1 -= 1;
    if (this.keys.get("s")) y1 += 1;
    if (this.keys.get("a")) x1 -= 1;
    if (this.keys.get("d")) x1 += 1;
    actions.push({
      type: "move",
      playerId: "p1",
      deviceId: "keyboard1",
      deviceType: "keyboard",
      value: { x: x1, y: y1 },
    });

    let x2 = 0,
      y2 = 0;
    if (this.keys.get("u")) y2 -= 1;
    if (this.keys.get("j")) y2 += 1;
    if (this.keys.get("h")) x2 -= 1;
    if (this.keys.get("k")) x2 += 1;
    actions.push({
      type: "move",
      playerId: "p2",
      deviceId: "keyboard2",
      deviceType: "keyboard",
      value: { x: x2, y: y2 },
    });

    // ===== KEYBOARD NAVIGATION (fires every frame while held) =====
    if (this.keys.get("arrowleft")) {
      actions.push({
        type: "navigate",
        deviceId: "keyboard1",
        deviceType: "keyboard",
        value: { direction: "left" },
      });
    }
    if (this.keys.get("arrowright")) {
      actions.push({
        type: "navigate",
        deviceId: "keyboard1",
        deviceType: "keyboard",
        value: { direction: "right" },
      });
    }
    if (this.keys.get("enter")) {
      actions.push({
        type: "confirm",
        deviceId: "keyboard1",
        deviceType: "keyboard",
        value: true,
      });
    }
    // ===== GAMEPAD (all connected) =====
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp) continue;

      const playerId = `gp${gp.index}`; // unique per controller

      // Movement (left stick)
      const lx = gp.axes[0] ?? 0;
      const ly = gp.axes[1] ?? 0;
      actions.push({
        type: "move",
        playerId,
        deviceId: `gamepad-${gp.index}`,
        deviceType: "gamepad",
        value: { x: lx, y: ly },
      });

      // D‑pad / A button (still fires every frame while pressed)
      if (gp.buttons[14]?.pressed) {
        actions.push({
          type: "navigate",
          deviceId: `gamepad-${gp.index}`,
          deviceType: "gamepad",
          value: { direction: "left" },
        });
      }
      if (gp.buttons[15]?.pressed) {
        actions.push({
          type: "navigate",
          deviceId: `gamepad-${gp.index}`,
          deviceType: "gamepad",
          value: { direction: "right" },
        });
      }
      if (gp.buttons[0]?.pressed) {
        actions.push({
          type: "confirm",
          deviceId: `gamepad-${gp.index}`,
          deviceType: "gamepad",
          value: true,
        });
      }
    }

    // External actions
    actions.push(...this.externalActions);
    this.externalActions = [];

    // Notify listeners
    this.listeners.forEach((cb) => cb(actions));
  }

  // ─── Subscribe ─────────────────────────────────────────
  onActions(cb: ActionCallback) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }
}

export const inputManager = new InputManager();
