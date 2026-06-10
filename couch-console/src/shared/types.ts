export interface Vec2 {
  x: number;
  z: number;
}

export interface Player {
  deviceType: string;
  id: string;
  name: string;
  color: string;
  pos: Vec2;
  vel: Vec2;
  deviceId?: string;
}

export interface DeviceAction {
  type: "move" | "navigate" | "confirm" | "back" | "jump";
  playerId?: string;
  deviceId: string;
  deviceType: "keyboard" | "gamepad" | "phone";
  value:
    | { x: number; y: number }
    | { direction: "left" | "right" | "up" | "down" }
    | boolean;
}

export type AppState = "BOOT" | "HOME" | "SETTINGS" | "APP_RUNNING";

export interface AppDefinition {
  id: string;
  name: string;
  launcher?: string;
  /** Lucide icon name; unknown/missing renders a letter tile instead. */
  icon?: string;
  /** Optional tailwind class; settings-driven apps style via hex. */
  color?: string;
  hex: string;
}

export interface MediaItem {
  id: number;
  title: string;
  duration: string;
  thumb: string;
}
