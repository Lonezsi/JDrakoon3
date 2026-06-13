import type { DeviceAction } from "../../shared/types";
import { deviceSettings } from "../../services/deviceSettings";
import { sourceActive } from "../../services/gamepadSource";

type ActionCallback = (actions: DeviceAction[]) => void;

// The two local keyboard slots. Their bindings come from each device's
// mapping profile (settings.input.mappings) — "WASD" / "UHJK" by default.
const KEYBOARDS = [
  { deviceId: "keyboard1", playerId: "AWSD" },
  { deviceId: "keyboard2", playerId: "UHJK" },
] as const;

export class InputManager {
  private keys = new Map<string, boolean>();
  private listeners: ActionCallback[] = [];

  // Gamepad
  private rafId: number | null = null;
  // Previous edge-triggered button state per gamepad (jump / back fire once
  // per press, unlike nav/confirm which repeat while held).
  private prevGamepadJump = new Map<number, boolean>();
  private prevGamepadBack = new Map<number, boolean>();

  private externalActions: DeviceAction[] = [];

  // ─── Start / Stop ──────────────────────────────────────
  start() {
    // Per-device settings (#11): load the enabled/deadzone/mapping state and
    // make sure the always-present keyboard slots are editable in Settings.
    deviceSettings.init();
    deviceSettings.register("keyboard1");
    deviceSettings.register("keyboard2");

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      this.keys.set(key, true);
      // Edge-triggered actions (fire once per press, ignore auto-repeat).
      if (!e.repeat) {
        for (const kb of KEYBOARDS) {
          const m = deviceSettings.mapping(kb.deviceId);
          if (m.keys.jump && key === m.keys.jump) {
            this.externalActions.push({
              type: "jump",
              playerId: kb.playerId,
              deviceId: kb.deviceId,
              deviceType: "keyboard",
              value: true,
            });
          }
          if (m.keys.back && key === m.keys.back) {
            this.externalActions.push({
              type: "back",
              playerId: kb.playerId,
              deviceId: kb.deviceId,
              deviceType: "keyboard",
              value: true,
            });
          }
        }
      }
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

    // ===== KEYBOARDS (bindings from each slot's mapping profile) =====
    for (const kb of KEYBOARDS) {
      const m = deviceSettings.mapping(kb.deviceId);
      const down = (k: string) => !!k && !!this.keys.get(k);

      // Movement (continuous)
      let x = 0,
        y = 0;
      if (down(m.keys.moveUp)) y -= 1;
      if (down(m.keys.moveDown)) y += 1;
      if (down(m.keys.moveLeft)) x -= 1;
      if (down(m.keys.moveRight)) x += 1;
      actions.push({
        type: "move",
        playerId: kb.playerId,
        deviceId: kb.deviceId,
        deviceType: "keyboard",
        value: { x, y },
      });

      // Navigation / confirm (fire every frame while held — repeat handling
      // lives downstream). back/jump are edge-triggered in onKeyDown.
      const navs: [string, "left" | "right" | "up" | "down"][] = [
        [m.keys.navLeft, "left"],
        [m.keys.navRight, "right"],
        [m.keys.navUp, "up"],
        [m.keys.navDown, "down"],
      ];
      for (const [key, direction] of navs) {
        if (down(key)) {
          actions.push({
            type: "navigate",
            playerId: kb.playerId,
            deviceId: kb.deviceId,
            deviceType: "keyboard",
            value: { direction },
          });
        }
      }
      if (down(m.keys.confirm)) {
        actions.push({
          type: "confirm",
          playerId: kb.playerId,
          deviceId: kb.deviceId,
          deviceType: "keyboard",
          value: true,
        });
      }
    }

    // ===== GAMEPADS (all connected; bindings from each pad's mapping) =====
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp) continue;

      const playerId = `gp${gp.index}`; // unique per controller
      const deviceId = `gamepad-${gp.index}`;
      // First sighting → settings row appears for this pad (no-op afterwards).
      deviceSettings.register(deviceId);

      const m = deviceSettings.mapping(deviceId);
      // A logical control is "active" if its bound source fires. Sources may be
      // a button index, an axis-half, or a POV hat (non-standard pads), so this
      // goes through sourceActive rather than a raw button lookup.
      const act = (control: string) => sourceActive(gp, m.buttons[control]);

      // Movement (move stick). Deadzone matters: sticks rest at ~0.01–0.1,
      // never exactly 0, so without it the cube never registers as "stopped"
      // (no snap-stop, no settle, and the release logic never runs).
      // Threshold is per-device (settings.input.devices.<id>.deadzone).
      const threshold = deviceSettings.deadzone(deviceId);
      const dz = (v: number) => (Math.abs(v) < threshold ? 0 : v);
      const [mx, my] = m.axes.move;
      const lx = mx >= 0 ? dz(gp.axes[mx] ?? 0) : 0;
      const ly = my >= 0 ? dz(gp.axes[my] ?? 0) : 0;
      actions.push({
        type: "move",
        playerId,
        deviceId,
        deviceType: "gamepad",
        value: { x: lx, y: ly },
      });

      // Spin stick → rotate the cube (matches the phone's right stick).
      const [sx, sy] = m.axes.spin;
      const rx = sx >= 0 ? dz(gp.axes[sx] ?? 0) : 0;
      const ry = sy >= 0 ? dz(gp.axes[sy] ?? 0) : 0;
      if (rx !== 0 || ry !== 0) {
        actions.push({
          type: "spin",
          playerId,
          deviceId,
          deviceType: "gamepad",
          value: { x: rx, y: ry },
        });
      }

      // D-pad / confirm (still fire every frame while pressed)
      const navs: [string, "left" | "right" | "up" | "down"][] = [
        ["navLeft", "left"],
        ["navRight", "right"],
        ["navUp", "up"],
        ["navDown", "down"],
      ];
      for (const [control, direction] of navs) {
        if (act(control)) {
          actions.push({
            type: "navigate",
            playerId,
            deviceId,
            deviceType: "gamepad",
            value: { direction },
          });
        }
      }
      if (act("confirm")) {
        actions.push({
          type: "confirm",
          playerId,
          deviceId,
          deviceType: "gamepad",
          value: true,
        });
      }

      // Jump / back — edge-triggered so they fire once per press.
      const jumpNow = act("jump");
      if (jumpNow && !this.prevGamepadJump.get(gp.index)) {
        actions.push({
          type: "jump",
          playerId,
          deviceId,
          deviceType: "gamepad",
          value: true,
        });
      }
      this.prevGamepadJump.set(gp.index, jumpNow);

      const backNow = act("back");
      if (backNow && !this.prevGamepadBack.get(gp.index)) {
        actions.push({
          type: "back",
          playerId,
          deviceId,
          deviceType: "gamepad",
          value: true,
        });
      }
      this.prevGamepadBack.set(gp.index, backNow);
    }

    // External actions
    actions.push(...this.externalActions);
    this.externalActions = [];

    // Drop everything from disabled devices in one place — covers movement,
    // navigation, confirm AND the edge-triggered jumps injected via
    // externalActions, without per-block checks above.
    const live = actions.filter((a) => deviceSettings.isEnabled(a.deviceId));

    // Notify listeners
    this.listeners.forEach((cb) => cb(live));
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
