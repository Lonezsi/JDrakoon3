import { useState } from "react";
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
  Send,
  Settings,
  LogOut,
} from "lucide-react";
import { useMediaPlayer } from "../../hooks/useMediaPlayer";

interface FooterProps {
  players: { id: string; name: string; color: string }[];
}

export function Footer({ players }: FooterProps) {
  const media = useMediaPlayer();
  const [newUrl, setNewUrl] = useState("");

  const addItem = () => {
    if (newUrl.trim()) {
      const adder = players.length > 0 ? players[0].name : "System";
      media.addToQueue(newUrl.trim(), adder);
      setNewUrl("");
    }
  };

  return (
    <div className="flex items-end gap-6 py-4">
      {/* In the Lobby (unchanged) */}
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

      {/* Media Player expanded */}
      <div className="flex-1 bg-white/5 rounded-3xl border border-white/10 p-4 flex flex-col gap-2 min-w-0">
        {/* Top row: current track info + transport */}
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-indigo-500/20 rounded-xl text-indigo-400 flex-shrink-0">
            <MonitorPlay size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">
              {media.currentItem
                ? media.isPlaying
                  ? "Now Playing"
                  : "Paused"
                : "No Media"}
            </h3>
            <div className="flex items-center gap-2">
              {media.currentItem && (
                <>
                  <img
                    src={media.currentItem.thumb}
                    className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                    alt=""
                  />
                  <div className="min-w-0 leading-tight">
                    <p className="text-xs font-black text-white truncate">
                      {media.currentItem.title}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {media.currentItem.channel} · added by{" "}
                      {media.currentItem.addedBy}
                    </p>
                  </div>
                </>
              )}
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
              {media.isPlaying ? (
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

        {/* Seekbar + time */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 font-mono w-10 text-right">
            {media.currentItem?.duration === "LIVE"
              ? "LIVE"
              : `${Math.floor(media.progress * 0.45)}:${String(Math.floor(((media.progress * 0.45) % 1) * 60)).padStart(2, "0")}`}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={media.progress}
            onChange={(e) => media.handleSeek(+e.target.value)}
            className="flex-1 h-1.5 appearance-none rounded-full"
            style={{
              accentColor: "#6366f1",
              background: `linear-gradient(90deg,#6366f1, #a78bfa)`,
            }}
          />
          <span className="text-[10px] text-gray-500 font-mono w-10">
            {media.currentItem?.duration === "LIVE"
              ? "∞"
              : media.currentItem?.duration || "--:--"}
          </span>
        </div>

        {/* Volume + fullscreen + clear */}
        <div className="flex items-center gap-3">
          <button
            onClick={media.toggleMute}
            className="text-slate-500 hover:text-white"
          >
            {media.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={media.muted ? 0 : media.volume}
            onChange={(e) => media.handleVolumeChange(+e.target.value)}
            className="w-20 h-1 appearance-none rounded-full"
            style={{ accentColor: "#6366f1" }}
          />
          <span className="text-[10px] font-black text-slate-500 w-5">
            {media.muted ? 0 : media.volume}
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
          {media.queue.length > 0 && (
            <button
              onClick={media.clearQueue}
              className="ml-auto text-[10px] text-red-400 font-black uppercase tracking-wider hover:text-red-300"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Queue inside main area (horizontal) */}
      <div className="mt-3">
        <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">
          Queue
        </h3>
        <div className="flex gap-2 overflow-x-auto py-1 custom-scroll">
          {media.queue.length === 0 && (
            <p className="text-[10px] text-gray-700 italic text-center py-2">
              Empty
            </p>
          )}
          {media.queue.map((item, idx) => (
            <div
              key={item.id}
              className={`w-44 flex-shrink-0 flex items-start gap-2 rounded-xl p-2 border ${
                idx === media.currentIndex
                  ? "border-indigo-500/40 bg-indigo-500/10"
                  : "border-white/5 bg-white/5"
              }`}
            >
              <img
                src={item.thumb}
                className="w-12 h-12 rounded object-cover flex-shrink-0"
                alt=""
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-white truncate leading-tight">
                  {item.title}
                </p>
                <p className="text-[8px] text-gray-500">
                  {item.channel} · {item.addedBy}
                </p>
              </div>
              <div className="flex flex-col items-center justify-between">
                <button
                  onClick={() => media.moveUp(idx)}
                  disabled={idx === 0}
                  className="p-0.5 text-slate-600 hover:text-white disabled:opacity-20"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  onClick={() => media.moveDown(idx)}
                  disabled={idx === media.queue.length - 1}
                  className="p-0.5 text-slate-600 hover:text-white disabled:opacity-20"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
              <button
                onClick={() => media.removeFromQueue(idx)}
                className="p-0.5 text-slate-700 hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Add input moved inside main area */}
        <div className="flex gap-1 mt-2">
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            placeholder="Add URL…"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white placeholder-gray-600 outline-none"
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

      {/* System buttons (Settings / Logout) unchanged */}
      <div className="flex gap-2.5 flex-shrink-0">
        <button
          onClick={() => {
            /* settings */
          }}
          className="p-3.5 bg-white/5 rounded-2xl border border-white/10 text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Settings size={18} />
        </button>
        <button
          onClick={() => {
            /* logout */
          }}
          className="p-3.5 bg-red-500/10 rounded-2xl border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-colors"
        >
          <LogOut size={18} />
        </button>
      </div>

      {/* Fullscreen overlay */}
      {media.isFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center backdrop-blur-sm">
          <div className="w-full max-w-4xl p-8">
            {/* Large now‑playing card */}
            <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl p-8 flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <img
                  src={media.currentItem?.thumb}
                  className="w-24 h-24 rounded-2xl object-cover shadow-2xl"
                  alt=""
                />
                <div>
                  <h1 className="text-2xl font-black text-white">
                    {media.currentItem?.title || "No Media"}
                  </h1>
                  <p className="text-sm text-gray-400 mt-1">
                    {media.currentItem?.channel} · added by{" "}
                    {media.currentItem?.addedBy}
                  </p>
                  <p className="text-xs text-indigo-400 font-bold mt-2">
                    {media.isPlaying ? "● Playing" : "❚❚ Paused"}
                  </p>
                </div>
              </div>

              {/* Seekbar */}
              <div className="flex items-center gap-3">
                <span className="text-gray-400 font-mono text-sm">
                  {media.currentItem?.duration === "LIVE"
                    ? "LIVE"
                    : `${Math.floor(media.progress * 0.45)}:${String(Math.floor(((media.progress * 0.45) % 1) * 60)).padStart(2, "0")}`}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={media.progress}
                  onChange={(e) => media.handleSeek(+e.target.value)}
                  className="flex-1 h-2 appearance-none rounded-full"
                  style={{ accentColor: "#6366f1" }}
                />
                <span className="text-gray-400 font-mono text-sm">
                  {media.currentItem?.duration || "--:--"}
                </span>
              </div>

              {/* Transport controls */}
              <div className="flex items-center justify-center gap-8">
                <button
                  onClick={media.handlePrev}
                  className="text-white/70 hover:text-white"
                >
                  <SkipBack size={32} />
                </button>
                <button
                  onClick={media.handlePlayPause}
                  className="w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30 hover:scale-105"
                >
                  {media.isPlaying ? (
                    <Pause size={36} className="text-white" />
                  ) : (
                    <Play size={36} className="text-white ml-1" />
                  )}
                </button>
                <button
                  onClick={media.handleNext}
                  className="text-white/70 hover:text-white"
                >
                  <SkipForward size={32} />
                </button>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-4 justify-center">
                <button
                  onClick={media.toggleMute}
                  className="text-white/70 hover:text-white"
                >
                  {media.muted || media.volume === 0 ? (
                    <VolumeX size={24} />
                  ) : (
                    <Volume2 size={24} />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={media.muted ? 0 : media.volume}
                  onChange={(e) => media.handleVolumeChange(+e.target.value)}
                  className="w-48 h-1.5 appearance-none rounded-full"
                  style={{ accentColor: "#6366f1" }}
                />
                <span className="text-white font-bold">
                  {media.muted ? 0 : media.volume}
                </span>
              </div>

              <button
                onClick={media.toggleFullscreen}
                className="self-end text-white/60 hover:text-white underline text-sm font-bold"
              >
                Exit Fullscreen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
