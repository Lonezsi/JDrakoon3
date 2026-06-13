import { subscribe } from "./socket";

// ---------------------------------------------------------------
// Per-device input settings (settings.input.devices.<id>), consumed
// synchronously by the inputManager every frame:
//   enabled  — a disabled device's actions are dropped entirely
//   deadzone — stick deadzone for gamepads (keyboards ignore it)
//   mapping  — name of the control-mapping profile to use
//
// Mapping profiles live in settings.input.mappings.<name> and bind logical
// actions (moveUp, navLeft, confirm, jump, …) to physical inputs — keyboard
// keys, gamepad button indices, or stick axes pairs. Built-in profiles
// ("Gamepad", "WASD", "UHJK") replicate the historical hardcoded bindings.
//
// Devices are REGISTERED here the first time the console sees them, so the
// Settings modal grows one row-group per real device instead of showing a
// hypothetical list. Registration only writes when the id is unknown — a
// normal boot with known devices never touches settings.
// ---------------------------------------------------------------

export interface DeviceInputConfig {
  enabled: boolean;
  deadzone: number;
  mapping?: string;
}

export interface InputMapping {
  type: "gamepad" | "keyboard";
  // A number is a button index; a string is an axis-half ("a3+") or POV hat
  // ("h9:-1.000") for non-standard pads. See services/gamepadSource.
  buttons: Record<string, number | string>;
  keys: Record<string, string>;
  axes: { move: [number, number]; spin: [number, number] };
}

// Matches the hardcoded value gamepads used before this existed — so adding
// the setting changes nothing until the user actually edits it.
const DEFAULT_DEADZONE = 0.15;

/** Which built-in profile a device falls back to when none is assigned. */
export function defaultProfileFor(deviceId: string): string {
  if (deviceId === "keyboard2") return "UHJK";
  if (deviceId.startsWith("keyboard")) return "WASD";
  return "Gamepad";
}

export function deviceKind(deviceId: string): "gamepad" | "keyboard" {
  return deviceId.startsWith("keyboard") ? "keyboard" : "gamepad";
}

/** Lobby player id ⇄ input device id. Phones return null (no OS mapping). */
export function playerToDeviceId(playerId: string): string | null {
  if (playerId === "AWSD") return "keyboard1";
  if (playerId === "UHJK") return "keyboard2";
  if (playerId.startsWith("gp")) return `gamepad-${playerId.slice(2)}`;
  return null;
}

// Last-resort empty mapping if settings haven't loaded yet.
const EMPTY_MAPPING: InputMapping = {
  type: "keyboard",
  buttons: {},
  keys: {},
  axes: { move: [-1, -1], spin: [-1, -1] },
};

class DeviceSettings {
  private devices: Record<string, DeviceInputConfig> = {};
  private mappings: Record<string, InputMapping> = {};
  private requested = new Set<string>();
  private started = false;

  init() {
    if (this.started) return;
    this.started = true;
    this.load();
    // Settings edits broadcast live (settings_updated) — refetch the
    // authoritative state instead of trusting the payload shape.
    subscribe((msg) => {
      if (msg.type === "settings_updated") this.load();
    });
  }

  private load() {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        this.devices = s?.input?.devices || {};
        this.mappings = s?.input?.mappings || {};
      })
      .catch(() => {});
  }

  /** Make sure a device id exists in settings so it's editable in the modal.
   *  No-op if it's already known (or a registration is already in flight). */
  register(deviceId: string) {
    if (!deviceId || this.devices[deviceId] || this.requested.has(deviceId))
      return;
    this.requested.add(deviceId);
    const cfg: DeviceInputConfig = { enabled: true, deadzone: DEFAULT_DEADZONE };
    this.devices[deviceId] = cfg; // optimistic — usable this frame
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { devices: { [deviceId]: cfg } } }),
    }).catch(() => {});
  }

  isEnabled(deviceId: string): boolean {
    const cfg = this.devices[deviceId];
    return cfg ? cfg.enabled !== false : true; // unknown devices stay live
  }

  deadzone(deviceId: string): number {
    const dz = this.devices[deviceId]?.deadzone;
    return typeof dz === "number" && dz >= 0 && dz < 1 ? dz : DEFAULT_DEADZONE;
  }

  /** The mapping profile a device should use right now (assigned → fallback
   *  built-in for its kind → empty). Sync — called every frame. */
  mapping(deviceId: string): InputMapping {
    const kind = deviceKind(deviceId);
    const assigned = this.devices[deviceId]?.mapping;
    const m =
      (assigned && this.mappings[assigned]) ||
      this.mappings[defaultProfileFor(deviceId)];
    return m && m.type === kind ? m : EMPTY_MAPPING;
  }
}

export const deviceSettings = new DeviceSettings();
