export const BOUNDS = { x: 12, z: 8 };
export const CUBE_SIZE = 1.2;
export const COLLISION_RADIUS = 0.75;

export const APP_STATES = {
  BOOT: "BOOT",
  HOME: "HOME",
  SETTINGS: "SETTINGS",
  APP_RUNNING: "APP_RUNNING",
} as const;

// App tiles now live in backend settings (settings.apps) — edit them from
// the Settings modal or by dropping an .exe onto the dashboard.
