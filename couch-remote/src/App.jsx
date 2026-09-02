import { useState } from "react";
import { connect as connectSocket } from "./services/socket";

import LoginScreen from "./components/LoginScreen";
import Header from "./components/Header";
import RemoteTab from "./components/tabs/RemoteTab";
import TouchpadTab from "./components/tabs/TouchpadTab";
import MediaTab from "./components/tabs/MediaTab";
import { Gamepad2, MousePointer2, Play, Maximize2, Minimize2 } from "lucide-react";

const TABS = [
  { id: "REMOTE", Icon: Gamepad2, label: "Remote" },
  { id: "TOUCHPAD", Icon: MousePointer2, label: "Touchpad" },
  { id: "MEDIA", Icon: Play, label: "Media" },
];

export default function App() {
  const [screen, setScreen] = useState("LOGIN");
  const [tab, setTab] = useState("REMOTE");
  const [user, setUser] = useState(null);
  // Our backend-assigned player id (= device id for account assignment).
  const [playerId, setPlayerId] = useState(null);
  // Immersive mode: hide the header (and go browser-fullscreen where the
  // API exists — iPhone Safari doesn't support it, so hiding the header is
  // the part that always works).
  const [immersive, setImmersive] = useState(false);

  const toggleImmersive = () => {
    setImmersive((v) => {
      const next = !v;
      try {
        if (next) document.documentElement.requestFullscreen?.();
        else if (document.fullscreenElement) document.exitFullscreen?.();
      } catch {
        /* unsupported (iOS) — header toggle still applies */
      }
      return next;
    });
  };

  const join = (name, color) => {
    setUser({ name, color });
    const conn = connectSocket(null, { name, color });
    // Capture our player id from the join ack so the account picker can assign
    // this device.
    conn.subscribe((msg) => {
      if (msg.type === "joined" && msg.playerId) setPlayerId(msg.playerId);
    });
    setScreen("MAIN");
  };

  if (screen === "LOGIN") return <LoginScreen onJoin={join} />;

  const tabContent = () => {
    switch (tab) {
      case "REMOTE":
        return <RemoteTab />;
      case "TOUCHPAD":
        return <TouchpadTab />;
      case "MEDIA":
        return <MediaTab />;
      default:
        return null;
    }
  };

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        height: "100dvh",
        background: "#06060c",
        fontFamily: "'Segoe UI',system-ui,sans-serif",
        margin: "0 auto",
      }}
    >
      {!immersive && <Header user={user} playerId={playerId} />}

      <div className="flex-1 overflow-y-auto min-h-0">{tabContent()}</div>

      <div
        className="flex-shrink-0"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "#050509",
          paddingBottom: "env(safe-area-inset-bottom, 12px)",
        }}
      >
        <div className="flex max-h-12">
          {TABS.map(({ id, Icon, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex-1 flex flex-col items-center gap-1 py-1 transition-all active:scale-90 relative"
                style={{
                  color: active ? user?.color?.hex || "#6366f1" : "#475569",
                }}
              >
                {active && (
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full"
                    style={{ background: user?.color?.hex || "#6366f1" }}
                  />
                )}
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span className="text-[10px] font-black uppercase tracking-wide">
                  {label}
                </span>
              </button>
            );
          })}
          <button
            onClick={toggleImmersive}
            className="w-14 flex flex-col items-center justify-center gap-1 py-1 transition-all active:scale-90 text-slate-500"
          >
            {immersive ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            <span className="text-[9px] font-black uppercase tracking-wide">
              {immersive ? "Exit" : "Full"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
