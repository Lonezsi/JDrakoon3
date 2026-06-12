import { QueueItem, PlaybackState, PendingQueueItem } from "../models/types";
import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";
import { getVideoInfo, downloadThumbnail } from "../utils/ytdlp";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { THUMBNAIL_DIR, VIDEO_CACHE_DIR } from "../config/constants";
import { settingsService } from "./SettingsService";

/** Subscribers receive the full queue state. */
type QueueSubscriber = (
  queue: QueueItem[],
  playback: PlaybackState,
  pending: PendingQueueItem[],
) => void;

/** Error subscribers are called when an add fails so the socket layer can
 *  forward the event to the requesting client. */
type ErrorSubscriber = (
  pendingId: string,
  url: string,
  message: string,
) => void;

class VideoQueueService {
  private queue: QueueItem[] = [];
  private pendingItems: PendingQueueItem[] = [];
  private playback: PlaybackState = {
    currentIndex: 0,
    isPlaying: false,
    position: 0,
    volume: settingsService.get().media.defaultVolume,
    muted: true,
    loop: false,
    shuffle: false,
  };
  private subscribers: QueueSubscriber[] = [];
  private errorSubscribers: ErrorSubscriber[] = [];

  constructor() {
    if (!existsSync(THUMBNAIL_DIR))
      mkdirSync(THUMBNAIL_DIR, { recursive: true });
    if (!existsSync(VIDEO_CACHE_DIR))
      mkdirSync(VIDEO_CACHE_DIR, { recursive: true });
  }

  // ─── Queue mutation ────────────────────────────────────────────────────────

  /**
   * Immediately marks the URL as pending (so all clients see it loading),
   * then resolves video metadata in the background.
   *
   * Returns the confirmed QueueItem on success, or null on failure.
   * On failure an error event is broadcast to error subscribers so the socket
   * layer can forward it to the originating client.
   */
  async addToQueue(
    url: string,
    requestedBy: string,
    /** Caller-supplied id that matches the client's optimistic pending entry.
     *  When omitted a fresh id is generated (e.g. for server-side adds). */
    pendingId: string = uuidv4(),
  ): Promise<QueueItem | null> {
    // Dedupe: don't add a URL already queued or in-flight.
    if (
      this.queue.some((q) => q.url === url) ||
      this.pendingItems.some((p) => p.url === url)
    ) {
      this.notifyError(pendingId, url, "Already in the queue");
      return null;
    }

    // Legal gate: a direct media file is always fine, but extracting from a
    // streaming site (YouTube etc.) requires the user to opt in via Settings.
    const isDirectMedia = /\.(mp3|mp4|m4a|webm|ogg|oga|flac|wav|mov|mkv)(\?.*)?$/i.test(
      url,
    );
    if (!isDirectMedia && !settingsService.get().media.allowExtraction) {
      this.notifyError(
        pendingId,
        url,
        "Online extraction is off — enable it in Settings, or add a direct media link.",
      );
      return null;
    }

    // 1. Register as pending and broadcast immediately — instant feedback for
    //    every connected client.
    this.pendingItems.push({ id: pendingId, url, requestedBy });
    this.notify();

    try {
      const info = await getVideoInfo(url);

      // Download thumbnail (best-effort)
      const localThumbPath = path.join(THUMBNAIL_DIR, `${info.id}.jpg`);
      const webThumbPath = `/cache/thumbnails/${encodeURIComponent(info.id)}.jpg`;
      if (!existsSync(localThumbPath)) {
        if (
          info.thumbnail &&
          typeof info.thumbnail === "string" &&
          (info.thumbnail.startsWith("http://") ||
            info.thumbnail.startsWith("https://"))
        ) {
          try {
            await downloadThumbnail(info.thumbnail, localThumbPath);
          } catch (err) {
            logger.warn("Thumbnail download failed:", err);
          }
        } else {
          logger.debug("No valid thumbnail URL to download for", info.id);
        }
      }

      const item: QueueItem = {
        id: uuidv4(),
        title: info.title,
        url,
        requestedBy,
        duration: info.duration,
        thumbnail: webThumbPath,
      };

      // 2. Success — move from pending to confirmed queue.
      this._removePending(pendingId);
      this.queue.push(item);
      this.notify();
      return item;
    } catch (err) {
      // 3. Failure — remove the pending entry and tell subscribers so the
      //    socket layer can notify the client that submitted it.
      logger.error("Failed to add to queue:", err);
      this._removePending(pendingId);
      const message =
        err instanceof Error ? err.message : "Failed to fetch video info";
      this.notifyError(pendingId, url, message);
      this.notify(); // push clean state (pending card disappears everywhere)
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

  moveItem(index: number, direction: "up" | "down") {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= this.queue.length) return;
    [this.queue[index], this.queue[newIndex]] = [
      this.queue[newIndex],
      this.queue[index],
    ];
    if (this.playback.currentIndex === index)
      this.playback.currentIndex = newIndex;
    else if (this.playback.currentIndex === newIndex)
      this.playback.currentIndex = index;
    this.notify();
  }

  clearQueue() {
    this.queue = [];
    this.pendingItems = [];
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

  // ─── Playback controls ────────────────────────────────────────────────────

  setPlaying(playing: boolean) {
    this.playback.isPlaying = playing;
    this.notify();
  }

  setPosition(seconds: number) {
    this.playback.position = Math.min(
      Math.max(0, seconds),
      this.currentItem?.duration || 0,
    );
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

  // ─── Accessors ────────────────────────────────────────────────────────────

  get currentItem(): QueueItem | null {
    return this.queue[this.playback.currentIndex] || null;
  }

  getState() {
    return {
      queue: this.queue,
      pendingItems: this.pendingItems,
      playback: this.playback,
    };
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  subscribe(fn: QueueSubscriber) {
    this.subscribers.push(fn);
    // Immediately send current state to the new subscriber.
    fn(this.queue, this.playback, this.pendingItems);
    return () => {
      this.subscribers = this.subscribers.filter((f) => f !== fn);
    };
  }

  /**
   * Subscribe to add-failure events.
   * The socket handler uses this to emit `queue_add_failed` back to the
   * specific client that requested the add.
   */
  onError(fn: ErrorSubscriber) {
    this.errorSubscribers.push(fn);
    return () => {
      this.errorSubscribers = this.errorSubscribers.filter((f) => f !== fn);
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _removePending(id: string) {
    this.pendingItems = this.pendingItems.filter((p) => p.id !== id);
  }

  private notify() {
    this.subscribers.forEach((fn) =>
      fn(this.queue, this.playback, this.pendingItems),
    );
  }

  private notifyError(pendingId: string, url: string, message: string) {
    this.errorSubscribers.forEach((fn) => fn(pendingId, url, message));
  }
}

export const videoQueue = new VideoQueueService();
