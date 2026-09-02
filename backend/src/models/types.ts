export interface Player {
  id: string;
  name: string;
  color: string;
  deviceType: "phone" | "gamepad";
  isActive: boolean;
  lastSeen: number;
  pos: { x: number; z: number };
  vel: { x: number; z: number };
}

export interface PendingQueueItem {
  id: string;
  url: string;
  requestedBy: string;
}

export interface QueueItem {
  id: string;
  title: string;
  url: string;
  requestedBy: string;
  duration: number;
  thumbnail: string;
  localPath?: string;
}

export interface PlaybackState {
  currentIndex: number;
  isPlaying: boolean;
  position: number;
  volume: number;
  muted: boolean;
  loop: boolean;
  shuffle: boolean;
}

export interface AppEntry {
  id: string;
  name: string;
  path: string;
  args: string[];
  icon: string;
  category: string;
}

/** A launchable app tile on the TV dashboard, editable from Settings. */
export interface AppConfig {
  name: string;
  /** Exe path or protocol URI (steam:// …). Empty = tile is a placeholder. */
  launcher: string;
  /** Accent color (hex). */
  hex: string;
  /** Lucide icon name (e.g. "Gamepad2", "Video"). Unknown → letter tile. */
  icon: string;
}

/** Per-device input tuning, stored under settings.input.devices.<id>. */
export interface DeviceInputConfig {
  /** Master switch — a disabled device's actions are ignored by the console. */
  enabled: boolean;
  /** Stick deadzone (gamepads). Keyboards ignore it. */
  deadzone: number;
  /** Name of the mapping profile (settings.input.mappings) this device uses.
   *  Unset → the built-in default for its kind. */
  mapping?: string;
}

/** A named, reusable control-mapping profile (settings.input.mappings.<name>).
 *  Logical actions: moveUp/Down/Left/Right (keyboard movement), navUp/Down/
 *  Left/Right, confirm, back, jump. Gamepads bind buttons by index and sticks
 *  by axes pair; keyboards bind keys by `KeyboardEvent.key` (lowercase). */
export interface InputMapping {
  type: "gamepad" | "keyboard";
  /** Gamepad: logical action → source. A number is a button index; a string is
   *  an axis-half ("a3+"/"a3-") or POV hat ("h9:-1.000") for non-standard pads.
   *  -1 / "" = unbound. */
  buttons: Record<string, number | string>;
  /** Keyboard: logical action → key ("" = unbound). */
  keys: Record<string, string>;
  /** Gamepad sticks: move = cube movement, spin = cube rotation.
   *  [-1, -1] = unbound. */
  axes: { move: [number, number]; spin: [number, number] };
}

export interface Settings {
  display: {
    fullscreen: boolean;
    crtEffect: boolean;
    /** CRT effect strength, 0–100 (only applies while crtEffect is on). */
    crtIntensity: number;
    volume: number;
  };
  media: {
    defaultVolume: number;
    /** Allow yt-dlp extraction from streaming sites (YouTube etc.). Off by
     *  default: only direct media URLs / local files are accepted until the
     *  user opts in, since extraction can violate a platform's ToS. */
    allowExtraction: boolean;
    /** Hide the "only add content you're authorized to play" note under the
     *  queue (set by its dismiss button, or toggled in Settings). */
    hideQueueDisclaimer: boolean;
  };
  input: {
    deadzone: number;
    repeatDelay: number;
    repeatInterval: number;
    /** Per-device overrides, keyed by device id ("keyboard1", "keyboard2",
     *  "gamepad-0", …). Registered by the console when a device is detected;
     *  edited from Settings. */
    devices: Record<string, DeviceInputConfig>;
    /** Named control-mapping profiles, assignable per device. */
    mappings: Record<string, InputMapping>;
  };
  autoupdate: AutoUpdateSettings;
  /** OS-integration toggles. */
  system: {
    /** Launch JDrakoon3 automatically when Windows starts (HKCU Run entry). */
    autostart: boolean;
  };
  /** Peer-console sync (PeerSyncService). */
  sync: {
    /** Shared room code — two consoles with the same code can link. */
    code: string;
  };
  apps: Record<string, AppConfig>;
  players: { name: string; color: string }[];
  libraryFolders: string[];
}

export interface AutoUpdateSettings {
  /** If true, check for updates and apply them automatically (badge + auto‑trigger). */
  autoupdate: boolean;
  /** Only used when autoupdate is false. If true, show an update modal on startup. */
  remindMeAboutUpdate: boolean;
  /** If true, download and apply updates without any UI indication; applied on next restart. */
  updateSilently: boolean;
}

export interface Action {
  type: string;
  playerId: string;
  [key: string]: any;
}
