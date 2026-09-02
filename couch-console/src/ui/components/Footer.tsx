import {
  MonitorPlay,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Settings,
  LogOut,
  Loader2,
  X,
  Link2,
} from "lucide-react";
import { useMediaPlayer } from "../../hooks/useMediaPlayer";
import { notifService } from "../../services/notificationService";
import { subscribe } from "../../services/socket";
import { SettingsModal } from "./SettingsModal";
import { FocusInput } from "./FocusInput";
import { useState, useEffect, useCallback } from "react";
import { useFocusable } from "../../navigation/FocusContext";

interface FooterProps {
  players: { id: string; name: string; color: string }[];
}

const DEFAULT_THUMB = "https://c.tenor.com/W2_zxTEyVd8AAAAd/tenor.gif";

// Fall back to the default thumbnail when a queue item's thumbnail 404s (the
// cached jpg can be missing if the download failed) — no broken-image icon.
// Guarded so a failing fallback can't loop.
function onThumbError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.src !== DEFAULT_THUMB) img.src = DEFAULT_THUMB;
  else img.onerror = null;
}

export function Footer({ players }: FooterProps) {
  const media = useMediaPlayer();
  const [newUrl, setNewUrl] = useState("");
  const [seekDrag, setSeekDrag] = useState<number | null>(null);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [settingsSearchTerm, setSettingsSearchTerm] = useState("");
  // "Only add content you're authorized to play" note — hidden once dismissed
  // (persisted to settings.media.hideQueueDisclaimer) or via its Settings toggle.
  const [hideDisclaimer, setHideDisclaimer] = useState(false);

  useEffect(() => {
    const apply = (s: any) =>
      setHideDisclaimer(!!s?.media?.hideQueueDisclaimer);
    fetch("/api/settings")
      .then((r) => r.json())
      .then(apply)
      .catch(() => {});
    return subscribe((msg) => {
      if (msg.type === "settings_updated" && msg.settings) apply(msg.settings);
    });
  }, []);

  const dismissDisclaimer = () => {
    setHideDisclaimer(true);
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media: { hideQueueDisclaimer: true } }),
    }).catch(() => {});
  };

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    setSettingsSearchTerm("");
  }, []);

  // Listen for custom event from navigation hook to open settings
  useEffect(() => {
    const handler = () => setSettingsOpen(true);
    window.addEventListener("open-settings", handler);
    return () => window.removeEventListener("open-settings", handler);
  }, []);

  // Show error notification
  useEffect(() => {
    if (media.videoError) {
      notifService.push(media.videoError);
      media.clearVideoError();
    }
  }, [media.videoError, media.clearVideoError]);

  const addItem = () => {
    if (!newUrl.trim()) return;
    const adder = players.length > 0 ? players[0].name : "System";
    media.handleQueueAdd(newUrl.trim(), adder);
    setNewUrl("");
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const currentItem = media.currentItem;
  const isPlaying = media.playback.isPlaying;
  const volume = media.playback.volume;
  const muted = media.playback.muted;
  const progress = media.playback.position;
  const duration = currentItem?.duration || 0;

  const seekValue = seekDrag !== null ? seekDrag : progress;
  const seekPercent = duration ? (seekValue / duration) * 100 : 0;
  const seekStyle = {
    background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${seekPercent}%, #a78bfa ${seekPercent}%, #a78bfa 100%)`,
  };

  const volPercent = muted ? 0 : volume;
  const volStyle = {
    background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${volPercent}%, #a78bfa ${volPercent}%, #a78bfa 100%)`,
  };

  const fullscreenWrapperClass = media.isFullscreen
    ? "fixed inset-0 z-50 bg-black flex items-center justify-center"
    : "relative hidden";

  const totalQueueCount = media.queue.length + media.pendingItems.length;

  const handleShutdown = () => {
    notifService.push("Shutting down…");
    fetch("/api/shutdown", { method: "POST" }).catch(() => {});
    setTimeout(() => window.close(), 500);
  };

  // Only the system buttons are keyboard/gamepad targets. The lobby,
  // mini player and queue are mouse/phone controlled.
  const settingsFocus = useFocusable<HTMLButtonElement>("sys-settings", {
    onSelect: () => setSettingsOpen(true),
  });
  const shutdownFocus = useFocusable<HTMLButtonElement>("sys-shutdown", {
    onSelect: handleShutdown,
  });
  const syncFocus = useFocusable<HTMLButtonElement>("sys-sync", {
    onSelect: () => window.dispatchEvent(new Event("open-sync")),
  });

  return (
    <div className="flex items-end gap-6 py-4">
      {/* Video element */}
      <div className={fullscreenWrapperClass}>
        <video
          ref={media.videoRef}
          className={
            media.isFullscreen
              ? "w-full h-full object-contain"
              : "absolute opacity-0 pointer-events-none"
          }
          poster={currentItem?.thumbnail || DEFAULT_THUMB}
          autoPlay
          playsInline
        />
        {media.isFullscreen && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-4">
            <button
              onClick={media.handlePrev}
              className="text-white/70 hover:text-white"
            >
              <SkipBack size={24} />
            </button>
            <button
              onClick={media.handlePlayPause}
              className="text-white hover:scale-105"
            >
              {isPlaying ? <Pause size={32} /> : <Play size={32} />}
            </button>
            <button
              onClick={media.handleNext}
              className="text-white/70 hover:text-white"
            >
              <SkipForward size={24} />
            </button>
            <div className="flex-1 mx-2">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={seekValue}
                onChange={(e) => setSeekDrag(+e.target.value)}
                onMouseUp={() => {
                  if (seekDrag !== null) {
                    media.handleSeek(seekDrag);
                    setSeekDrag(null);
                  }
                }}
                onTouchEnd={() => {
                  if (seekDrag !== null) {
                    media.handleSeek(seekDrag);
                    setSeekDrag(null);
                  }
                }}
                className="w-full h-1 appearance-none rounded-full"
                style={seekStyle}
              />
            </div>
            <button
              onClick={media.toggleMute}
              className="text-white/70 hover:text-white"
            >
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button
              onClick={media.toggleFullscreen}
              className="text-white/70 hover:text-white"
            >
              <Minimize size={24} />
            </button>
          </div>
        )}
      </div>

      {/* ── 0 · In the Lobby ── */}
      <div className="flex flex-col gap-2.5 flex-shrink-0 rounded-3xl p-2">
        <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
          In the Lobby
        </h3>
        <div className="flex -space-x-2.5 min-h-[48px] items-center">
          {players.map((p) => (
            <div
              key={p.id}
              style={{ backgroundColor: p.color }}
              className="w-11 h-11 rounded-full border-[3px] border-[#04040a] flex items-center justify-center text-[11px] font-black shadow-lg hover:z-10 hover:scale-110 transition-transform relative"
              data-tip={p.name}
            >
              {p.name[0]}
            </div>
          ))}
          {players.length === 0 && (
            <p className="text-[10px] text-gray-700 italic">
              WASD · UJHK to join
            </p>
          )}
        </div>
      </div>

      {/* ── 1 · Mini player ── */}
      {!media.isFullscreen && currentItem != null && (
        <div className="bg-white/5 rounded-3xl border border-white/10 p-2 gap-2 min-w-0 w-[400px] h-full flex flex-col">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-indigo-500/20 rounded-xl text-indigo-400 flex-shrink-0">
              <MonitorPlay size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">
                {isPlaying ? "Now Playing" : "Paused"}
              </h3>
              <div className="flex items-center gap-2">
                <img
                  src={currentItem.thumbnail || DEFAULT_THUMB}
                  onError={onThumbError}
                  className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                  alt=""
                />
                <div className="min-w-0 leading-tight">
                  <p className="text-xs font-black text-white truncate">
                    {currentItem.title}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    added by {currentItem.requestedBy}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={media.handlePrev}
                data-tip="Previous"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-20"
              >
                <SkipBack size={14} />
              </button>
              <button
                onClick={media.handlePlayPause}
                data-tip={isPlaying ? "Pause" : "Play"}
                className="p-2 bg-indigo-600 rounded-full text-white shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95"
              >
                {isPlaying ? (
                  <Pause size={16} />
                ) : (
                  <Play size={16} className="ml-px" />
                )}
              </button>
              <button
                onClick={media.handleNext}
                data-tip="Next"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-20"
              >
                <SkipForward size={14} />
              </button>
            </div>
          </div>

          {/* Seekbar */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-mono w-10 text-right">
              {formatTime(seekValue)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={seekValue}
              onChange={(e) => setSeekDrag(+e.target.value)}
              onMouseUp={() => {
                if (seekDrag !== null) {
                  media.handleSeek(seekDrag);
                  setSeekDrag(null);
                }
              }}
              onTouchEnd={() => {
                if (seekDrag !== null) {
                  media.handleSeek(seekDrag);
                  setSeekDrag(null);
                }
              }}
              className="flex-1 h-1.5 appearance-none rounded-full"
              style={seekStyle}
            />
            <span className="text-[10px] text-gray-500 font-mono w-10">
              {duration ? formatTime(duration) : "--:--"}
            </span>
          </div>

          {/* Volume + fullscreen + clear */}
          <div className="flex items-center gap-3">
            <button
              onClick={media.toggleMute}
              data-tip={muted ? "Unmute" : "Mute"}
              className="text-slate-500 hover:text-white"
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : volume}
              onChange={(e) => media.handleVolumeChange(+e.target.value)}
              className="w-20 h-1 appearance-none rounded-full"
              style={volStyle}
            />
            <span className="text-[10px] font-black text-slate-500 w-5">
              {muted ? 0 : volume}
            </span>
            <button
              onClick={media.toggleFullscreen}
              data-tip={media.isFullscreen ? "Exit fullscreen" : "Fullscreen video"}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              {media.isFullscreen ? (
                <Minimize size={14} />
              ) : (
                <Maximize size={14} />
              )}
            </button>
            {totalQueueCount > 0 && (
              <button
                onClick={media.handleClearQueue}
                className="ml-auto text-[10px] text-red-400 font-black uppercase tracking-wider hover:text-red-300"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 2 · Queue ── */}
      <div className="flex flex-col flex-1 min-w-0 items-start rounded-3xl p-2">
        <h3 className="shrink-0 text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">
          Queue
        </h3>
        <div className="w-full flex gap-2 overflow-x-auto py-1 custom-scroll">
          {totalQueueCount === 0 && (
            <p className="text-[10px] text-gray-700 italic text-center py-2">
              Empty
            </p>
          )}

          {media.queue.map((item, idx) => (
            <div
              key={item.id}
              className={`queue-card w-44 flex-shrink-0 flex items-start gap-2 rounded-xl p-2 border ${
                idx === media.playback.currentIndex
                  ? "border-indigo-500/40 bg-indigo-500/10"
                  : "border-white/5 bg-white/5"
              }`}
            >
              <img
                src={item.thumbnail || DEFAULT_THUMB}
                onError={onThumbError}
                className="w-12 h-12 rounded object-cover flex-shrink-0"
                alt=""
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-white truncate leading-tight">
                  {item.title}
                </p>
                <p className="text-[8px] text-gray-500">{item.requestedBy}</p>
              </div>
              <div className="flex flex-col items-center justify-between">
                <button
                  onClick={() => media.handleQueueMove(idx, "up")}
                  disabled={idx === 0}
                  data-tip="Move up"
                  className="p-0.5 text-slate-600 hover:text-white disabled:opacity-20"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  onClick={() => media.handleQueueMove(idx, "down")}
                  disabled={idx === media.queue.length - 1}
                  data-tip="Move down"
                  className="p-0.5 text-slate-600 hover:text-white disabled:opacity-20"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
              <button
                onClick={() => media.handleQueueRemove(idx)}
                data-tip="Remove from queue"
                className="p-0.5 text-slate-700 hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          {media.pendingItems.map((item) => (
            <div
              key={item.id}
              className="w-44 flex-shrink-0 flex items-start gap-2 rounded-xl p-2 border border-indigo-500/20 bg-indigo-500/5 animate-pulse"
            >
              <div className="w-12 h-12 rounded bg-white/10 flex-shrink-0 flex items-center justify-center">
                <Loader2 size={16} className="text-indigo-400 animate-spin" />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5 pt-1">
                <div className="h-2 bg-white/10 rounded-full w-4/5" />
                <div className="h-1.5 bg-white/5 rounded-full w-3/5" />
                <p className="text-[8px] text-indigo-400/70 mt-1">
                  {item.retries > 0
                    ? `retrying… (${item.retries})`
                    : "loading…"}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-1 mt-2">
          <FocusInput
            id="queue-url"
            layer="root"
            wrapperClassName="flex-1"
            value={newUrl}
            onChange={setNewUrl}
            onEnter={addItem}
            placeholder="Add URL…"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white placeholder:text-gray-500 outline-none"
            style={{ caretColor: "#6366f1" }}
          />
          <button
            onClick={addItem}
            data-tip="Add to queue"
            className="p-1 bg-indigo-600 rounded-lg text-white active:scale-90"
          >
            <Plus size={12} />
          </button>
        </div>
        {/* link to setting (dismissable) */}
        {!hideDisclaimer && (
          <div className="flex items-start gap-1 mt-1">
            <p className="flex-1 text-[11px] text-gray-600 leading-tight">
              Only add content you're authorized to play. Streaming-site
              extraction is off by default -{" "}
              <button
                onClick={() => {
                  setSettingsSearchTerm("extraction");
                  setSettingsOpen(true);
                }}
                className="text-indigo-400 hover:underline bg-transparent border-none cursor-pointer"
              >
                enable it in Settings.
              </button>
            </p>
            <button
              onClick={dismissDisclaimer}
              data-tip="Hide this message"
              className="flex-shrink-0 text-gray-700 hover:text-gray-400 p-0.5 -mt-0.5"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {/* ── 3 · System buttons ── */}
      <div className="flex gap-2.5 flex-shrink-0 rounded-3xl p-2">
        <button
          ref={settingsFocus.ref}
          onClick={() => setSettingsOpen(true)}
          data-tip="Settings"
          className={`p-3.5 rounded-2xl border transition-all hover:scale-105 cursor-pointer
            ${
              settingsFocus.focused
                ? "ring-2 ring-indigo-400 scale-110 bg-white/10 border-indigo-400/60 text-white"
                : "bg-white/5 border-white/10 text-gray-500 hover:text-white hover:bg-white/10"
            }
          `}
        >
          <Settings size={18} />
        </button>
        <button
          ref={syncFocus.ref}
          onClick={() => window.dispatchEvent(new Event("open-sync"))}
          data-tip="Sync with another console"
          className={`p-3.5 rounded-2xl border transition-all hover:scale-105 cursor-pointer
            ${
              syncFocus.focused
                ? "ring-2 ring-indigo-400 scale-110 bg-white/10 border-indigo-400/60 text-white"
                : "bg-white/5 border-white/10 text-gray-500 hover:text-white hover:bg-white/10"
            }
          `}
        >
          <Link2 size={18} />
        </button>
        <button
          ref={shutdownFocus.ref}
          onClick={handleShutdown}
          data-tip="Shut down the PC"
          className={`p-3.5 rounded-2xl border transition-all hover:scale-105 cursor-pointer
            ${
              shutdownFocus.focused
                ? "ring-2 ring-red-400 scale-110 bg-red-500/20 border-red-400/60 text-red-400"
                : "bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20"
            }
          `}
        >
          <LogOut size={18} />
        </button>
      </div>

      {isSettingsOpen && (
        <SettingsModal
          onClose={handleCloseSettings}
          initialSearch={settingsSearchTerm}
        />
      )}
    </div>
  );
}
