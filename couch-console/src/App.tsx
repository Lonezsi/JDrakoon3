import { useEffect, useState, useMemo } from "react";
import { appState } from "./core/stateMachine";
import { events } from "./core/events";
import { launchApp } from "./services/launcherService";
import { connect, subscribe, sendAction } from "./services/socket";
import { useLobbyRenderer } from "./hooks/useLobbyRenderer";
import { useGameLoop } from "./hooks/useGameLoop";
import { useClock } from "./hooks/useClock";
import { BootScreen } from "./ui/components/BootScreen";
import { inputManager } from "./systems/input/inputManager";
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

    // Connect as console observer (no cube)
    const socket = connect({
      name: "Console",
      color: "#000000",
      deviceType: "console",
    });

    // ── Remote (phone) actions ────────────────────────────
    const unsub = subscribe((msg) => {
      switch (msg.type) {
        case "lobby_state":
          setRemotePlayers(
            (msg.players || []).filter(
              (p: Player) => p.deviceType !== "console",
            ),
          );
          break;
        case "player_joined":
          if (msg.deviceType !== "console") {
            setRemotePlayers((prev) => {
              if (prev.find((p) => p.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
          break;
        case "player_left":
          setRemotePlayers((prev) => prev.filter((p) => p.id !== msg.playerId));
          break;

        // Phone remote navigation
        case "navigate":
          if (appState.current === "HOME" && msg.direction) {
            if (msg.direction === "right") {
              setActiveIndex((i) => Math.min(i + 1, MOCK_APPS.length - 1));
            } else if (msg.direction === "left") {
              setActiveIndex((i) => Math.max(i - 1, 0));
            }
          }
          break;
        case "confirm":
          if (appState.current === "HOME") {
            launchApp(MOCK_APPS[activeIndex]);
          }
          break;
        case "home":
          appState.transition("HOME");
          setActiveIndex(0);
          break;

        default:
          break;
      }
    });

    // ── Local keyboard / gamepad navigation ────────────────
    const stopInput = inputManager.start();
    const unsubInput = inputManager.onActions((actions) => {
      // Only process navigation while on HOME screen
      if (appState.current !== "HOME") return;
      actions.forEach((a) => {
        if (a.type === "navigate") {
          const val = a.value as { direction: string };
          if (val.direction === "right") {
            setActiveIndex((i) => Math.min(i + 1, MOCK_APPS.length - 1));
          } else if (val.direction === "left") {
            setActiveIndex((i) => Math.max(i - 1, 0));
          }
        } else if (a.type === "confirm") {
          launchApp(MOCK_APPS[activeIndex]);
        }
      });
    });

    return () => {
      unsub();
      socket?.disconnect();
      unsubInput();
      stopInput();
    };
  }, [state]);

  // Sync with state machine for transitions
  useEffect(() => {
    const unsub = events.on("state:change", (newState: AppState) =>
      setState(newState),
    );
    return unsub;
  }, []);

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
