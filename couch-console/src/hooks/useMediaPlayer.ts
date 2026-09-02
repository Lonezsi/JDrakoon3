import { useState, useEffect, useRef, useCallback } from "react";
import { subscribe, sendAction } from "../services/socket";
import { notifService } from "../services/notificationService";

export interface QueueItem {
  id: string;
  title: string;
  url: string;
  duration: number;
  thumbnail: string;
  requestedBy: string;
}

interface PendingItem {
  id: string;
  url: string;
  requestedBy: string;
  createdAt: number;
  retries: number;
  sending: boolean; // true while a request is in flight
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

const DEFAULT_THUMB = "https://c.tenor.com/W2_zxTEyVd8AAAAd/tenor.gif";
const PENDING_TIMEOUT_MS = 5000; // first wait
const MAX_RETRIES = 2; // total attempts = initial + 2 retries
const RETRY_DELAYS = [5000, 10000, 20000]; // ms between retries (index = attempt-1)

export function useMediaPlayer() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  // Locally-originated optimistic pending (with client retry).
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  // Pending items reported by the server (e.g. added from a phone) — display
  // only, never retried here (the server owns their resolution).
  const [remotePending, setRemotePending] = useState<PendingItem[]>([]);
  const [playback, setPlayback] = useState<PlaybackState>({
    currentIndex: 0,
    isPlaying: false,
    position: 0,
    volume: 72,
    muted: false,
    loop: false,
    shuffle: false,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSyncTime = useRef(0);
  const lastUrlRef = useRef<string>("");

  // ─── FIX 1: suppress echo-back position sync after user-initiated changes ──
  // When volume or seek events are sent, the server echoes back the full
  // playback state (including position). That stored position can lag by up
  // to ~1 s, which was previously triggering unwanted seeks while playing.
  const suppressSyncUntil = useRef(0);

  // ─── FIX 2: auto-play the very first item added to an empty queue ──────────
  const prevQueueLen = useRef(0);
  const hasSeenInitialQueue = useRef(false);

  // ─── Socket subscription ───────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === "queue_updated") {
        if (msg.queue) {
          // On the very first snapshot, initialise prevQueueLen so we don't
          // auto-play an already-populated queue when connecting/reconnecting.
          if (!hasSeenInitialQueue.current) {
            prevQueueLen.current = msg.queue.length;
            hasSeenInitialQueue.current = true;
          }
          setQueue(msg.queue);
          setPendingItems((prev) =>
            prev.filter(
              (p) => !msg.queue.some((q: QueueItem) => q.url === p.url),
            ),
          );
        }
        // Mirror the server's pending list so items added elsewhere (a phone)
        // show their loading skeleton on the dashboard too.
        const sp = (msg.pendingItems || []) as Array<{
          id: string;
          url: string;
          requestedBy: string;
        }>;
        setRemotePending(
          sp.map((s) => ({
            id: s.id,
            url: s.url,
            requestedBy: s.requestedBy,
            createdAt: Date.now(),
            retries: 0,
            sending: false,
          })),
        );
        if (msg.playback) {
          setPlayback((prev) => ({ ...prev, ...msg.playback }));
        }
      }
      if (msg.type === "video_error") {
        notifService.push(`Failed to add: ${msg.message}`);
        //delete pending item so it doesn't retry endlessly
        setPendingItems((prev) => prev.filter((p) => p.id !== msg.pendingId));
      }
      if (msg.type === "queue_add_failed") {
        // server-side failures may be forwarded as `queue_add_failed`
        notifService.push(`Failed to add: ${msg.message}`);
        setPendingItems((prev) => prev.filter((p) => p.id !== msg.pendingId));
      }
    });
    return unsub;
  }, []);

  // ─── Auto-play when first item arrives in a previously-empty queue ─────────
  useEffect(() => {
    if (queue.length === 1 && prevQueueLen.current === 0) {
      // Don't auto-play if the user has already manually paused something
      // (playback.isPlaying would be false from a pause action, not from
      //  "nothing ever played"). Since this is the very first item, it's
      //  safe to start.
      sendAction({ type: "media_playpause" });
    }
    prevQueueLen.current = queue.length;
  }, [queue.length]);

  // ─── Retry stale pending items ─────────────────────────────────────────────
  useEffect(() => {
    if (pendingItems.length === 0) return;

    const checkAndRetry = () => {
      const now = Date.now();
      setPendingItems((prev) => {
        const next = prev
          .map((item) => {
            if (item.sending) return item; // wait for current request to finish
            const age = now - item.createdAt;
            const delayIndex = Math.min(item.retries, RETRY_DELAYS.length - 1);
            const requiredDelay = RETRY_DELAYS[delayIndex];
            if (age >= requiredDelay && item.retries < MAX_RETRIES) {
              // send again
              sendAction(
                {
                  type: "queue_add",
                  payload: {
                    url: item.url,
                    requestedBy: item.requestedBy,
                    pendingId: item.id,
                  },
                },
                (ack: any) => {
                  if (ack && ack.ok === false) {
                    // mark as error and remove
                    setPendingItems((prev) =>
                      prev.filter((p) => p.id !== item.id),
                    );
                    notifService.push(`Failed to add: ${item.url}`);
                  } else {
                    // success: remove (we'll handle in queue_updated too, but just in case)
                    setPendingItems((prev) =>
                      prev.filter((p) => p.id !== item.id),
                    );
                  }
                },
              );
              return {
                ...item,
                retries: item.retries + 1,
                sending: true,
                createdAt: now,
              };
            }
            if (item.retries >= MAX_RETRIES && age >= requiredDelay) {
              // final failure – remove and notify
              notifService.push(
                `Failed to add: ${item.url} after ${MAX_RETRIES + 1} attempts`,
              );
              return null; // mark for removal
            }
            return item;
          })
          .filter(Boolean) as PendingItem[];
        return next;
      });
    };

    const interval = setInterval(checkAndRetry, 1000);
    return () => clearInterval(interval);
  }, [pendingItems.length]);

  // When queue_updated arrives, remove any pending items whose URLs are now in the queue
  useEffect(() => {
    if (pendingItems.length === 0) return;
    const unsub = subscribe((msg) => {
      if (msg.type === "queue_updated" && msg.queue) {
        const queueUrls = new Set(msg.queue.map((item: any) => item.url));
        setPendingItems((prev) => prev.filter((p) => !queueUrls.has(p.url)));
      }
    });
    return unsub;
  }, [pendingItems]);

  // When video_error arrives for a pending item, remove it
  useEffect(() => {
    if (pendingItems.length === 0) return;
    const unsub = subscribe((msg) => {
      if (msg.type === "video_error") {
        // Remove any pending item with matching URL
        setPendingItems((prev) => prev.filter((p) => p.url !== msg.url));
        notifService.push(`Video error: ${msg.message}`);
      }
    });
    return unsub;
  }, [pendingItems]);

  // ─── Video error listener ──────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onError = () => {
      if (!videoRef.current?.getAttribute("src")) return;
      setVideoError(video.error?.message || "Video playback failed");
    };
    video.addEventListener("error", onError);
    return () => video.removeEventListener("error", onError);
  }, [videoRef.current]);

  const currentItem = queue[playback.currentIndex] || null;

  // ─── Sync video SOURCE (never restarts on volume/seek) ────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const newUrl = currentItem?.url
      ? `/stream?url=${encodeURIComponent(currentItem.url)}`
      : "";
    if (newUrl !== lastUrlRef.current) {
      if (newUrl) {
        video.setAttribute("src", newUrl);
      } else {
        video.removeAttribute("src");
      }
      lastUrlRef.current = newUrl;
    }
  }, [currentItem?.url]);

  // ─── Sync volume / mute ───────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = playback.muted;
    video.volume = playback.muted ? 0 : playback.volume / 100;
  }, [playback.muted, playback.volume]);

  // ─── Play / pause ──────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playback.isPlaying && currentItem) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [playback.isPlaying, currentItem]);

  // ─── FIX 1: Seek sync — suppressed after local user actions ───────────────
  // Previously: threshold was always 0.5 s, so any server echo after a volume
  // change (which lags ~1 s behind) triggered an unwanted seek/restart.
  // Now:
  //   • While playing  → only snap for large jumps (>5 s): another client seeked.
  //   • While paused   → sync normally so position is accurate on resume.
  //   • suppressSyncUntil → 2 s grace window after local seek/volume actions.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentItem) return;
    if (Date.now() < suppressSyncUntil.current) return;
    const diff = Math.abs(video.currentTime - playback.position);
    const threshold = playback.isPlaying ? 5 : 0.5;
    if (diff > threshold) {
      video.currentTime = playback.position;
    }
  }, [playback.position, currentItem, playback.isPlaying]);

  // ─── Report current time to backend ───────────────────────────────────────
  useEffect(() => {
    if (!playback.isPlaying) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (video && video.currentTime !== lastSyncTime.current) {
        lastSyncTime.current = video.currentTime;
        sendAction({
          type: "media_seek",
          payload: { progress: video.currentTime },
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [playback.isPlaying]);

  // ─── Auto-advance when queue is ready but nothing is playing ──────────────
  useEffect(() => {
    if (queue.length > 0 && !currentItem) {
      sendAction({ type: "media_next" });
    }
  }, [queue.length, currentItem]);

  // ─── Controls ─────────────────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    sendAction({ type: "media_playpause" });
  }, []);

  const handleNext = useCallback(() => {
    sendAction({ type: "media_next" });
  }, []);

  const handlePrev = useCallback(() => {
    sendAction({ type: "media_prev" });
  }, []);

  // Apply the seek to the local <video> immediately — the server echo is
  // suppressed for 2 s and the 1 s position reporter would otherwise re-send the
  // OLD currentTime and revert the seek. (Setting lastSyncTime keeps the next
  // report aligned to the new position.)
  const handleSeek = useCallback((value: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = value;
      lastSyncTime.current = value;
    }
    suppressSyncUntil.current = Date.now() + 2000;
    sendAction({ type: "media_seek", payload: { progress: value } });
  }, []);

  // FIX 1: volume changes echo back the full state including position —
  // suppress position sync for 2 s to avoid restarting / jumping the video
  const handleVolumeChange = useCallback((value: number) => {
    suppressSyncUntil.current = Date.now() + 2000;
    sendAction({ type: "media_volume", payload: { volume: value } });
  }, []);

  const toggleMute = useCallback(() => {
    suppressSyncUntil.current = Date.now() + 2000;
    sendAction({ type: "media_mute" });
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleQueueAdd = useCallback((url: string, requestedBy: string) => {
    const pendingId = Math.random().toString(36).slice(2);
    const newItem: PendingItem = {
      id: pendingId,
      url,
      requestedBy,
      createdAt: Date.now(),
      retries: 0,
      sending: true,
    };
    setPendingItems((prev) => [...prev, newItem]);
    // send initial request (we'll handle the callback)
    sendAction(
      { type: "queue_add", payload: { url, requestedBy, pendingId } },
      (ack: any) => {
        // If the backend replied with ok: false, we treat as error
        if (ack && ack.ok === false) {
          setPendingItems((prev) => prev.filter((p) => p.id !== pendingId));
          notifService.push(`Failed to add: ${url}`);
        }
      },
    );
  }, []);

  const handleQueueRemove = useCallback((index: number) => {
    sendAction({ type: "queue_remove", payload: { index } });
  }, []);

  const handleQueueMove = useCallback(
    (index: number, direction: "up" | "down") => {
      sendAction({ type: "queue_move", payload: { index, direction } });
    },
    [],
  );

  const handleClearQueue = useCallback(() => {
    sendAction({ type: "clear_queue" });
  }, []);

  const clearVideoError = useCallback(() => setVideoError(null), []);

  // Display set = local optimistic pending + server-reported pending, deduped by
  // URL (a local add is also echoed by the server) and excluding anything that
  // has already landed in the queue.
  const localUrls = new Set(pendingItems.map((p) => p.url));
  const queueUrls = new Set(queue.map((q) => q.url));
  const mergedPending = [
    ...pendingItems,
    ...remotePending.filter(
      (r) => !localUrls.has(r.url) && !queueUrls.has(r.url),
    ),
  ];

  return {
    queue,
    pendingItems: mergedPending,
    playback,
    currentItem,
    videoRef,
    isFullscreen,
    toggleFullscreen,
    handlePlayPause,
    handleNext,
    handlePrev,
    handleSeek,
    handleVolumeChange,
    toggleMute,
    handleQueueAdd,
    handleQueueRemove,
    handleQueueMove,
    handleClearQueue,
    videoError,
    clearVideoError,
  };
}
