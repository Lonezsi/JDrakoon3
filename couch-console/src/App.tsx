import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { appState } from "./core/stateMachine";
import { events } from "./core/events";
import { launchApp } from "./services/launcherService";
import { connect, getSocket, subscribe } from "./services/socket";
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
import { notifService } from "./services/notificationService";

// ---------------------------------------------------------------
// Global debounce hook – one single cooldown for all navigation
// ---------------------------------------------------------------
function useDebouncedNavigation(
  activeIndex: number,
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>,
  libraryLength: number,
) {
  const lastActionTime = useRef(0);
  const activeIndexRef = useRef(activeIndex);

  // keep the ref in sync
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const navigateLeft = useCallback(() => {
    if (appState.current !== "HOME") return;
    const now = Date.now();
    if (now - lastActionTime.current < 300) return;
    lastActionTime.current = now;
    setActiveIndex((prev) => Math.max(prev - 1, 0));
  }, [setActiveIndex]);

  const navigateRight = useCallback(() => {
    if (appState.current !== "HOME") return;
    const now = Date.now();
    if (now - lastActionTime.current < 300) return;
    lastActionTime.current = now;
    setActiveIndex((prev) => Math.min(prev + 1, libraryLength - 1));
  }, [setActiveIndex, libraryLength]);

  const confirm = useCallback(() => {
    if (appState.current !== "HOME") return;
    const now = Date.now();
    if (now - lastActionTime.current < 300) return;
    lastActionTime.current = now;
    const idx = activeIndexRef.current;
    if (idx >= 0 && idx < library.length) {
      launchApp(library[idx]);
    }
  }, []);

  return { navigateLeft, navigateRight, confirm };
}

// ---------------------------------------------------------------
export default function App() {
  const [state, setState] = useState<AppState>("BOOT");
  const [activeIndex, setActiveIndex] = useState(0);
  const [remotePlayers, setRemotePlayers] = useState<Player[]>([]);

  const remotePlayerIds = useMemo(
    () => new Set(remotePlayers.map((p) => p.id)),
    [remotePlayers],
  );

  const gameState = useGameLoop();
  const clock = useClock();
  const allPlayers = useMemo(() => gameState.players, [gameState.players]);
  const { mountRef, sceneRef } = useLobbyRenderer(allPlayers);

  const { navigateLeft, navigateRight, confirm } = useDebouncedNavigation(
    activeIndex,
    setActiveIndex,
    library.length,
  );

  const [keyboardPlayers, setKeyboardPlayers] = useState<
    Record<string, string | null>
  >({
    wasd: null, // playerId once joined
    uhjk: null,
  });

  const gamepadPlayersRef = useRef<Record<number, string | null>>({});
  const socket = getSocket();

  // Boot → HOME
  useEffect(() => {
    if (state !== "BOOT") return;
    const t = setTimeout(() => {
      appState.transition("HOME");
      setState("HOME");
    }, 2600);
    return () => clearTimeout(t);
  }, [state]);

  // State machine listener
  useEffect(() => {
    const unsub = events.on("state:change", (newState: AppState) =>
      setState(newState),
    );
    return unsub;
  }, []);

  // scene.onUpdate → playerManager
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.onUpdate = (players) => {
      playerManager.players = players;
      emitChange();
    };
    return () => {
      if (sceneRef.current) sceneRef.current.onUpdate = undefined;
    };
  }, [sceneRef]);

  // ---------------------------------------------------------------
  // LOCAL INPUT: movement + debounced navigation
  // ---------------------------------------------------------------
  useEffect(() => {
    const nameCounters = new Map<string, number>();
    const colorPalette = [
      "#6366f1",
      "#ec4899",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#3b82f6",
      "#8b5cf6",
      "#f97316",
    ];
    let colorIndex = 0;

    function ensurePlayerExists(playerId: string) {
      if (playerManager.players.find((p) => p.id === playerId)) return;
      let baseName = "Player";
      if (playerId.startsWith("p")) baseName = "P";
      else if (playerId.startsWith("gp")) baseName = "GP";
      const count = (nameCounters.get(baseName) ?? 0) + 1;
      nameCounters.set(baseName, count);
      const name = `${baseName}${count}`;
      const color = colorPalette[colorIndex % colorPalette.length];
      colorIndex++;
      const newPlayer: Player = {
        id: playerId,
        name,
        color,
        pos: { x: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 5 },
        vel: { x: 0, z: 0 },
        deviceType: "keyboard",
      };
      playerManager.addPlayer(newPlayer);
      emitChange();
    }

    const unsub = inputManager.onActions((actions) => {
      // --- movement processing ---
      const movedIds = new Set<string>();
      for (const action of actions) {
        if (
          action.type === "move" &&
          action.playerId &&
          action.value &&
          typeof action.value !== "boolean"
        ) {
          ensurePlayerExists(action.playerId);
          const moveValue = action.value as { x: number; y: number };
          movedIds.add(action.playerId);
          const speed = 8;
          sceneRef.current?.setPlayerInput(
            action.playerId,
            moveValue.x * speed,
            moveValue.y * speed,
          );
        }
        // --- debounced navigation ---
        else if (action.type === "navigate") {
          const dir = (action.value as { direction: string } | undefined)
            ?.direction;
          if (dir === "left") navigateLeft();
          else if (dir === "right") navigateRight();
        } else if (action.type === "confirm") {
          confirm();
        }
      }

      // stop any local player that didn't send a move this frame
      playerManager.players.forEach((p) => {
        if (!movedIds.has(p.id) && !remotePlayerIds.has(p.id)) {
          sceneRef.current?.setPlayerInput(p.id, 0, 0);
        }
      });
    });

    const stopInput = inputManager.start();

    return () => {
      unsub();
      stopInput();
    };
  }, [sceneRef, remotePlayerIds, navigateLeft, navigateRight, confirm]);

  // ---------------------------------------------------------------
  // SOCKET & REMOTE HANDLING
  // ---------------------------------------------------------------
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
        case "navigate": {
          if (msg.direction === "left") navigateLeft();
          else if (msg.direction === "right") navigateRight();
          break;
        }
        case "confirm":
          confirm();
          break;
        case "home":
          appState.transition("HOME");
          setActiveIndex(0);
          break;
        case "action": {
          // treat "action" messages the same way as direct navigate/confirm
          const action = msg;
          if (action.type === "navigate" && action.value?.direction) {
            if (action.value.direction === "left") navigateLeft();
            else if (action.value.direction === "right") navigateRight();
          } else if (action.type === "confirm") {
            confirm();
          }
          break;
        }
        case "move": {
          // inject remote thumbstick into the local input pipeline
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
        case "error": {
          notifService.push(`Backend error: ${msg.message}`);
          break;
        }
        default:
          break;
      }
    });

    return () => {
      unsub();
      socket?.disconnect();
    };
  }, [state, navigateLeft, navigateRight, confirm]);

  // ---------------------------------------------------------------
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
      
        @keyframes card-in {
          from { opacity: 0; transform: scale(0.96) translateY(4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        } 
        .queue-card { animation: card-in 0.22s ease forwards; }
      `}</style>
    </div>
  );
}
