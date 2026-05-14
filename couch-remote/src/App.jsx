import { useState } from "react";
import { connect as connectSocket } from "./services/socket";
import LoginScreen from "./components/LoginScreen";
import Header from "./components/Header";
import RemoteTab from "./components/tabs/RemoteTab";
import TouchpadTab from "./components/tabs/TouchpadTab";
import MediaTab from "./components/tabs/MediaTab";
import RoomTab from "./components/tabs/RoomTab";
import { Gamepad2, MousePointer2, Play, Users } from "lucide-react";

const TABS = [
  { id: "REMOTE", Icon: Gamepad2, label: "Remote" },
  { id: "TOUCHPAD", Icon: MousePointer2, label: "Touchpad" },
  { id: "MEDIA", Icon: Play, label: "Media" },
  { id: "ROOM", Icon: Users, label: "Room" },
];

export default function App() {
  const [screen, setScreen] = useState("LOGIN");
  const [tab, setTab] = useState("REMOTE");
  const [user, setUser] = useState(null);

  const join = (name, color) => {
    setUser({ name, color });
    // connect socket transport for this user
    try {
      connectSocket(null, { name, color });
    } catch (e) {
      console.warn("socket connect failed", e);
    }
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
      case "ROOM":
        return <RoomTab />;
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
      <Header user={user} />

      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-600">
          {tab === "REMOTE" && "Remote Control"}
          {tab === "TOUCHPAD" && "Touchpad"}
          {tab === "MEDIA" && "Media"}
          {tab === "ROOM" && "Lobby"}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-3 min-h-0">
        {tabContent()}
      </div>

      <div
        className="flex-shrink-0"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "#050509",
          paddingBottom: "env(safe-area-inset-bottom, 12px)",
        }}
      >
        <div className="flex">
          {TABS.map(({ id, Icon, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex-1 flex flex-col items-center gap-1 py-3.5 transition-all active:scale-90 relative"
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
        </div>
      </div>
    </div>
  );
}
