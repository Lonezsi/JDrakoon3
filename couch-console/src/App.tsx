import { useEffect, useState, useMemo, useRef } from "react";
import { appState } from "./core/stateMachine";
import { events } from "./core/events";
import { launchApp } from "./services/launcherService";
import { connect, subscribe } from "./services/socket";
import { useLobbyRenderer } from "./hooks/useLobbyRenderer";
import { useGameLoop, emitChange } from "./hooks/useGameLoop";
import { useClock } from "./hooks/useClock";
import { BootScreen } from "./ui/components/BootScreen";
import { inputManager } from "./systems/input/inputManager";
import { playerManager } from "./systems/player/playerManager";
import { DashboardLayout } from "./ui/layouts/DashboardLayout";
import { AppRunningOverlay } from "./ui/components/AppRunningOverlay";
import { Notifications } from "./ui/components/Notifications";
import { PhoneQR } from "./ui/components/PhoneQR";
import { MOCK_APPS as library } from "./shared/constants";
import type { AppState, Player } from "./shared/types";

export default function App() {
  const [state, setState] = useState<AppState>("BOOT");
  const [activeIndex, setActiveIndex] = useState(0);
  const [remotePlayers, setRemotePlayers] = useState<Player[]>([]);
  const remotePlayerIds = useMemo(
    () => new Set(remotePlayers.map((p) => p.id)),
    [remotePlayers],
  );
  const navigateDebounceRef = useRef<number>(null);

  const gameState = useGameLoop(); // UI state only
  const clock = useClock();

  const allPlayers = useMemo(() => gameState.players, [gameState.players]);

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

  // Add default local players to playerManager (so they appear in UI)
  useEffect(() => {
    const p1: Player = {
      id: "p1",
      name: "P1",
      color: "#6366f1",
      pos: { x: -2, z: 0 },
      vel: { x: 0, z: 0 },
      deviceType: "keyboard",
    };
    const p2: Player = {
      id: "p2",
      name: "P2",
      color: "#ec4899",
      pos: { x: 2, z: 0 },
      vel: { x: 0, z: 0 },
      deviceType: "keyboard",
    };
    playerManager.addPlayer(p1);
    playerManager.addPlayer(p2);
    emitChange();
  }, []);

  // Wire scene.onUpdate → playerManager → React
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.onUpdate = (players) => {
      playerManager.players = players;
      emitChange(); // triggers UI refresh
    };
    return () => {
      if (sceneRef.current) sceneRef.current.onUpdate = undefined;
    };
  }, [sceneRef]);

  // All movement (keyboard + remote) goes directly to the scene
  useEffect(() => {
    const unsub = inputManager.onActions((actions) => {
      // Handle navigation/confirm (unchanged)
      if (appState.current === "HOME") {
        actions.forEach((a) => {
          if (a.type === "navigate") {
            const val = a.value as { direction: string };
            if (val.direction === "right")
              setActiveIndex((i) => Math.min(i + 1, library.length - 1));
            else if (val.direction === "left")
              setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (a.type === "confirm") {
            launchApp(library[activeIndex]);
          }
        });
      }

      // Process move actions
      const movedIds = new Set<string>();
      for (const action of actions) {
        if (
          action.type === "move" &&
          action.playerId &&
          action.value &&
          typeof action.value !== "boolean"
        ) {
          const moveValue = action.value as { x: number; y: number };
          movedIds.add(action.playerId);
          const speed = 8;
          sceneRef.current?.setPlayerInput(
            action.playerId,
            moveValue.x * speed,
            moveValue.y * speed,
          );
        }
      }

      // Stop any player that didn't get a move action this frame
      playerManager.players.forEach((p) => {
        if (!movedIds.has(p.id) && !remotePlayerIds.has(p.id)) {
          sceneRef.current?.setPlayerInput(p.id, 0, 0);
        }
      });
    });
    return unsub;
  }, [sceneRef, remotePlayerIds, activeIndex]);

  // Socket & remote handling
  useEffect(() => {
    if (state === "BOOT") return;

    const socket = connect({
      name: "Console",
      color: "#000000",
      deviceType: "console",
    });

    const unsub = subscribe((msg) => {
      switch (msg.type) {
        case "lobby_state": {
          const serverPlayers = (msg.players || []).filter(
            (p: Player) => p.deviceType !== "console",
          );
          setRemotePlayers(serverPlayers);
          serverPlayers.forEach((p: Player) => playerManager.addPlayer(p));
          emitChange();
          break;
        }
        case "player_joined": {
          if (msg.deviceType !== "console") {
            setRemotePlayers((prev) => prev.concat(msg));
            playerManager.addPlayer(msg as Player);
            emitChange();
          }
          break;
        }
        case "player_left": {
          setRemotePlayers((prev) => prev.filter((p) => p.id !== msg.playerId));
          playerManager.removePlayer(msg.playerId);
          emitChange();
          break;
        }
        case "navigate":
          if (appState.current === "HOME" && msg.direction) {
            if (msg.direction === "right")
              setActiveIndex((i) => Math.min(i + 1, library.length - 1));
            else if (msg.direction === "left")
              setActiveIndex((i) => Math.max(i - 1, 0));
          }
          break;
        case "confirm":
          if (appState.current === "HOME") launchApp(library[activeIndex]);
          break;
        case "home":
          appState.transition("HOME");
          setActiveIndex(0);
          break;
        case "action": {
          if (appState.current !== "HOME") break;
          const action = msg;
          if (action.type === "navigate" && action.value?.direction) {
            const now = Date.now();
            if (now - (navigateDebounceRef.current ?? 0) < 300) break;
            navigateDebounceRef.current = now;
            if (action.value.direction === "right")
              setActiveIndex((i) => Math.min(i + 1, library.length - 1));
            else if (action.value.direction === "left")
              setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (action.type === "confirm") {
            launchApp(library[activeIndex]);
          }
          break;
        }
        case "move": {
          // Remote thumbstick input
          const moveMsg = msg as {
            playerId: string;
            dx: number;
            dy: number;
            seq: number;
          };
          inputManager.injectActions([
            {
              type: "move",
              playerId: moveMsg.playerId,
              deviceId: "remote",
              deviceType: "keyboard",
              value: { x: moveMsg.dx, y: moveMsg.dy },
            },
          ]);
          break;
        }
        default:
          break;
      }
    });

    const stopInput = inputManager.start();
    const unsubInput = inputManager.onActions((actions) => {
      if (appState.current !== "HOME") return;
      actions.forEach((a) => {
        if (a.type === "navigate") {
          const val = a.value as { direction: string };
          if (val.direction === "right")
            setActiveIndex((i) => Math.min(i + 1, library.length - 1));
          else if (val.direction === "left")
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (a.type === "confirm") {
          launchApp(library[activeIndex]);
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

  // State machine listener
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
