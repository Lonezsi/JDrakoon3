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

export interface Settings {
  display: { fullscreen: boolean; crtEffect: boolean; volume: number };
  media: { defaultVolume: number; cacheLimitGB: number; preloadNext: boolean };
  input: { deadzone: number; repeatDelay: number; repeatInterval: number };
  autoupdate: AutoUpdateSettings;
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
