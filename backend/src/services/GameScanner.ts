import fg from 'fast-glob';
import path from 'path';
import fs from 'fs/promises';
import { AppEntry } from '../models/types';
import logger from '../utils/logger';
import { settingsService } from './SettingsService';
import { LIBRARY_FILE, CONFIG_DIR } from '../config/constants';

class GameScanner {
  private library: AppEntry[] = [];

  async scan(): Promise<AppEntry[]> {
    const settings = settingsService.get();
    const folders = settings.libraryFolders;
    const apps: AppEntry[] = [];

    for (const folder of folders) {
      if (folder.toLowerCase().includes('steam')) {
        const manifests = await fg(`${folder}/../appmanifest_*.acf`, { absolute: true });
        for (const manifest of manifests) {
          const content = await fs.readFile(manifest, 'utf-8');
          const nameMatch = content.match(/"name"\s+"([^"]+)"/);
          const appIdMatch = manifest.match(/appmanifest_(\d+)\.acf/);
          if (nameMatch && appIdMatch) {
            apps.push({
              id: `steam_${appIdMatch[1]}`,
              name: nameMatch[1],
              path: 'steam://rungameid/' + appIdMatch[1],
              args: [],
              icon: '',
              category: 'Steam',
            });
          }
        }
      } else {
        const exes = await fg(`${folder}/**/*.exe`, { absolute: true, deep: 2 });
        for (const exe of exes) {
          apps.push({
            id: `app_${path.basename(exe, '.exe')}`,
            name: path.basename(exe, '.exe'),
            path: exe,
            args: [],
            icon: '',
            category: 'Local',
          });
        }
      }
    }

    this.library = apps;
    await this.save();
    return apps;
  }

  async save() {
    await fs.writeFile(LIBRARY_FILE, JSON.stringify(this.library, null, 2));
  }

  getLibrary(): AppEntry[] {
    return this.library;
  }
}

export const gameScanner = new GameScanner();
