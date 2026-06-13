import fs from "fs/promises";
import { existsSync } from "fs";
import { SETTINGS_FILE, CONFIG_DIR } from "../config/constants";
import logger from "../utils/logger";
import { Settings } from "../models/types";

export const defaultSettings: Settings = {
  display: { fullscreen: true, crtEffect: true, volume: 80 },
  media: {
    defaultVolume: 72,
    cacheLimitGB: 20,
    preloadNext: true,
    allowExtraction: false,
  },
  // devices: per-device overrides keyed by id ("keyboard1", "gamepad-0", …),
  // registered by the console when it detects a device (so the Settings modal
  // grows a row per real device, not a hypothetical list).
  // mappings: built-in profiles match the historical hardcoded bindings, so
  // nothing changes until a device is pointed at a different/edited profile.
  input: {
    deadzone: 0.25,
    repeatDelay: 300,
    repeatInterval: 60,
    devices: {},
    mappings: {
      Gamepad: {
        type: "gamepad",
        buttons: {
          navUp: 12,
          navDown: 13,
          navLeft: 14,
          navRight: 15,
          confirm: 0,
          back: 1,
          jump: 2,
        },
        keys: {},
        axes: { move: [0, 1], spin: [2, 3] },
      },
      WASD: {
        type: "keyboard",
        buttons: {},
        keys: {
          moveUp: "w",
          moveDown: "s",
          moveLeft: "a",
          moveRight: "d",
          navUp: "arrowup",
          navDown: "arrowdown",
          navLeft: "arrowleft",
          navRight: "arrowright",
          confirm: "enter",
          back: "escape",
          jump: "x",
        },
        axes: { move: [-1, -1], spin: [-1, -1] },
      },
      UHJK: {
        type: "keyboard",
        buttons: {},
        keys: {
          moveUp: "u",
          moveDown: "j",
          moveLeft: "h",
          moveRight: "k",
          navUp: "",
          navDown: "",
          navLeft: "",
          navRight: "",
          confirm: "",
          back: "",
          jump: "",
        },
        axes: { move: [-1, -1], spin: [-1, -1] },
      },
    },
  },
  autoupdate: {
    autoupdate: true,
    remindMeAboutUpdate: true,
    updateSilently: false,
  },
  // No default apps — a fresh install starts empty; the user adds their own
  // by dropping an .exe, typing a path, or picking from installed apps.
  apps: {},
  players: [],
  libraryFolders: [
    "C:\\Program Files (x86)\\Steam\\steamapps\\common",
    "C:\\Roms",
  ],
};

// Helper: deep‑merge two plain objects
function deepMerge(target: any, source: any): any {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

class SettingsService {
  private settings: Settings = defaultSettings;
  private subscribers: ((settings: Settings) => void)[] = [];

  async init() {
    if (!existsSync(CONFIG_DIR))
      await fs.mkdir(CONFIG_DIR, { recursive: true });
    if (!existsSync(SETTINGS_FILE)) {
      await this.save();
    } else {
      try {
        const data = await fs.readFile(SETTINGS_FILE, "utf-8");
        this.settings = deepMerge(defaultSettings, JSON.parse(data));
      } catch (err) {
        logger.error("Failed to load settings", err);
      }
    }
  }

  async save() {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(this.settings, null, 2));
  }

  get(): Settings {
    return this.settings;
  }

  getDefaults(): Settings {
    return JSON.parse(JSON.stringify(defaultSettings));
  }

  async update(partial: Partial<Settings>) {
    this.settings = deepMerge(this.settings, partial);
    await this.save();
    this.subscribers.forEach((fn) => fn(this.settings));
  }

  /** Delete an app entry. deepMerge can't remove keys, so removal needs its
   *  own path. Returns true if the app existed. */
  async removeApp(id: string): Promise<boolean> {
    if (!this.settings.apps || !(id in this.settings.apps)) return false;
    delete this.settings.apps[id];
    await this.save();
    this.subscribers.forEach((fn) => fn(this.settings));
    return true;
  }

  subscribe(fn: (settings: Settings) => void) {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((f) => f !== fn);
    };
  }
}

export const settingsService = new SettingsService();
