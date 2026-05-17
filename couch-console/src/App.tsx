import { useEffect, useState, useMemo } from "react";
import { appState } from "./core/stateMachine";
import { events } from "./core/events";
import { launchApp } from "./services/launcherService";
import { inputManager } from "./systems/input/inputManager";
import { connect, subscribe, sendAction } from "./services/socket";
import { useLobbyRenderer } from "./hooks/useLobbyRenderer";
import { useGameLoop } from "./hooks/useGameLoop";
import { useClock } from "./hooks/useClock";
import { BootScreen } from "./ui/components/BootScreen";
import { DashboardLayout } from "./ui/layouts/DashboardLayout";
import { AppRunningOverlay } from "./ui/components/AppRunningOverlay";
import { Notifications } from "./ui/components/Notifications";
import { PhoneQR } from "./ui/components/PhoneQR";
import { MOCK_APPS } from "./shared/constants";
import type { AppState, Player } from "./shared/types";

export default function App() {
  const [state, setState] = useState<AppState>("BOOT");
  const [activeIndex, setActiveIndex] = useState(0);
  const [remotePlayers, setRemotePlayers] = useState<Player[]>([]);

  const gameState = useGameLoop();
  const clock = useClock();

  // Merge remote + local (keyboard) players, avoid duplicates by ID
  const allPlayers = useMemo(() => {
    const remoteIds = new Set(remotePlayers.map((p) => p.id));
    const local = gameState.players.filter((p) => !remoteIds.has(p.id));
    return [...remotePlayers, ...local];
  }, [remotePlayers, gameState.players]);

  const { mountRef, sceneRef } = useLobbyRenderer(allPlayers);

  // Boot → HOME
  useEffect(() => {
    if (state !== "BOOT") return;
    const t = setTimeout(() => {
      appState.transition("HOME");
      setState("HOME");
    }, 2600);
    return () => clearTimeout(t);
  }, [state]);

  // Connect to backend and handle lobby events
  useEffect(() => {
    if (state === "BOOT") return;
    const socket = connect({ name: "TV Console", color: "#10b981" });

    const unsub = subscribe((msg) => {
      switch (msg.type) {
        case "lobby_state":
          setRemotePlayers(msg.players || []);
          break;
        case "player_joined":
          setRemotePlayers((prev) => {
            if (prev.find((p) => p.id === msg.id)) return prev;
            return [...prev, msg];
          });
          break;
        case "player_left":
          setRemotePlayers((prev) => prev.filter((p) => p.id !== msg.playerId));
          break;
        default:
          break;
      }
    });

    return () => {
      unsub();
      socket?.disconnect();
    };
  }, [state]);

  // Start input manager and forward actions to backend
  useEffect(() => {
    if (state === "BOOT") return;
    const stop = inputManager.start();
    const unsubActions = inputManager.onActions((actions) => {
      actions.forEach((a) => {
        if (
          a.type === "move" ||
          a.type === "emote" ||
          a.type === "jump" ||
          a.type === "navigate" ||
          a.type === "confirm"
        ) {
          sendAction({ type: "action", payload: a });
        } else {
          // Fallback: send as raw input
          const msg: any = { type: "input" };
          if ((a as any).value && typeof (a as any).value === "object")
            msg.analog = (a as any).value;
          if ((a as any).buttons) msg.buttons = (a as any).buttons;
          sendAction({ type: "input:event", payload: msg });
        }
      });
    });

    return () => {
      unsubActions();
      stop();
    };
  }, [state]);

  // Sync with state machine for transitions
  useEffect(() => {
    const unsub = events.on("state:change", (newState: AppState) =>
      setState(newState),
    );
    return unsub;
  }, []);

  // Navigation (still uses MOCK_APPS for now)
  useEffect(() => {
    const unsub = inputManager.onActions((actions) => {
      if (appState.current !== "HOME") return;
      actions.forEach((a) => {
        if (
          a.type === "navigate" &&
          typeof a.value === "object" &&
          "direction" in a.value
        ) {
          if (a.value.direction === "right")
            setActiveIndex((i) => Math.min(i + 1, MOCK_APPS.length - 1));
          if (a.value.direction === "left")
            setActiveIndex((i) => Math.max(i - 1, 0));
        }
        if (a.type === "confirm") launchApp(MOCK_APPS[activeIndex]);
      });
    });
    return unsub;
  }, [activeIndex]);

  if (state === "BOOT") return <BootScreen />;

  return (
    <div
      className="h-screen w-screen bg-[#04040a] text-slate-100 overflow-hidden select-none"
      style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
    >
      <div ref={mountRef} className="fixed inset-0 z-0 pointer-events-none" />

      <div
        className={`h-full transition-all duration-700 ${
          state === "APP_RUNNING"
            ? "opacity-0 scale-95 blur-2xl pointer-events-none"
            : ""
        }`}
      >
        <DashboardLayout
          clock={clock}
          players={allPlayers}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
        />
      </div>

      {state === "APP_RUNNING" && <AppRunningOverlay />}
      <Notifications />
      <PhoneQR />
      <style>{`
        @keyframes notif-in {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .notif { animation: notif-in 0.38s cubic-bezier(.19,1,.22,1) forwards; }
      `}</style>
    </div>
  );
}
