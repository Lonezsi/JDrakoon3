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
