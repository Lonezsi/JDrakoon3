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
} from "lucide-react";
import { useMediaPlayer } from "../../hooks/useMediaPlayer";
import { notifService } from "../../services/notificationService";
import { SettingsModal } from "./SettingsModal";
import { useState, useEffect, useCallback } from "react";

interface FooterProps {
  players: { id: string; name: string; color: string }[];
}

const DEFAULT_THUMB = "https://c.tenor.com/W2_zxTEyVd8AAAAd/tenor.gif";

export function Footer({ players }: FooterProps) {
  const media = useMediaPlayer();
  const [newUrl, setNewUrl] = useState("");
  const [seekDrag, setSeekDrag] = useState<number | null>(null);

  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);

  const [isSettingsOpen, setSettingsOpen] = useState(false);

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

  const handleUrlKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      addItem();
    }
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

  // Total item count for "Clear" visibility
  const totalQueueCount = media.queue.length + media.pendingItems.length;

  const handleShutdown = () => {
    notifService.push("Shutting down…");
    // Tell the backend to exit (it will kill the kiosk window if running)
    fetch("/api/shutdown", { method: "POST" }).catch(() => {});
    // Force-close the window after a short delay
    setTimeout(() => window.close(), 500);
  };

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

      {/* In the Lobby */}
      <div className="flex flex-col gap-2.5 flex-shrink-0">
        <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
          In the Lobby
        </h3>
        <div className="flex -space-x-2.5 min-h-[48px] items-center">
          {players.map((p) => (
            <div
              key={p.id}
              style={{ backgroundColor: p.color }}
              className="w-11 h-11 rounded-full border-[3px] border-[#04040a] flex items-center justify-center text-[11px] font-black shadow-lg hover:z-10 hover:scale-110 transition-transform relative"
              title={p.name}
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

      {/* Mini player */}
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
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-20"
              >
                <SkipBack size={14} />
              </button>
              <button
                onClick={media.handlePlayPause}
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

      {/* Queue */}
      <div className="flex flex-col flex-1 min-w-0 items-start">
        <h3 className="shrink-0 text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">
          Queue
        </h3>
        <div className="w-full flex gap-2 overflow-x-auto py-1 custom-scroll">
          {totalQueueCount === 0 && (
            <p className="text-[10px] text-gray-700 italic text-center py-2">
              Empty
            </p>
          )}

          {/* Confirmed queue items */}
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
                  className="p-0.5 text-slate-600 hover:text-white disabled:opacity-20"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  onClick={() => media.handleQueueMove(idx, "down")}
                  disabled={idx === media.queue.length - 1}
                  className="p-0.5 text-slate-600 hover:text-white disabled:opacity-20"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
              <button
                onClick={() => media.handleQueueRemove(idx)}
                className="p-0.5 text-slate-700 hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          {/* Pending (optimistic) items — shown with loading shimmer */}
          {media.pendingItems.map((item) => (
            <div
              key={item.id}
              className="w-44 flex-shrink-0 flex items-start gap-2 rounded-xl p-2 border border-indigo-500/20 bg-indigo-500/5 animate-pulse"
            >
              {/* Placeholder thumbnail */}
              <div className="w-12 h-12 rounded bg-white/10 flex-shrink-0 flex items-center justify-center">
                <Loader2 size={16} className="text-indigo-400 animate-spin" />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5 pt-1">
                {/* Shimmer lines */}
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

        {/* Add URL input */}
        <div className="flex gap-1 mt-2">
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            placeholder="Add URL…"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white placeholder:text-gray-500 outline-none"
            style={{ caretColor: "#6366f1" }}
          />
          <button
            onClick={addItem}
            className="p-1 bg-indigo-600 rounded-lg text-white active:scale-90"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* System buttons */}
      <div className="flex gap-2.5 flex-shrink-0">
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-3.5 bg-white/5 rounded-2xl border border-white/10 text-gray-500 hover:text-white hover:bg-white/10 transition-colors hover:scale-105 cursor-pointer"
        >
          <Settings size={18} />
        </button>
        <button
          onClick={handleShutdown}
          className="p-3.5 bg-red-500/10 rounded-2xl border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-colors hover:scale-105 cursor-pointer"
        >
          <LogOut size={18} />
        </button>
      </div>
      {isSettingsOpen && <SettingsModal onClose={handleCloseSettings} />}
    </div>
  );
}
