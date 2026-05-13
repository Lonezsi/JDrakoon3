# create-backend.ps1
# Run this script inside the 'backend' folder

Write-Host "Creating backend files..." -ForegroundColor Cyan

# package.json
@'
{
  "name": "couch-console-backend",
  "version": "1.0.0",
  "description": "Local server for JDrakoon3 console",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "watch": "ts-node-dev --respawn src/index.ts"
  },
  "dependencies": {
    "ws": "^8.16.0",
    "express": "^4.18.2",
    "dotenv": "^16.3.1",
    "node-fetch": "^2.7.0",
    "qrcode": "^1.5.3",
    "fluent-ffmpeg": "^2.1.2",
    "ytdl-core": "^4.11.5",
    "fast-glob": "^3.3.2",
    "steamapp": "^1.0.1"
  },
  "devDependencies": {
    "@types/ws": "^8.5.8",
    "@types/express": "^4.17.20",
    "@types/node": "^20.8.0",
    "@types/qrcode": "^1.5.5",
    "@types/fluent-ffmpeg": "^2.1.23",
    "@types/ytdl-core": "^4.11.4",
    "ts-node": "^10.9.1",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.2.2"
  }
}
'@ | Out-File -FilePath package.json -Encoding utf8

# tsconfig.json
@'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
'@ | Out-File -FilePath tsconfig.json -Encoding utf8

# .env.example
@'
PORT=3001
LOG_LEVEL=info
'@ | Out-File -FilePath .env.example -Encoding utf8

# src/config/constants.ts
@'
import path from 'path';

export const PORT = parseInt(process.env.PORT || '3001', 10);
export const FRONTEND_PORT = 3000;
export const CACHE_DIR = path.join(process.cwd(), 'cache');
export const THUMBNAIL_DIR = path.join(CACHE_DIR, 'thumbnails');
export const VIDEO_CACHE_DIR = path.join(CACHE_DIR, 'videos');
export const CONFIG_DIR = path.join(process.cwd(), 'config');
export const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
export const LIBRARY_FILE = path.join(CONFIG_DIR, 'library.json');

export const LOBBY_BROADCAST_HZ = 20;
export const PLAYER_TIMEOUT_MS = 10000;
'@ | Out-File -FilePath src/config/constants.ts -Encoding utf8

# src/models/types.ts
@'
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
'@ | Out-File -FilePath src/models/types.ts -Encoding utf8

# src/utils/logger.ts
@'
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = typeof LOG_LEVELS[number];

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function log(level: LogLevel, ...args: any[]) {
  if (LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(currentLevel)) {
    console[level === 'debug' ? 'log' : level](`[${level.toUpperCase()}]`, ...args);
  }
}

export default {
  debug: (...args: any[]) => log('debug', ...args),
  info: (...args: any[]) => log('info', ...args),
  warn: (...args: any[]) => log('warn', ...args),
  error: (...args: any[]) => log('error', ...args),
};
'@ | Out-File -FilePath src/utils/logger.ts -Encoding utf8

# src/utils/ytdlp.ts
@'
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import logger from './logger';

const execAsync = promisify(exec);

export interface VideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  try {
    const { stdout } = await execAsync(`yt-dlp -j "${url}"`);
    const data = JSON.parse(stdout);
    return {
      id: data.id,
      title: data.title,
      duration: data.duration || 0,
      thumbnail: data.thumbnail,
    };
  } catch (err) {
    logger.warn('yt-dlp failed, falling back to ytdl-core');
    const ytdl = require('ytdl-core');
    const info = await ytdl.getInfo(url);
    return {
      id: info.videoDetails.videoId,
      title: info.videoDetails.title,
      duration: parseInt(info.videoDetails.lengthSeconds) || 0,
      thumbnail: info.videoDetails.thumbnails[0]?.url || '',
    };
  }
}

export async function downloadThumbnail(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  const buffer = await response.buffer();
  await fs.writeFile(outputPath, buffer);
}

export async function streamVideo(url: string, res: any): Promise<void> {
  const { spawn } = require('child_process');
  const ytdlp = spawn('yt-dlp', ['-f', 'best[ext=mp4]', '-o', '-', url]);
  ytdlp.stdout.pipe(res);
  ytdlp.on('error', (err: any) => {
    logger.error('Stream error:', err);
    res.status(500).end();
  });
}
'@ | Out-File -FilePath src/utils/ytdlp.ts -Encoding utf8

# src/services/SettingsService.ts
@'
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
'@ | Out-File -FilePath src/services/SettingsService.ts -Encoding utf8

# src/services/InputService.ts
@'
import { Action, Player } from '../models/types';
import { settingsService } from './SettingsService';

export type InputPacket = {
  playerId: string;
  buttons: {
    up: boolean; down: boolean; left: boolean; right: boolean;
    a: boolean; b: boolean; x: boolean; y: boolean;
    start: boolean; select: boolean;
  };
  analog: { x: number; y: number };
};

class InputService {
  private currentFocus: 'menu' | 'lobby' | 'fullscreen' = 'menu';

  setFocus(focus: typeof this.currentFocus) {
    this.currentFocus = focus;
  }

  processInput(packet: InputPacket): Action[] {
    const actions: Action[] = [];
    const { playerId, buttons, analog } = packet;
    const deadzone = settingsService.get().input.deadzone;

    let dx = analog.x;
    let dy = analog.y;
    if (Math.abs(dx) < deadzone) dx = 0;
    if (Math.abs(dy) < deadzone) dy = 0;
    if (dx !== 0 || dy !== 0) {
      actions.push({ type: 'move', playerId, dx, dy });
    }

    if (this.currentFocus === 'menu') {
      if (buttons.up) actions.push({ type: 'navigate', playerId, direction: 'up' });
      if (buttons.down) actions.push({ type: 'navigate', playerId, direction: 'down' });
      if (buttons.left) actions.push({ type: 'navigate', playerId, direction: 'left' });
      if (buttons.right) actions.push({ type: 'navigate', playerId, direction: 'right' });
      if (buttons.a) actions.push({ type: 'confirm', playerId });
      if (buttons.b) actions.push({ type: 'back', playerId });
      if (buttons.start) actions.push({ type: 'home', playerId });
    } else if (this.currentFocus === 'lobby') {
      if (buttons.a) actions.push({ type: 'jump', playerId });
      if (buttons.x) actions.push({ type: 'emote', playerId, emote: 'wave' });
      if (buttons.y) actions.push({ type: 'emote', playerId, emote: 'hype' });
    } else if (this.currentFocus === 'fullscreen') {
      actions.push({ type: 'gamepad_input', playerId, buttons, analog });
    }

    return actions;
  }
}

export const inputService = new InputService();
'@ | Out-File -FilePath src/services/InputService.ts -Encoding utf8

# src/services/AppLauncher.ts
@'
import { spawn, ChildProcess } from 'child_process';
import logger from '../utils/logger';
import { AppEntry } from '../models/types';

class AppLauncher {
  private currentProcess: ChildProcess | null = null;
  private currentAppId: string | null = null;
  private onExitCallbacks: ((appId: string, code: number | null) => void)[] = [];

  async launch(app: AppEntry): Promise<boolean> {
    if (this.currentProcess) {
      logger.warn('App already running, please close first');
      return false;
    }

    return new Promise((resolve) => {
      try {
        const proc = spawn(app.path, app.args, {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        });
        proc.unref();
        this.currentProcess = proc;
        this.currentAppId = app.id;

        proc.on('exit', (code) => {
          logger.info(`App ${app.id} exited with code ${code}`);
          this.currentProcess = null;
          const id = this.currentAppId;
          this.currentAppId = null;
          this.onExitCallbacks.forEach(cb => cb(id!, code));
        });

        proc.on('error', (err) => {
          logger.error(`Failed to launch ${app.id}:`, err);
          this.currentProcess = null;
          this.currentAppId = null;
          resolve(false);
        });

        resolve(true);
      } catch (err) {
        logger.error(`Exception launching ${app.id}:`, err);
        resolve(false);
      }
    });
  }

  async close(): Promise<void> {
    if (this.currentProcess) {
      this.currentProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 500));
      if (this.currentProcess && !this.currentProcess.killed) {
        this.currentProcess.kill('SIGKILL');
      }
      this.currentProcess = null;
      this.currentAppId = null;
    }
  }

  onExit(cb: (appId: string, code: number | null) => void) {
    this.onExitCallbacks.push(cb);
  }

  isRunning(): boolean {
    return this.currentProcess !== null;
  }

  getCurrentAppId(): string | null {
    return this.currentAppId;
  }
}

export const appLauncher = new AppLauncher();
'@ | Out-File -FilePath src/services/AppLauncher.ts -Encoding utf8

# src/services/VideoQueueService.ts
@'
import { QueueItem, PlaybackState } from '../models/types';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { getVideoInfo, downloadThumbnail } from '../utils/ytdlp';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { THUMBNAIL_DIR, VIDEO_CACHE_DIR } from '../config/constants';
import { settingsService } from './SettingsService';

class VideoQueueService {
  private queue: QueueItem[] = [];
  private playback: PlaybackState = {
    currentIndex: 0,
    isPlaying: false,
    position: 0,
    volume: settingsService.get().media.defaultVolume,
    muted: false,
    loop: false,
    shuffle: false,
  };
  private subscribers: ((queue: QueueItem[], playback: PlaybackState) => void)[] = [];

  constructor() {
    if (!existsSync(THUMBNAIL_DIR)) mkdirSync(THUMBNAIL_DIR, { recursive: true });
    if (!existsSync(VIDEO_CACHE_DIR)) mkdirSync(VIDEO_CACHE_DIR, { recursive: true });
  }

  async addToQueue(url: string, requestedBy: string): Promise<QueueItem | null> {
    try {
      const info = await getVideoInfo(url);
      const thumbnailPath = path.join(THUMBNAIL_DIR, `${info.id}.jpg`);
      if (!existsSync(thumbnailPath)) {
        await downloadThumbnail(info.thumbnail, thumbnailPath);
      }
      const item: QueueItem = {
        id: uuidv4(),
        title: info.title,
        url,
        requestedBy,
        duration: info.duration,
        thumbnail: thumbnailPath,
      };
      this.queue.push(item);
      this.notify();
      return item;
    } catch (err) {
      logger.error('Failed to add to queue:', err);
      return null;
    }
  }

  removeFromQueue(index: number) {
    if (index >= 0 && index < this.queue.length) {
      this.queue.splice(index, 1);
      if (this.playback.currentIndex >= this.queue.length) {
        this.playback.currentIndex = Math.max(0, this.queue.length - 1);
      }
      this.notify();
    }
  }

  moveItem(index: number, direction: 'up' | 'down') {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= this.queue.length) return;
    [this.queue[index], this.queue[newIndex]] = [this.queue[newIndex], this.queue[index]];
    if (this.playback.currentIndex === index) this.playback.currentIndex = newIndex;
    else if (this.playback.currentIndex === newIndex) this.playback.currentIndex = index;
    this.notify();
  }

  clearQueue() {
    this.queue = [];
    this.playback.currentIndex = 0;
    this.playback.isPlaying = false;
    this.playback.position = 0;
    this.notify();
  }

  shuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.playback.currentIndex = 0;
    this.notify();
  }

  toggleLoop() {
    this.playback.loop = !this.playback.loop;
    this.notify();
  }

  setPlaying(playing: boolean) {
    this.playback.isPlaying = playing;
    this.notify();
  }

  setPosition(seconds: number) {
    this.playback.position = Math.min(Math.max(0, seconds), this.currentItem?.duration || 0);
    this.notify();
  }

  setVolume(volume: number) {
    this.playback.volume = Math.min(100, Math.max(0, volume));
    this.playback.muted = false;
    this.notify();
  }

  toggleMute() {
    this.playback.muted = !this.playback.muted;
    this.notify();
  }

  next() {
    if (this.queue.length === 0) return;
    let nextIndex = this.playback.currentIndex + 1;
    if (nextIndex >= this.queue.length) {
      if (this.playback.loop) nextIndex = 0;
      else return;
    }
    this.playback.currentIndex = nextIndex;
    this.playback.position = 0;
    this.playback.isPlaying = true;
    this.notify();
  }

  previous() {
    if (this.queue.length === 0) return;
    let prevIndex = this.playback.currentIndex - 1;
    if (prevIndex < 0) {
      if (this.playback.loop) prevIndex = this.queue.length - 1;
      else return;
    }
    this.playback.currentIndex = prevIndex;
    this.playback.position = 0;
    this.playback.isPlaying = true;
    this.notify();
  }

  get currentItem(): QueueItem | null {
    return this.queue[this.playback.currentIndex] || null;
  }

  getState() {
    return { queue: this.queue, playback: this.playback };
  }

  subscribe(fn: (queue: QueueItem[], playback: PlaybackState) => void) {
    this.subscribers.push(fn);
    fn(this.queue, this.playback);
    return () => { this.subscribers = this.subscribers.filter(f => f !== fn); };
  }

  private notify() {
    this.subscribers.forEach(fn => fn(this.queue, this.playback));
  }
}

export const videoQueue = new VideoQueueService();
'@ | Out-File -FilePath src/services/VideoQueueService.ts -Encoding utf8

# src/services/LobbySyncService.ts
@'
import { Player, Action } from '../models/types';
import { settingsService } from './SettingsService';
import logger from '../utils/logger';

const BOUNDS = { x: 12, z: 8 };
const COLLISION_RADIUS = 0.75;
const ACC = 0.025;
const FRIC = 0.94;

class LobbySyncService {
  private players: Map<string, Player> = new Map();
  private subscribers: ((players: Player[], meta?: any) => void)[] = [];
  private interval: NodeJS.Timeout | null = null;

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => this.update(), 1000 / 20);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  addPlayer(player: Player) {
    player.pos = { x: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 5 };
    player.vel = { x: 0, z: 0 };
    this.players.set(player.id, player);
    this.broadcast();
  }

  removePlayer(id: string) {
    this.players.delete(id);
    this.broadcast();
  }

  handleAction(action: Action) {
    if (action.type === 'move') {
      const player = this.players.get(action.playerId);
      if (player) {
        const force = { x: action.dx, z: action.dy };
        const ax = force.x * ACC;
        const az = force.z * ACC;
        player.vel.x = (player.vel.x + ax) * FRIC;
        player.vel.z = (player.vel.z + az) * FRIC;
      }
    } else if (action.type === 'jump') {
      this.broadcastEmote(action.playerId, 'jump');
    } else if (action.type === 'emote') {
      this.broadcastEmote(action.playerId, action.emote);
    }
  }

  private update() {
    for (const player of this.players.values()) {
      player.pos.x += player.vel.x;
      player.pos.z += player.vel.z;
    }

    const playerList = Array.from(this.players.values());
    for (let i = 0; i < playerList.length; i++) {
      for (let j = i + 1; j < playerList.length; j++) {
        const a = playerList[i];
        const b = playerList[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const dist = Math.hypot(dx, dz);
        const minDist = COLLISION_RADIUS * 2;
        if (dist < minDist && dist > 0.001) {
          const angle = Math.atan2(dz, dx);
          const overlap = minDist - dist;
          const cx = Math.cos(angle) * (overlap / 2);
          const cz = Math.sin(angle) * (overlap / 2);
          a.pos.x -= cx; a.pos.z -= cz;
          b.pos.x += cx; b.pos.z += cz;
          const nx = dx / dist, nz = dz / dist;
          const imp = (a.vel.x * nx + a.vel.z * nz) - (b.vel.x * nx + b.vel.z * nz);
          a.vel.x -= imp * nx * 0.78;
          a.vel.z -= imp * nz * 0.78;
          b.vel.x += imp * nx * 0.78;
          b.vel.z += imp * nz * 0.78;
        }
      }
    }

    for (const player of this.players.values()) {
      if (player.pos.x > BOUNDS.x) { player.pos.x = BOUNDS.x; player.vel.x *= -0.5; }
      if (player.pos.x < -BOUNDS.x) { player.pos.x = -BOUNDS.x; player.vel.x *= -0.5; }
      if (player.pos.z > BOUNDS.z) { player.pos.z = BOUNDS.z; player.vel.z *= -0.5; }
      if (player.pos.z < -BOUNDS.z) { player.pos.z = -BOUNDS.z; player.vel.z *= -0.5; }
    }

    this.broadcast();
  }

  private broadcast() {
    const playersArray = Array.from(this.players.values());
    this.subscribers.forEach(fn => fn(playersArray));
  }

  private broadcastEmote(playerId: string, emote: string) {
    this.subscribers.forEach(fn => fn(Array.from(this.players.values()), { type: 'emote', playerId, emote }));
  }

  subscribe(fn: (players: Player[], meta?: any) => void) {
    this.subscribers.push(fn);
    fn(Array.from(this.players.values()));
    return () => { this.subscribers = this.subscribers.filter(f => f !== fn); };
  }
}

export const lobbySync = new LobbySyncService();
'@ | Out-File -FilePath src/services/LobbySyncService.ts -Encoding utf8

# src/services/GameScanner.ts
@'
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
'@ | Out-File -FilePath src/services/GameScanner.ts -Encoding utf8

# src/websocket/server.ts
@'
import WebSocket from 'ws';
import { Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { handleMessage } from './handlers';
import { broadcast } from './broadcast';
import { Player } from '../models/types';
import { lobbySync } from '../services/LobbySyncService';

interface ExtendedWebSocket extends WebSocket {
  playerId?: string;
  isAlive?: boolean;
}

const clients = new Map<string, ExtendedWebSocket>();

export function initWebSocketServer(httpServer: Server) {
  const wss = new WebSocket.Server({ server: httpServer });

  wss.on('connection', (ws: ExtendedWebSocket) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (data: string) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleMessage(ws, msg);
      } catch (err) {
        logger.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      if (ws.playerId) {
        clients.delete(ws.playerId);
        lobbySync.removePlayer(ws.playerId);
        broadcast('player_left', { playerId: ws.playerId });
      }
    });
  });

  setInterval(() => {
    wss.clients.forEach((ws: ExtendedWebSocket) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  return wss;
}

export function getClient(playerId: string): ExtendedWebSocket | undefined {
  return clients.get(playerId);
}

export function registerClient(ws: ExtendedWebSocket, playerId: string) {
  ws.playerId = playerId;
  clients.set(playerId, ws);
}
'@ | Out-File -FilePath src/websocket/server.ts -Encoding utf8

# src/websocket/handlers.ts
@'
import { ExtendedWebSocket, registerClient, getClient } from './server';
import { broadcast } from './broadcast';
import { v4 as uuidv4 } from 'uuid';
import { Player, Action } from '../models/types';
import { inputService } from '../services/InputService';
import { lobbySync } from '../services/LobbySyncService';
import { appLauncher } from '../services/AppLauncher';
import { videoQueue } from '../services/VideoQueueService';
import { settingsService } from '../services/SettingsService';
import { gameScanner } from '../services/GameScanner';
import logger from '../utils/logger';

export async function handleMessage(ws: ExtendedWebSocket, msg: any) {
  switch (msg.type) {
    case 'join':
      const playerId = uuidv4();
      const player: Player = {
        id: playerId,
        name: msg.name || 'Guest',
        color: msg.color || '#6366f1',
        deviceType: msg.deviceType || 'phone',
        isActive: true,
        lastSeen: Date.now(),
        pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 },
      };
      registerClient(ws, playerId);
      lobbySync.addPlayer(player);
      broadcast('player_joined', player);
      ws.send(JSON.stringify({ type: 'joined', playerId }));
      break;

    case 'input':
      if (!ws.playerId) return;
      const actions = inputService.processInput({
        playerId: ws.playerId,
        buttons: msg.buttons,
        analog: msg.analog,
      });
      for (const action of actions) {
        broadcast('action', action);
        if (action.type === 'move' || action.type === 'emote' || action.type === 'jump') {
          lobbySync.handleAction(action);
        }
      }
      break;

    case 'action':
      if (!ws.playerId) return;
      const action = msg.action;
      action.playerId = ws.playerId;
      broadcast('action', action);
      if (action.type === 'move' || action.type === 'emote' || action.type === 'jump') {
        lobbySync.handleAction(action);
      }
      break;

    case 'queue_add':
      const item = await videoQueue.addToQueue(msg.url, msg.requestedBy || 'Phone');
      if (item) broadcast('queue_updated', videoQueue.getState());
      break;

    case 'queue_remove':
      videoQueue.removeFromQueue(msg.index);
      broadcast('queue_updated', videoQueue.getState());
      break;

    case 'queue_move':
      videoQueue.moveItem(msg.index, msg.direction);
      broadcast('queue_updated', videoQueue.getState());
      break;

    case 'clear_queue':
      videoQueue.clearQueue();
      broadcast('queue_updated', videoQueue.getState());
      break;

    case 'shuffle_queue':
      videoQueue.shuffle();
      broadcast('queue_updated', videoQueue.getState());
      break;

    case 'loop_toggle':
      videoQueue.toggleLoop();
      broadcast('queue_updated', videoQueue.getState());
      break;

    case 'media_playpause':
      videoQueue.setPlaying(!videoQueue.getState().playback.isPlaying);
      break;

    case 'media_next':
      videoQueue.next();
      break;

    case 'media_prev':
      videoQueue.previous();
      break;

    case 'media_seek':
      videoQueue.setPosition(msg.progress);
      break;

    case 'media_volume':
      videoQueue.setVolume(msg.volume);
      break;

    case 'media_mute':
      videoQueue.toggleMute();
      break;

    case 'launch_app':
      const apps = gameScanner.getLibrary();
      const app = apps.find(a => a.id === msg.appId);
      if (app) {
        const launched = await appLauncher.launch(app);
        if (launched) {
          broadcast('app_launched', { appId: app.id });
          inputService.setFocus('fullscreen');
        }
      }
      break;

    case 'close_app':
      await appLauncher.close();
      broadcast('app_closed', {});
      inputService.setFocus('menu');
      break;

    case 'settings_get':
      ws.send(JSON.stringify({ type: 'settings', settings: settingsService.get() }));
      break;

    case 'settings_update':
      await settingsService.update(msg.settings);
      broadcast('settings_updated', settingsService.get());
      break;

    case 'scan_library':
      const library = await gameScanner.scan();
      broadcast('library_updated', library);
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;

    default:
      logger.warn('Unknown message type:', msg.type);
  }
}
'@ | Out-File -FilePath src/websocket/handlers.ts -Encoding utf8

# src/websocket/broadcast.ts
@'
import { Server } from 'ws';
import logger from '../utils/logger';

let wss: Server | null = null;

export function setWss(server: Server) {
  wss = server;
}

export function broadcast(type: string, payload: any) {
  if (!wss) return;
  const message = JSON.stringify({ type, ...payload });
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}
'@ | Out-File -FilePath src/websocket/broadcast.ts -Encoding utf8

# src/index.ts
@'
import express from 'express';
import http from 'http';
import path from 'path';
import { initWebSocketServer } from './websocket/server';
import { setWss } from './websocket/broadcast';
import { lobbySync } from './services/LobbySyncService';
import { settingsService } from './services/SettingsService';
import { gameScanner } from './services/GameScanner';
import { videoQueue } from './services/VideoQueueService';
import { appLauncher } from './services/AppLauncher';
import { PORT, FRONTEND_PORT, CACHE_DIR, CONFIG_DIR } from './config/constants';
import logger from './utils/logger';
import fs from 'fs';

async function bootstrap() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

  await settingsService.init();
  await gameScanner.scan();

  const app = express();
  const server = http.createServer(app);

  const frontendPath = path.join(process.cwd(), 'frontend-build');
  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  } else {
    logger.warn('Frontend build not found, please build couch-console and copy to ./frontend-build');
  }

  app.get('/stream', async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      res.status(400).send('Missing url');
      return;
    }
    const { streamVideo } = await import('./utils/ytdlp');
    streamVideo(url, res);
  });

  const wss = initWebSocketServer(server);
  setWss(wss);

  lobbySync.start();

  appLauncher.onExit((appId, code) => {
    broadcast('app_closed', { appId, code });
    inputService.setFocus('menu');
  });

  server.listen(PORT, () => {
    logger.info(`Backend listening on http://localhost:${PORT}`);
    logger.info(`Frontend available at http://localhost:${FRONTEND_PORT} (you need to run frontend separately or serve static files)`);
  });
}

bootstrap().catch(err => {
  logger.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
'@ | Out-File -FilePath src/index.ts -Encoding utf8

Write-Host "All files created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Run 'npm install' inside the backend folder"
Write-Host "2. Build the frontend (couch-console) and copy its 'dist' folder into 'frontend-build'"
Write-Host "3. Run 'npm run build' then 'npm start' to launch the backend"
Write-Host "4. Open http://localhost:3001 on your laptop to see the TV UI"