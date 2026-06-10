import { useState, useRef, useEffect } from "react";
import { Keyboard, CornerDownLeft, MousePointerClick } from "lucide-react";
import { sendAction, Actions } from "../../services/inputActions";

// Key button: fires once on press, then auto-repeats while held
// (380 ms delay, then ~14/s — most useful for Backspace).
// Pointer-based + select-none so long pressing never selects the label
// or opens the iOS callout.
function HoldKeyBtn({ label, onFire, accent }) {
  const timer = useRef(null);
  const repeater = useRef(null);

  const stop = () => {
    clearTimeout(timer.current);
    clearInterval(repeater.current);
  };
  useEffect(() => stop, []);

  const start = (e) => {
    e.preventDefault();
    onFire();
    timer.current = setTimeout(() => {
      repeater.current = setInterval(onFire, 70);
    }, 380);
  };

  return (
    <button
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex-1 min-w-[60px] py-2 rounded-lg border font-black text-[10px] active:scale-95 select-none ${
        accent
          ? "bg-indigo-500/15 border-indigo-400/30 text-indigo-300"
          : "bg-white/5 border-white/10 text-slate-400"
      }`}
      style={{
        touchAction: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {label}
    </button>
  );
}

// Long-press (hold still) before dragging = click-and-drag
const HOLD_MS = 280; // hold this long without moving to grab
const HOLD_SLOP_PX = 12; // movement beyond this cancels the hold

export default function TouchpadTab() {
  const [inputText, setInputText] = useState("");
  const [twoFinger, setTwoFinger] = useState(false);
  const [dragging, setDragging] = useState(false);
  const touchRef = useRef(null);
  // Gesture state lives in a ref — touch events fire too fast for setState.
  const gesture = useRef({
    lastX: 0,
    lastY: 0,
    lastScrollY: 0,
    startX: 0,
    startY: 0,
    moved: false,
    dragging: false,
    suppressClick: false,
    holdTimer: null,
  });

  useEffect(() => () => clearTimeout(gesture.current.holdTimer), []);

  const endDrag = () => {
    const g = gesture.current;
    clearTimeout(g.holdTimer);
    if (g.dragging) {
      g.dragging = false;
      g.suppressClick = true;
      setDragging(false);
      sendAction(Actions.MOUSE_UP);
    }
  };

  const sendText = () => {
    if (inputText.trim()) {
      sendAction(Actions.TEXT_INPUT, { text: inputText });
      setInputText("");
    }
  };

  const handleTouchStart = (e) => {
    const g = gesture.current;
    if (e.touches.length >= 2) {
      setTwoFinger(true);
      // a second finger means scroll/right-click — abandon any pending hold
      endDrag();
      clearTimeout(g.holdTimer);
    }
    // Seed last-position so the first move after (re)touching has a zero
    // delta instead of jumping from a stale previous-touch coordinate.
    const t = e.touches[0];
    g.lastX = t.clientX;
    g.lastY = t.clientY;
    g.lastScrollY = t.clientY;

    if (e.touches.length === 1) {
      g.startX = t.clientX;
      g.startY = t.clientY;
      g.moved = false;
      g.suppressClick = false;
      clearTimeout(g.holdTimer);
      // Hold still long enough → grab (left button down) and drag from there.
      g.holdTimer = setTimeout(() => {
        if (!g.moved && !g.dragging) {
          g.dragging = true;
          setDragging(true);
          sendAction(Actions.MOUSE_DOWN);
          try {
            navigator.vibrate?.(30);
          } catch {
            console.warn("Vibration API error");
          }
        }
      }, HOLD_MS);
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length === 0) {
      setTwoFinger(false);
      endDrag();
    }
  };

  const handleTouchMove = (e) => {
    const g = gesture.current;
    if (e.touches.length === 1 && !twoFinger) {
      const t = e.touches[0];
      const dx = t.clientX - (g.lastX || t.clientX);
      const dy = t.clientY - (g.lastY || t.clientY);
      g.lastX = t.clientX;
      g.lastY = t.clientY;

      // Moving before the hold fires = a normal cursor move, not a grab.
      if (
        !g.dragging &&
        Math.hypot(t.clientX - g.startX, t.clientY - g.startY) > HOLD_SLOP_PX
      ) {
        g.moved = true;
        clearTimeout(g.holdTimer);
      }

      // Cursor moves the same way whether or not the button is held.
      sendAction(Actions.MOUSE_MOVE, { dx, dy });
    } else if (e.touches.length === 2) {
      const t = e.touches[0];
      const dy = t.clientY - (g.lastScrollY || t.clientY);
      g.lastScrollY = t.clientY;
      sendAction(Actions.SCROLL, { dy });
    }
  };

  const handleTap = () => {
    const g = gesture.current;
    // A completed drag (or its release) must not also fire a click.
    if (g.suppressClick) {
      g.suppressClick = false;
      return;
    }
    if (twoFinger) {
      sendAction(Actions.MOUSE_RIGHT_CLICK);
    } else {
      sendAction(Actions.MOUSE_CLICK);
    }
  };

  return (
    <div className="flex flex-col gap-4 pt-3 h-full px-2 pb-2">
      {/* Touch surface */}
      <div
        ref={touchRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onClick={handleTap}
        className={`flex-1 rounded-3xl border-2 border-dashed flex items-center justify-center font-bold text-sm transition-colors select-none ${
          dragging
            ? "border-indigo-400/60 text-indigo-300 bg-indigo-500/10"
            : "border-white/10 text-slate-700 active:bg-white/5"
        }`}
        style={{ background: dragging ? undefined : "rgba(255,255,255,0.02)" }}
      >
        <span>
          {dragging
            ? "Dragging — release to drop"
            : twoFinger
              ? "Two‑finger (scroll / right‑click)"
              : "Drag to move · Tap to click · Hold to grab"}
        </span>
      </div>

      <div className="flex flex-col landscape:flex-row gap-2">
        {/* Utility row — hold any key for auto-repeat */}
        <div className="flex flex-wrap gap-1.5 flex-1">
          {["ESC", "ALT+TAB", "WIN", "Backspace", "Enter"].map((key) => (
            <HoldKeyBtn
              key={key}
              label={key}
              onFire={() => sendAction(Actions.KEY_PRESS, { key })}
            />
          ))}
          <HoldKeyBtn
            accent
            label={
              <span className="inline-flex items-center gap-1">
                <MousePointerClick size={11} /> R-CLICK
              </span>
            }
            onFire={() => sendAction(Actions.MOUSE_RIGHT_CLICK)}
          />
        </div>

        {/* Keyboard input */}
        <div className="flex gap-1.5 items-center flex-1">
          <Keyboard size={15} className="text-slate-400 flex-shrink-0" />
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendText()}
            placeholder="Type to send to TV…"
            className="flex-1 rounded-xl px-3 py-2.5 text-xs font-bold outline-none"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1.5px solid rgba(255,255,255,0.09)",
              color: "#f1f5f9",
              caretColor: "#6366f1",
            }}
          />
          <button
            onClick={sendText}
            className="p-2.5 rounded-xl bg-indigo-600 active:scale-90 text-white"
          >
            <CornerDownLeft size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
