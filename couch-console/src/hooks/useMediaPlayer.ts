import { useState, useEffect, useRef, useCallback } from "react";
import { subscribe, sendAction } from "../services/socket";

export interface QueueItem {
  id: string;
  title: string;
  url: string;
  duration: number;
  thumbnail: string;
  requestedBy: string;
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

export function useMediaPlayer() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
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

  // Subscribe to queue_updated from Socket.IO
  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === "queue_updated") {
        if (msg.queue) setQueue(msg.queue);
        if (msg.playback) {
          setPlayback((prev) => ({ ...prev, ...msg.playback }));
        }
      }
    });
    return unsub;
  }, []);

  // Attach error listener (ignore empty src)
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

  // Sync video source only when URL changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const newUrl = currentItem?.url
      ? `/stream?url=${encodeURIComponent(currentItem.url)}`
      : "";

    if (newUrl && newUrl !== lastUrlRef.current) {
      video.setAttribute("src", newUrl);
      lastUrlRef.current = newUrl;
    } else if (!newUrl && lastUrlRef.current) {
      video.removeAttribute("src");
      lastUrlRef.current = "";
    }

    // Always keep the muted attribute in sync with playback state.
    // Note: `muted` attribute is set initially via the JSX, but we override here.
    video.muted = playback.muted;
    video.volume = playback.muted ? 0 : playback.volume / 100;
  }, [currentItem?.url, playback.muted, playback.volume]);

  // Play/pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playback.isPlaying && currentItem) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [playback.isPlaying, currentItem]);

  // Seek to position when backend sends seek
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentItem) return;
    const diff = Math.abs(video.currentTime - playback.position);
    if (diff > 0.5) {
      video.currentTime = playback.position;
    }
  }, [playback.position, currentItem]);

  // Report current time back to backend
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

  // Control functions
  const handlePlayPause = useCallback(() => {
    sendAction({ type: "media_playpause" });
  }, []);

  const handleNext = useCallback(() => {
    sendAction({ type: "media_next" });
  }, []);

  const handlePrev = useCallback(() => {
    sendAction({ type: "media_prev" });
  }, []);

  const handleSeek = useCallback((value: number) => {
    sendAction({ type: "media_seek", payload: { progress: value } });
  }, []);

  const handleVolumeChange = useCallback((value: number) => {
    sendAction({ type: "media_volume", payload: { volume: value } });
  }, []);

  const toggleMute = useCallback(() => {
    sendAction({ type: "media_mute" });
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleQueueAdd = useCallback((url: string, requestedBy: string) => {
    sendAction({ type: "queue_add", payload: { url, requestedBy } });
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

  return {
    queue,
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
