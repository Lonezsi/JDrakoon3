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
