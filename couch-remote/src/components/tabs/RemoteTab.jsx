import { useState, useRef, useEffect } from "react";
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Home,
  Power,
  Volume2,
  VolumeX,
  Keyboard,
  MousePointer2,
  Settings,
} from "lucide-react";

import { sendAction, Actions } from "../../services/inputActions";

// Physical-feel button with press animation (Tailwind + inline for dynamics)
function PadBtn({
  onPress,
  children,
  circle,
  accent,
  size = 48,
  extraStyle = {},
}) {
  const [down, setDown] = useState(false);

  const press = (e) => {
    e.preventDefault();
    setDown(true);
    onPress?.();
  };
  const lift = () => setDown(false);

  // static Tailwind classes
  const baseClasses = `flex items-center justify-center flex-shrink-0
    border-2 cursor-pointer outline-none select-none
    transition-transform duration-[70ms]`;

  // circle or rounded
  const radiusClass = circle ? "rounded-full" : "rounded-[11px]";

  // dynamic border color (accent or default)
  const borderColor = accent ? `${accent}45` : "#70708a05";

  return (
    <button
      onPointerDown={press}
      onPointerUp={lift}
      onPointerLeave={lift}
      onPointerCancel={lift}
      onContextMenu={(e) => e.preventDefault()}
      className={`${baseClasses} ${radiusClass}`}
      style={{
        width: size,
        height: size,
        borderColor: borderColor,
        background: down ? "#00000004" : "#ffffff04",
        boxShadow: down
          ? "none"
          : "0 3px 0 #06060a, inset 0 1px 0 rgba(255,255,255,0.055)",
        color: "#70708a",
        transform: down ? "translateY(2px)" : "none",
        WebkitTapHighlightColor: "transparent",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        touchAction: "none",
        fontFamily: "inherit",
        ...extraStyle,
      }}
    >
      {children}
    </button>
  );
}

// Thin visual divider between D-pad and ABXY
const Divider = () => (
  <div className="w-px h-[90px] bg-[#1c1c28] flex-shrink-0" />
);

// ── Analog joystick (touch / mouse) ──────────────────────────────
// iOS-safe: no setPointerCapture (flaky in Safari) — instead we track the
// active pointerId and listen on window, so dragging outside the tiny pad
// keeps working and release is never missed.
function Joystick({ onMove, size = 50, knobSize = 48, accent = "#6366f1" }) {
  const containerRef = useRef(null);
  const knobRef = useRef(null);
  const activeId = useRef(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const center = size / 2;
  const maxRadius = (size - knobSize) / 2;

  const setKnob = (dx, dy) => {
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx + center - knobSize / 2}px, ${dy + center - knobSize / 2}px)`;
    }
  };

  useEffect(() => {
    const update = (clientX, clientY) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let dx = clientX - rect.left - center;
      let dy = clientY - rect.top - center;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }
      setKnob(dx, dy);
      onMoveRef.current(dx / maxRadius, dy / maxRadius);
    };

    const release = () => {
      activeId.current = null;
      setKnob(0, 0);
      onMoveRef.current(0, 0);
      // resend the release shortly after, in case the first packet is lost
      setTimeout(() => onMoveRef.current(0, 0), 90);
    };

    const onPointerMove = (e) => {
      if (activeId.current === null || e.pointerId !== activeId.current)
        return;
      e.preventDefault();
      update(e.clientX, e.clientY);
    };
    const onPointerEnd = (e) => {
      if (activeId.current === null || e.pointerId !== activeId.current)
        return;
      release();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = (e) => {
    e.preventDefault();
    activeId.current = e.pointerId;
    const rect = containerRef.current.getBoundingClientRect();
    let dx = e.clientX - rect.left - center;
    let dy = e.clientY - rect.top - center;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnob(dx, dy);
    onMoveRef.current(dx / maxRadius, dy / maxRadius);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onContextMenu={(e) => e.preventDefault()}
      className="relative select-none cursor-pointer"
      style={{
        width: size,
        height: size,
        touchAction: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {/* Outer ring */}
      <div
        className="absolute inset-0 rounded-full border pointer-events-none"
        style={{
          background: `${accent}10`,
          borderColor: `${accent}25`,
          boxShadow: `0 0 0 3px ${accent}10`,
        }}
      />
      {/* Joystick knob */}
      <div
        ref={knobRef}
        className="absolute rounded-full shadow-lg pointer-events-none"
        style={{
          width: knobSize,
          height: knobSize,
          background: `radial-gradient(circle at 30% 30%, ${accent}, ${accent}88)`,
          top: 0,
          left: 0,
          transform: `translate(${center - knobSize / 2}px, ${center - knobSize / 2}px)`,
        }}
      />
    </div>
  );
}

const SHOULDERS = [
  ["L2", "l2"],
  ["L1", "l1"],
  ["R1", "r1"],
  ["R2", "r2"],
];

export default function RemoteTab() {
  const [vol, setVol] = useState(72);
  const [muted, setMuted] = useState(false);
  const currentVol = muted ? 0 : vol;

  // Right stick drives the OS mouse pointer — works on the dashboard AND
  // inside a launched app. Emit continuously while deflected.
  const rightStick = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const { x, y } = rightStick.current;
      if (x !== 0 || y !== 0) {
        sendAction(Actions.MOUSE_MOVE, { dx: x * 14, dy: y * 14 });
      }
    }, 33);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="h-full min-h-[-webkit-fill-available] flex flex-col overflow-hidden gap-2 select-none"
      style={{
        padding:
          "calc(10px + env(safe-area-inset-top, 0px)) 20px calc(10px + env(safe-area-inset-bottom, 0px))",
        boxSizing: "border-box",
        fontFamily: "'SF Mono', 'Roboto Mono', ui-monospace, monospace",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {/* Slider custom styles */}
      <style>{`
        .rv-slider {
          -webkit-appearance: none; appearance: none;
          height: 3px; border-radius: 2px; outline: none; cursor: pointer;
          background: linear-gradient(
            to right,
            #6366f1 ${currentVol}%,
            #202030 ${currentVol}%
          );
        }
        .rv-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: #6366f1; cursor: pointer;
          box-shadow: 0 0 0 3px #6366f120;
        }
        .rv-slider::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%;
          background: #6366f1; border: none; cursor: pointer;
        }
      `}</style>

      {/* ── System bar ───────────────────────────────────────────── */}
      <div className="flex max-h-[30px] mb-1 justify-between items-center">
        <PadBtn onPress={() => sendAction(Actions.HOME)}>
          <Home size={17} />
        </PadBtn>
        <PadBtn onPress={() => sendAction(Actions.BACK)}>
          <ArrowLeft size={17} />
        </PadBtn>
        <PadBtn onPress={() => sendAction(Actions.MENU)}>
          <Settings size={17} />
        </PadBtn>
        <PadBtn onPress={() => sendAction(Actions.POWER)} accent="#f87171">
          <Power size={17} />
        </PadBtn>
      </div>

      {/* ── Shoulder buttons / triggers ──────────────────────────── */}
      <div className="flex gap-2">
        {SHOULDERS.map(([label, btn]) => (
          <div key={btn} className="flex-1">
            <PadBtn
              onPress={() => sendAction(Actions.GP_BUTTON, { button: btn })}
              extraStyle={{
                width: "100%",
                height: 32,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: 0.5,
              }}
            >
              {label}
            </PadBtn>
          </div>
        ))}
      </div>

      {/* ── Face plate ───────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex items-center justify-evenly rounded-[22px] border border-[#1c1c26] shadow-[inset_0_2px_10px_rgba(0,0,0,0.45)] overflow-hidden">
        {/* D-pad + left stick */}
        <div className="grid grid-cols-3 gap-1.5 items-center justify-items-center">
          {/* row 1 */}
          <div />
          <PadBtn onPress={() => sendAction(Actions.NAV_UP)}>
            <ArrowUp size={18} />
          </PadBtn>
          <div />
          {/* row 2 */}
          <PadBtn onPress={() => sendAction(Actions.NAV_LEFT)}>
            <ArrowLeft size={18} />
          </PadBtn>
          <Joystick
            size={50}
            knobSize={20}
            accent="#6366f1"
            onMove={(x, y) => sendAction(Actions.CUBE_MOVE, { x, y })}
          />
          <PadBtn onPress={() => sendAction(Actions.NAV_RIGHT)}>
            <ArrowRight size={18} />
          </PadBtn>
          {/* row 3 */}
          <div />
          <PadBtn onPress={() => sendAction(Actions.NAV_DOWN)}>
            <ArrowDown size={18} />
          </PadBtn>
          <div />
        </div>

        <Divider />

        {/* ABXY diamond with the right stick (mouse) in the middle */}
        <div className="grid grid-cols-3 gap-1.5 items-center justify-items-center">
          <div />

          <PadBtn
            onPress={() => sendAction(Actions.Y)}
            circle
            accent="#eab308"
            extraStyle={{
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: 0.5,
              color: "#facc15",
            }}
          >
            Y
          </PadBtn>
          <div />

          <PadBtn
            onPress={() => sendAction(Actions.X)}
            circle
            accent="#3b82f6"
            extraStyle={{
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: 0.5,
              color: "#60a5fa",
            }}
          >
            X
          </PadBtn>

          <Joystick
            size={50}
            knobSize={20}
            accent="#22d3ee"
            onMove={(x, y) => {
              rightStick.current = { x, y };
            }}
          />

          <PadBtn
            onPress={() => sendAction(Actions.B)}
            circle
            accent="#ef4444"
            extraStyle={{
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: 0.5,
              color: "#f87171",
            }}
          >
            B
          </PadBtn>

          <div />

          <PadBtn
            onPress={() => sendAction(Actions.A)}
            circle
            accent="#22c55e"
            extraStyle={{
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: 0.5,
              color: "#4ade80",
            }}
          >
            A
          </PadBtn>
          <div />
        </div>
      </div>

      {/* ── Start / Select ───────────────────────────────────────── */}
      <div className="flex justify-center gap-3">
        <PadBtn
          onPress={() => sendAction(Actions.SELECT)}
          extraStyle={{
            width: 84,
            height: 28,
            borderRadius: 14,
            fontWeight: 800,
            fontSize: 10,
            letterSpacing: 1,
          }}
        >
          SELECT
        </PadBtn>
        <PadBtn
          onPress={() => sendAction(Actions.START)}
          extraStyle={{
            width: 84,
            height: 28,
            borderRadius: 14,
            fontWeight: 800,
            fontSize: 10,
            letterSpacing: 1,
          }}
        >
          START
        </PadBtn>
      </div>

      {/* ── Bottom controls ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 max-h-[15px] mt-2 mb-1">
        <button
          onClick={() => setMuted((m) => !m)}
          className="bg-transparent border-none px-1 py-[6px] text-[#3c3c50] cursor-pointer flex items-center flex-shrink-0"
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
            setVol(+e.target.value);
            setMuted(false);
            sendAction(Actions.MEDIA_VOLUME, { volume: +e.target.value });
          }}
          className="rv-slider flex-1"
        />

        <span className="text-[11px] font-bold text-[#2e2e40] min-w-[22px] text-right">
          {currentVol}
        </span>

        <PadBtn
          onPress={() => sendAction(Actions.KEY_PRESS, { key: "Keyboard" })}
          size={42}
        >
          <Keyboard size={15} />
        </PadBtn>
        <PadBtn
          onPress={() => sendAction(Actions.KEY_PRESS, { key: "Touchpad" })}
          size={42}
        >
          <MousePointer2 size={15} />
        </PadBtn>
      </div>
    </div>
  );
}
