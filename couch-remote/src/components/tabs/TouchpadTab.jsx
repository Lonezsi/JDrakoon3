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

// Combo autocomplete: when the line starts with ".", suggest the next token.
// Modifiers first, then named keys, then mouse actions (held-modifier clicks).
const COMBO_TOKENS = [
  "ctrl", "shift", "alt", "win",
  "enter", "esc", "tab", "space", "backspace", "delete",
  "up", "down", "left", "right", "home", "end", "pageup", "pagedown", "insert",
  "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
  "click", "rightclick",
];

function comboSuggestions(text) {
  if (!text.startsWith(".")) return [];
  const tokens = text.slice(1).split(/\s+/);
  const last = (tokens[tokens.length - 1] || "").toLowerCase();
  const chosen = new Set(tokens.slice(0, -1).map((t) => t.toLowerCase()));
  return COMBO_TOKENS.filter(
    (c) => !chosen.has(c) && c.startsWith(last),
  ).slice(0, 10);
}

export default function TouchpadTab() {
  const [inputText, setInputText] = useState("");
  const [twoFinger, setTwoFinger] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ripples, setRipples] = useState([]); // instant visual feedback on touch
  const rippleId = useRef(0);
  const touchRef = useRef(null);
  const inputRef = useRef(null);

  const suggestions = comboSuggestions(inputText);
  // Replace the token being typed with a tapped suggestion, keep the keyboard up.
  const completeCombo = (cand) => {
    const tokens = inputText.slice(1).split(/\s+/);
    tokens[tokens.length - 1] = cand;
    setInputText("." + tokens.join(" ") + " ");
    inputRef.current?.focus();
  };

  const spawnRipple = (clientX, clientY) => {
    const el = touchRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const id = ++rippleId.current;
    setRipples((rs) => [...rs, { id, x: clientX - r.left, y: clientY - r.top }]);
    setTimeout(() => setRipples((rs) => rs.filter((p) => p.id !== id)), 450);
  };
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
    const v = inputText.trim();
    if (!v) return;
    // A leading "." turns the line into a key combo: ".ctrl c" -> Ctrl+C,
    // ".alt f4" -> Alt+F4. Otherwise it's typed as literal text.
    if (v.startsWith(".")) {
      sendAction(Actions.KEY_COMBO, { combo: v.slice(1).trim() });
    } else {
      sendAction(Actions.TEXT_INPUT, { text: inputText });
    }
    setInputText("");
  };

  const handleTouchStart = (e) => {
    const g = gesture.current;
    if (e.touches[0]) spawnRipple(e.touches[0].clientX, e.touches[0].clientY);
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
        className={`relative overflow-hidden flex-1 rounded-3xl border-2 border-dashed flex items-center justify-center font-bold text-sm transition-colors select-none ${
          dragging
            ? "border-indigo-400/60 text-indigo-300 bg-indigo-500/10"
            : "border-white/10 text-slate-700 active:bg-white/5"
        }`}
        style={{ background: dragging ? undefined : "rgba(255,255,255,0.02)" }}
      >
        <span className="pointer-events-none">
          {dragging
            ? "Dragging — release to drop"
            : twoFinger
              ? "Two‑finger (scroll / right‑click)"
              : "Drag to move · Tap to click · Hold to grab"}
        </span>
        {ripples.map((r) => (
          <span
            key={r.id}
            className="rv-ripple pointer-events-none absolute rounded-full"
            style={{ left: r.x, top: r.y }}
          />
        ))}
        <style>{`
          .rv-ripple {
            width: 14px; height: 14px; margin: -7px 0 0 -7px;
            background: rgba(99,102,241,0.55);
            transform: scale(0.4); opacity: 0.6;
            animation: rvRipple 0.45s ease-out forwards;
          }
          @keyframes rvRipple {
            to { transform: scale(4); opacity: 0; }
          }
        `}</style>
      </div>

      {/* Combo autocomplete — chips for the next token when typing ".…" */}
      {suggestions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mb-1">
          {suggestions.map((s) => (
            <button
              key={s}
              onPointerDown={(e) => {
                e.preventDefault();
                completeCombo(s);
              }}
              className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-400/30 text-indigo-200 text-[11px] font-black active:scale-95"
              style={{ touchAction: "manipulation" }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

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
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendText()}
            placeholder="Type to send · .ctrl c · .ctrl click"
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
