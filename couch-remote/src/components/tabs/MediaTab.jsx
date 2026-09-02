import { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Trash2,
  ChevronUp,
  ChevronDown,
  Shuffle,
  Repeat,
  Plus,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";
import { sendAction, Actions } from "../../services/inputActions";
import { useConsoleState } from "../../hooks/useConsoleState";

// Seconds → "m:ss" (server durations/positions are in seconds).
function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

// Stable accent colour per item so the letter-tiles look intentional (real
// queue items carry no colour — that was mock data).
const PALETTE = [
  "#6366f1",
  "#22c55e",
  "#ec4899",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#06b6d4",
];
function colorFor(key) {
  const s = String(key || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// ── Animated equaliser bars ────────────────────────────────────────────
function NowPlayingBars() {
  return (
    <div className="flex items-end gap-0.5 h-3.5">
      {[5, 10, 7, 12, 6].map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm bg-[#6366f1]"
          style={{
            height: h,
            animation: `barBounce 0.8s ease-in-out infinite`,
            animationDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ── Big play/pause button ──────────────────────────────────────────────
function PlayBtn({ playing, onPress }) {
  const [down, setDown] = useState(false);
  const press = (e) => {
    e.preventDefault();
    setDown(true);
    onPress?.();
  };
  const lift = () => setDown(false);

  return (
    <button
      onMouseDown={press}
      onMouseUp={lift}
      onMouseLeave={lift}
      onTouchStart={press}
      onTouchEnd={lift}
      onTouchCancel={lift}
      className="w-[68px] h-[68px] rounded-full flex items-center justify-center border-none cursor-pointer outline-none transition-transform duration-[70ms]"
      style={{
        background: down ? "#4f52cc" : "#6366f1",
        boxShadow: down ? "none" : "0 8px 24px #6366f150",
        transform: down ? "scale(0.94) translateY(1px)" : "none",
        WebkitTapHighlightColor: "transparent",
        color: "#fff",
      }}
    >
      {playing ? (
        <Pause size={26} />
      ) : (
        <Play size={26} style={{ marginLeft: 3 }} />
      )}
    </button>
  );
}

// ── Skip button ────────────────────────────────────────────────────────
function SkipBtn({ onPress, children }) {
  const [down, setDown] = useState(false);
  const press = (e) => {
    e.preventDefault();
    setDown(true);
    onPress?.();
  };
  const lift = () => setDown(false);

  return (
    <button
      onMouseDown={press}
      onMouseUp={lift}
      onMouseLeave={lift}
      onTouchStart={press}
      onTouchEnd={lift}
      onTouchCancel={lift}
      className="w-[54px] h-[54px] rounded-full flex items-center justify-center border border-[#252530] cursor-pointer outline-none transition-transform duration-[70ms]"
      style={{
        background: down
          ? "#101014"
          : "linear-gradient(155deg, #1c1c25 0%, #14141a 100%)",
        boxShadow: down
          ? "none"
          : "0 3px 0 #06060a, inset 0 1px 0 rgba(255,255,255,0.055)",
        color: "#60607a",
        transform: down ? "translateY(2px)" : "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {children}
    </button>
  );
}

// ── Thumbnail placeholder ──────────────────────────────────────────────
function Thumb({ color, size = 48, radius = 10, title = "" }) {
  const letter = title?.[0]?.toUpperCase() || "♪";
  return (
    <div
      className="flex items-center justify-center flex-shrink-0 font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: color + "22",
        border: `1px solid ${color}35`,
        color: color,
        fontSize: size * 0.35,
      }}
    >
      {letter}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────
export default function MediaTab() {
  const media = useConsoleState();

  // Queue + now-playing + transport state come straight from the server (the
  // dashboard is the source of truth); only the slider values are kept locally
  // so dragging stays smooth, synced back from the server between drags.
  const queue = media.queue ?? [];
  const pendingItems = media.pendingItems ?? [];
  const currentItem = media.currentItem ?? null;
  const playing = !!media.playing;
  const loop = !!media.loop;
  const shuffle = !!media.shuffle;
  const duration = currentItem?.duration ?? 0;

  const [volume, setVolume] = useState(media.volume ?? 72);
  const [muted, setMuted] = useState(media.muted ?? false);
  const [progress, setProgress] = useState(media.progress ?? 0);
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState(null);
  const [hideDisclaimer, setHideDisclaimer] = useState(false);
  const seekGuard = useRef(0); // ignore server position right after a local seek

  // The "only add content you're authorized to play" note is dismissable and
  // its hidden state persists (settings.media.hideQueueDisclaimer).
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setHideDisclaimer(!!s?.media?.hideQueueDisclaimer))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const ev = media.lastEvent;
    if (ev?.type === "settings_updated" && ev.settings)
      setHideDisclaimer(!!ev.settings.media?.hideQueueDisclaimer);
  }, [media.lastEvent]);

  const dismissDisclaimer = () => {
    setHideDisclaimer(true);
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media: { hideQueueDisclaimer: true } }),
    }).catch(() => {});
  };

  useEffect(() => setVolume(media.volume ?? 72), [media.volume]);
  useEffect(() => setMuted(!!media.muted), [media.muted]);
  useEffect(() => {
    if (Date.now() - seekGuard.current > 1200) setProgress(media.progress ?? 0);
  }, [media.progress]);

  useEffect(() => {
    const ev = media.lastEvent;
    if (ev && (ev.type === "queue_add_failed" || ev.type === "video_error")) {
      setError(ev.message || "Couldn't add that to the queue.");
      const t = setTimeout(() => setError(null), 4500);
      return () => clearTimeout(t);
    }
  }, [media.lastEvent]);

  const currentVol = muted ? 0 : volume;
  const pct = duration ? Math.min(100, (progress / duration) * 100) : 0;

  const addToQueue = () => {
    if (newUrl.trim()) {
      sendAction(Actions.ADD_TO_QUEUE, { url: newUrl });
      setNewUrl("");
    }
  };
  const seek = (secs) => {
    seekGuard.current = Date.now();
    setProgress(secs);
    sendAction(Actions.MEDIA_SEEK, { progress: secs });
  };

  return (
    <div
      className="flex flex-col overflow-hidden gap-2.5 select-none"
      style={{
        padding:
          "calc(14px + env(safe-area-inset-top, 0px)) 18px calc(14px + env(safe-area-inset-bottom, 0px))",
        boxSizing: "border-box",
        fontFamily: "'SF Mono', 'Roboto Mono', ui-monospace, monospace",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <style>{`
        @keyframes barBounce {
          0%, 100% { transform: scaleY(1); }
          50%       { transform: scaleY(0.3); }
        }
        .rv-seek, .rv-vol {
          -webkit-appearance: none; appearance: none;
          height: 3px; border-radius: 2px; outline: none; cursor: pointer;
        }
        .rv-seek { background: linear-gradient(to right, #6366f1 ${pct}%, #1e1e2a ${pct}%); }
        .rv-vol  { background: linear-gradient(to right, #6366f1 ${currentVol}%, #1e1e2a ${currentVol}%); }
        .rv-seek::-webkit-slider-thumb,
        .rv-vol::-webkit-slider-thumb {
          -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%;
          background: #6366f1; cursor: pointer; box-shadow: 0 0 0 3px #6366f120;
        }
        .rv-seek::-moz-range-thumb,
        .rv-vol::-moz-range-thumb {
          width: 13px; height: 13px; border-radius: 50%;
          background: #6366f1; border: none; cursor: pointer;
        }
        .queue-scroll::-webkit-scrollbar { width: 3px; }
        .queue-scroll::-webkit-scrollbar-track { background: transparent; }
        .queue-scroll::-webkit-scrollbar-thumb { background: #202030; border-radius: 2px; }
      `}</style>

      {/* ── Now playing card ─────────────────────────────────────── */}
      <div className="rounded-[18px] border border-[#1c1c26] p-3 px-3.5 flex gap-3.5 items-center flex-shrink-0">
        {currentItem ? (
          <Thumb
            color={colorFor(currentItem.id)}
            size={56}
            radius={12}
            title={currentItem.title}
          />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-[#1a1a22] border border-[#252530] flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="m-0 text-[13px] font-extrabold text-[#e8e8f0] whitespace-nowrap overflow-hidden text-ellipsis">
            {currentItem?.title ?? "Nothing playing"}
          </p>
          <p className="mt-[3px] text-[10px] text-[#44445a] font-bold tracking-[0.03em] truncate">
            {currentItem
              ? `added by ${currentItem.requestedBy || "someone"}`
              : "Add something to the queue"}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            {playing && currentItem ? (
              <NowPlayingBars />
            ) : (
              <div className="w-2.5 h-2.5 rounded-[3px] bg-[#252530]" />
            )}
            <span
              className={`text-[9px] font-extrabold uppercase tracking-[0.08em] ${
                playing && currentItem ? "text-[#6366f1]" : "text-[#333340]"
              }`}
            >
              {playing && currentItem ? "Playing" : "Paused"}
            </span>
          </div>
        </div>
        <span className="text-[10px] text-[#2e2e40] font-bold flex-shrink-0">
          {currentItem ? formatTime(duration) : "—"}
        </span>
      </div>

      {/* ── Seek bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[9px] font-bold text-[#2e2e40] w-7 text-right tabular-nums">
          {formatTime(progress)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          step={1}
          value={Math.min(progress, duration || 0)}
          disabled={!currentItem}
          onChange={(e) => seek(+e.target.value)}
          className="rv-seek flex-1"
        />
        <span className="text-[9px] font-bold text-[#2e2e40] w-7 tabular-nums">
          {formatTime(duration)}
        </span>
      </div>

      {/* ── Playback controls ────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-[18px] flex-shrink-0">
        <SkipBtn onPress={() => sendAction(Actions.MEDIA_PREV)}>
          <SkipBack size={20} />
        </SkipBtn>
        <PlayBtn
          playing={playing}
          onPress={() => sendAction(Actions.MEDIA_PLAY_PAUSE)}
        />
        <SkipBtn onPress={() => sendAction(Actions.MEDIA_NEXT)}>
          <SkipForward size={20} />
        </SkipBtn>
      </div>

      {/* ── Volume ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => sendAction(Actions.MEDIA_MUTE)}
          className="bg-transparent border-none p-1 text-[#333345] cursor-pointer flex items-center flex-shrink-0"
        >
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={currentVol}
          onChange={(e) => {
            setVolume(+e.target.value);
            setMuted(false);
            sendAction(Actions.MEDIA_VOLUME, { volume: +e.target.value });
          }}
          className="rv-vol flex-1"
        />
        <span className="text-[10px] font-bold text-[#2a2a3a] min-w-[20px] text-right">
          {currentVol}
        </span>
      </div>

      {/* ── Toggle row ───────────────────────────────────────────── */}
      <div className="flex gap-[7px] flex-shrink-0">
        {[
          {
            label: "Loop",
            icon: <Repeat size={13} />,
            active: loop,
            onPress: () => sendAction(Actions.LOOP_TOGGLE),
          },
          {
            label: "Shuffle",
            icon: <Shuffle size={13} />,
            active: shuffle,
            onPress: () => sendAction(Actions.SHUFFLE_QUEUE),
          },
          {
            label: "Speed",
            icon: null,
            active: false,
            onPress: () => sendAction(Actions.PLAYBACK_SPEED, { speed: 2 }),
          },
          {
            label: "Subs",
            icon: null,
            active: false,
            onPress: () => sendAction(Actions.SUBTITLES_TOGGLE),
          },
        ].map(({ label, icon, active, onPress }) => (
          <button
            key={label}
            onClick={onPress}
            className="flex-1 h-[38px] rounded-[10px] flex items-center justify-center gap-[5px] border cursor-pointer outline-none text-[11px] font-extrabold tracking-[0.04em]"
            style={{
              borderColor: active ? "#6366f145" : "#222230",
              background: active
                ? "linear-gradient(155deg, #5254c8 0%, #4547b0 100%)"
                : "linear-gradient(155deg, #1a1a22 0%, #131318 100%)",
              boxShadow: active
                ? "0 3px 0 #2a2a90, inset 0 1px 0 rgba(255,255,255,0.1)"
                : "0 2px 0 #06060a, inset 0 1px 0 rgba(255,255,255,0.04)",
              color: active ? "#fff" : "#44445a",
              fontFamily: "inherit",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ── Queue ────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col gap-2">
        {/* Queue header */}
        <div className="flex justify-between items-center flex-shrink-0">
          <span className="text-[9px] font-extrabold tracking-[0.12em] text-[#2e2e40] uppercase">
            Queue · {queue.length}
          </span>
          <button
            onClick={() => sendAction(Actions.CLEAR_QUEUE)}
            disabled={queue.length === 0}
            className="bg-transparent border-none text-[10px] font-extrabold text-[#f87171] cursor-pointer p-[2px_0] disabled:opacity-30"
            style={{ fontFamily: "inherit" }}
          >
            Clear
          </button>
        </div>

        {/* Scrollable queue list */}
        <div className="queue-scroll flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
          {queue.length === 0 && pendingItems.length === 0 && (
            <div className="text-center pt-6 text-[#22222e] text-xs font-bold">
              Queue is empty
            </div>
          )}
          {queue.map((item, i) => {
            const isCurrent = item.id === currentItem?.id;
            return (
              <div
                key={item.id}
                className="flex items-center gap-2.5 p-[10px_12px] rounded-2xl bg-gradient-to-b from-[#131318] to-[#0f0f13] flex-shrink-0"
                style={{
                  border: `1px solid ${isCurrent ? "#6366f122" : "#1a1a24"}`,
                }}
              >
                <Thumb
                  color={colorFor(item.id)}
                  size={40}
                  radius={9}
                  title={item.title}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="m-0 text-xs font-bold whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{ color: isCurrent ? "#e0e0f0" : "#888898" }}
                  >
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[9px] text-[#2e2e40] font-bold truncate">
                    {item.requestedBy || "someone"} · {formatTime(item.duration)}
                  </p>
                </div>
                {/* Reorder */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    onClick={() =>
                      i > 0 &&
                      sendAction(Actions.MOVE_QUEUE_ITEM, {
                        index: i,
                        direction: "up",
                      })
                    }
                    disabled={i === 0}
                    className="bg-transparent border-none p-0.5 flex cursor-pointer"
                    style={{
                      color: i === 0 ? "#1e1e28" : "#44445a",
                      cursor: i === 0 ? "default" : "pointer",
                    }}
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    onClick={() =>
                      i < queue.length - 1 &&
                      sendAction(Actions.MOVE_QUEUE_ITEM, {
                        index: i,
                        direction: "down",
                      })
                    }
                    disabled={i === queue.length - 1}
                    className="bg-transparent border-none p-0.5 flex cursor-pointer"
                    style={{
                      color: i === queue.length - 1 ? "#1e1e28" : "#44445a",
                      cursor: i === queue.length - 1 ? "default" : "pointer",
                    }}
                  >
                    <ChevronDown size={13} />
                  </button>
                </div>
                {/* Remove */}
                <button
                  onClick={() =>
                    sendAction(Actions.REMOVE_FROM_QUEUE, { index: i })
                  }
                  className="bg-transparent border-none p-1 flex items-center flex-shrink-0 text-[#252535] cursor-pointer hover:text-[#f87171] transition-colors"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}

          {/* Pending (resolving) items — loading skeletons */}
          {pendingItems.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2.5 p-[10px_12px] rounded-2xl bg-[#0f0f13] flex-shrink-0 animate-pulse"
              style={{ border: "1px solid #6366f122" }}
            >
              <div className="w-10 h-10 rounded-[9px] bg-[#1a1a24] flex items-center justify-center flex-shrink-0">
                <Loader2 size={15} className="text-[#6366f1] animate-spin" />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="h-2 rounded-full bg-[#1c1c28] w-4/5" />
                <div className="h-1.5 rounded-full bg-[#15151d] w-2/5" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Add failed banner ────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-start gap-2 rounded-xl px-3 py-2 flex-shrink-0 text-[11px] font-bold leading-snug"
          style={{
            background: "#f8717112",
            border: "1px solid #f8717130",
            color: "#f8a4a4",
          }}
        >
          <AlertCircle size={14} className="flex-shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Add URL ──────────────────────────────────────────────── */}
      <div className="flex gap-2 items-center flex-shrink-0">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addToQueue()}
          placeholder="Paste URL to add…"
          className="flex-1 h-[44px] rounded-xl px-3.5 text-xs font-bold outline-none bg-[#0f0f14] border border-[#1e1e2a] text-[#b0b0c0] caret-[#6366f1]"
          style={{
            fontFamily: "inherit",
            WebkitUserSelect: "text",
            userSelect: "text",
          }}
        />
        <button
          onClick={addToQueue}
          className="w-[44px] h-[44px] flex-shrink-0 rounded-xl flex items-center justify-center border cursor-pointer outline-none transition-colors duration-200"
          style={{
            background: newUrl.trim() ? "#6366f1" : "#1a1a24",
            borderColor: newUrl.trim() ? "#6366f145" : "#252530",
            boxShadow: newUrl.trim() ? "0 3px 0 #2a2a90" : "0 2px 0 #06060a",
            color: newUrl.trim() ? "#fff" : "#333345",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Plus size={18} />
        </button>
      </div>
      {!hideDisclaimer && (
        <div className="flex items-start gap-1 mt-1.5 px-1 flex-shrink-0">
          <p className="flex-1 text-[9px] text-[#3a3a4a] leading-tight">
            Only add content you're authorized to play. Streaming-site
            extraction is off by default — enable it in the TV's Settings.
          </p>
          <button
            onClick={dismissDisclaimer}
            title="Hide this message"
            className="flex-shrink-0 text-[#2a2a3a] active:text-[#555]"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
