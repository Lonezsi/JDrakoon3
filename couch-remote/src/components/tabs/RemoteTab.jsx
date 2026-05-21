import { useState, useRef } from "react";
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Home,
  Power,
  Volume2,
  VolumeX,
  Maximize,
  Keyboard,
  MousePointer2,
  Settings,
  Triangle,
} from "lucide-react";

import { sendAction, Actions } from "../../services/inputActions";
const navUp = () => sendAction(Actions.NAV_UP);
const navDown = () => sendAction(Actions.NAV_DOWN);
const navLeft = () => sendAction(Actions.NAV_LEFT);
const navRight = () => sendAction(Actions.NAV_RIGHT);
const confirm = () => sendAction(Actions.CONFIRM);
const back = () => sendAction(Actions.BACK);
const home = () => sendAction(Actions.HOME);
const start = () => sendAction(Actions.START);
const menu = () => sendAction(Actions.MENU);
const power = () => sendAction(Actions.POWER);
// ───────────────────────────────────────────────────────────────────────

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
      onMouseDown={press}
      onMouseUp={lift}
      onMouseLeave={lift}
      onTouchStart={press}
      onTouchEnd={lift}
      onTouchCancel={lift}
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
function Joystick({ onMove, size = 50, knobSize = 48, accent = "#6366f1" }) {
  const containerRef = useRef(null);
  const knobRef = useRef(null);
  const [active, setActive] = useState(false);
  const center = { x: size / 2, y: size / 2 };

  const handlePointerDown = (e) => {
    setActive(true);
    containerRef.current?.setPointerCapture(e.pointerId);
    updateKnob(e);
  };

  const handlePointerMove = (e) => {
    if (!active) return;
    updateKnob(e);
  };

  const handlePointerUp = () => {
    setActive(false);
    // Reset to centre
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${center.x - knobSize / 2}px, ${center.y - knobSize / 2}px)`;
    }
    onMove(0, 0);
  };

  const updateKnob = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    let dx = e.clientX - rect.left - center.x;
    let dy = e.clientY - rect.top - center.y;

    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxRadius = (size - knobSize) / 2;

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    // Move the knob visually
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx + center.x - knobSize / 2}px, ${dy + center.y - knobSize / 2}px)`;
    }

    // Send normalised values
    const nx = dx / maxRadius; // -1 to 1
    const ny = dy / maxRadius;
    onMove(nx, ny);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className="relative touch-none select-none cursor-pointer"
      style={{ width: size, height: size }}
    >
      {/* Outer ring */}
      <div
        className="absolute inset-0 rounded-full border"
        style={{
          background: `${accent}10`,
          borderColor: `${accent}25`,
          boxShadow: `0 0 0 3px ${accent}10`,
        }}
      />
      {/* Joystick knob */}
      <div
        ref={knobRef}
        className="absolute rounded-full shadow-lg transition-transform duration-75"
        style={{
          width: knobSize,
          height: knobSize,
          background: `radial-gradient(circle at 30% 30%, ${accent}, ${accent}88)`,
          top: 0,
          left: 0,
          transform: `translate(${center.x - knobSize / 2}px, ${center.y - knobSize / 2}px)`,
        }}
      />
    </div>
  );
}

export default function RemoteTab() {
  const [vol, setVol] = useState(72);
  const [muted, setMuted] = useState(false);
  const currentVol = muted ? 0 : vol;

  return (
    <div
      className="h-full min-h-[-webkit-fill-available] flex flex-col overflow-hidden gap-2.5 select-none"
      style={{
        padding:
          "calc(14px + env(safe-area-inset-top, 0px)) 20px calc(14px + env(safe-area-inset-bottom, 0px))",
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
        <PadBtn onPress={home}>
          <Home size={17} />
        </PadBtn>
        <PadBtn onPress={back}>
          <ArrowLeft size={17} />
        </PadBtn>
        <PadBtn onPress={start}>
          <Triangle size={17} />
        </PadBtn>
        <PadBtn onPress={menu}>
          <Settings size={17} />
        </PadBtn>
        <PadBtn onPress={power} accent="#f87171">
          <Power size={17} />
        </PadBtn>
      </div>

      {/* ── Face plate ───────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex items-center justify-evenly rounded-[22px] border border-[#1c1c26] shadow-[inset_0_2px_10px_rgba(0,0,0,0.45)] overflow-hidden">
        {/* D-pad */}
        <div className="grid grid-cols-3 gap-1.5 items-center justify-items-center">
          {/* row 1 */}
          <div />
          <PadBtn onPress={navUp}>
            <ArrowUp size={18} />
          </PadBtn>
          <div />
          {/* row 2 */}
          <PadBtn onPress={navLeft}>
            <ArrowLeft size={18} />
          </PadBtn>
          <Joystick
            size={50} // slightly larger to fill the space
            knobSize={20} // matches your button size
            accent="#6366f1"
            onMove={(x, y) => sendAction(Actions.CUBE_MOVE, { x, y })}
          />
          <PadBtn onPress={navRight}>
            <ArrowRight size={18} />
          </PadBtn>
          {/* row 3 */}
          <div />
          <PadBtn onPress={navDown}>
            <ArrowDown size={18} />
          </PadBtn>
          <div />
        </div>

        <Divider />

        {/* ABXY diamond */}
        <div className="grid grid-cols-3 gap-1.5 items-center justify-items-center">
          <div />
          <PadBtn
            onPress={confirm}
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

          <PadBtn
            onPress={back}
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
          <div className="w-12 h-12" />
          <PadBtn
            onPress={() => sendAction(Actions.JUMP)}
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

          <div />
          <PadBtn
            onPress={() => sendAction(Actions.EMOTE, { emote: "wave" })}
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
        </div>
      </div>

      {/* ── Bottom controls ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 max-h-[15px] mt-2 mb-1">
        <PadBtn onPress={() => sendAction(Actions.FULLSCREEN)} size={42}>
          <Maximize size={15} />
        </PadBtn>

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
