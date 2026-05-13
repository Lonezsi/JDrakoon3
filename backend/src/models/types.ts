export interface Player {
  id: string;
  name: string;
  color: string;
  deviceType: 'phone' | 'gamepad';
  isActive: boolean;
  lastSeen: number;
  pos: { x: number; z: number };
  vel: { x: number; z: number };
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

export interface Settings {
  display: { fullscreen: boolean; crtEffect: boolean; volume: number };
  media: { defaultVolume: number; cacheLimitGB: number; preloadNext: boolean };
  input: { deadzone: number; repeatDelay: number; repeatInterval: number };
  players: { name: string; color: string }[];
  libraryFolders: string[];
}

export interface Action {
  type: string;
  playerId: string;
  [key: string]: any;
}
