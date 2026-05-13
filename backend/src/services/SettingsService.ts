import fs from 'fs/promises';
import { existsSync } from 'fs';
import { SETTINGS_FILE, CONFIG_DIR } from '../config/constants';
import logger from '../utils/logger';
import { Settings } from '../models/types';

const defaultSettings: Settings = {
  display: { fullscreen: true, crtEffect: true, volume: 80 },
  media: { defaultVolume: 72, cacheLimitGB: 20, preloadNext: true },
  input: { deadzone: 0.25, repeatDelay: 300, repeatInterval: 60 },
  players: [],
  libraryFolders: ['C:\\Program Files (x86)\\Steam\\steamapps\\common', 'C:\\Roms'],
};

class SettingsService {
  private settings: Settings = defaultSettings;
  private subscribers: ((settings: Settings) => void)[] = [];

  async init() {
    if (!existsSync(CONFIG_DIR)) await fs.mkdir(CONFIG_DIR, { recursive: true });
    if (!existsSync(SETTINGS_FILE)) {
      await this.save();
    } else {
      try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
        this.settings = { ...defaultSettings, ...JSON.parse(data) };
      } catch (err) {
        logger.error('Failed to load settings', err);
      }
    }
  }

  async save() {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(this.settings, null, 2));
  }

  get(): Settings {
    return this.settings;
  }

  async update(partial: Partial<Settings>) {
    this.settings = { ...this.settings, ...partial };
    await this.save();
    this.subscribers.forEach(fn => fn(this.settings));
  }

  subscribe(fn: (settings: Settings) => void) {
    this.subscribers.push(fn);
    return () => { this.subscribers = this.subscribers.filter(f => f !== fn); };
  }
}

export const settingsService = new SettingsService();
