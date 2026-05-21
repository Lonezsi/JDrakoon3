import { useState } from "react";
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

// ── Mock services — replace with your real imports ─────────────────────
const Actions = {
  CONFIRM: "CONFIRM",
  BACK: "BACK",
  FULLSCREEN: "FULLSCREEN",
  MEDIA_VOLUME: "MEDIA_VOLUME",
  KEY_PRESS: "KEY_PRESS",
};
const sendAction = (a, p) => console.log("action:", a, p);
const navUp = () => sendAction("NAV_UP");
const navDown = () => sendAction("NAV_DOWN");
const navLeft = () => sendAction("NAV_LEFT");
const navRight = () => sendAction("NAV_RIGHT");
const confirm = () => sendAction("CONFIRM");
const back = () => sendAction("BACK");
const home = () => sendAction("HOME");
const start = () => sendAction("START");
const menu = () => sendAction("MENU");
const power = () => sendAction("POWER");
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
          {/* D-pad center dot */}
          <div className="w-12 h-12 rounded-full bg-[#6366f110] border border-[#6366f125] flex items-center justify-center">
            <div className="w-[13px] h-[13px] rounded-full bg-[#6366f1] shadow-[0_0_10px_#6366f17a]" />
          </div>
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
            onPress={() => sendAction(Actions.CONFIRM)}
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
            onPress={() => sendAction(Actions.BACK)}
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
