import { useEffect, useState, useMemo } from "react";
import { appState } from "./core/stateMachine";
import { events } from "./core/events";
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
import type { AppState, Player } from "./shared/types";
import { notifService } from "./services/notificationService";
import { FocusProvider, useFocus } from "./navigation/FocusContext";

// ---------------------------------------------------------------
// Wires input system and socket messages to the focus manager.
// Selection behaviour lives on each focusable's onSelect, so this
// only needs to translate raw input into move/select/back.
// Must render inside FocusProvider.
// ---------------------------------------------------------------
function AppController({
  state,
  sceneRef,
  remotePlayerIds,
  setRemotePlayers,
  setAppPhase,
}: {
  state: AppState;
  sceneRef: React.MutableRefObject<any>;
  remotePlayerIds: Set<string>;
  setRemotePlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  setAppPhase: React.Dispatch<
    React.SetStateAction<{ phase: "launching" | "running"; name?: string }>
  >;
}) {
  const { move, select, goBack, resetToRoot } = useFocus();

  // ── Local input ────────────────────────────────────────────────
  useEffect(() => {
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
    // Derive the name from the device id — a counter resets whenever this
    // effect re-runs, which made both keyboards "Keyboard 1".
    function displayName(playerId: string) {
      if (playerId === "AWSD") return "Keyboard 1";
      if (playerId === "UHJK") return "Keyboard 2";
      if (playerId.startsWith("gp"))
        return `Controller ${(parseInt(playerId.slice(2), 10) || 0) + 1}`;
      return playerId;
    }
    function ensurePlayerExists(playerId: string) {
      if (playerManager.players.find((p) => p.id === playerId)) return;
      const name = displayName(playerId);
      // Random palette pick — a sequential index resets whenever this effect
      // re-runs, which made every player the same color.
      const color =
        colorPalette[Math.floor(Math.random() * colorPalette.length)];
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
      const movedIds = new Set<string>();
      for (const action of actions) {
        if (
          action.type === "move" &&
          action.playerId &&
          action.value &&
          typeof action.value !== "boolean"
        ) {
          const moveValue = action.value as { x: number; y: number };
          const moving = moveValue.x !== 0 || moveValue.y !== 0;
          // A cube only joins the lobby once its owner actually presses a
          // movement key — not on boot.
          if (moving) ensurePlayerExists(action.playerId);
          const exists = playerManager.players.some(
            (p) => p.id === action.playerId,
          );
          if (exists) {
            movedIds.add(action.playerId);
            const speed = 8;
            sceneRef.current?.setPlayerInput(
              action.playerId,
              moveValue.x * speed,
              moveValue.y * speed,
            );
          }
        } else if (action.type === "jump" && action.playerId) {
          ensurePlayerExists(action.playerId);
          sceneRef.current?.jump(action.playerId);
        } else if (action.type === "navigate") {
          const dir = (action.value as { direction: string } | undefined)
            ?.direction;
          if (dir === "left") move("left");
          else if (dir === "right") move("right");
          else if (dir === "up") move("up");
          else if (dir === "down") move("down");
        } else if (action.type === "confirm") {
          select();
        } else if (action.type === "back") {
          goBack();
        }
      }

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
  }, [move, select, goBack, sceneRef, remotePlayerIds]);

  // ── Socket ─────────────────────────────────────────────────────
  useEffect(() => {
    if (state === "BOOT") return;

    const socket = connect({
      name: "Console",
      color: "#000000",
      deviceType: "console",
    });

    const unsub = subscribe((msg) => {
      switch (msg.type) {
        case "app_launching": {
          // covers launches triggered by other clients (e.g. phone)
          setAppPhase({ phase: "launching", name: msg.appId });
          appState.transition("APP_RUNNING");
          break;
        }
        case "app_launched": {
          // Stay in the React app — no page swap. The 3D renderer is paused
          // while APP_RUNNING, which gives the same perf win as the old
          // /app-running page without the reload jank.
          setAppPhase((prev) => ({ phase: "running", name: prev.name }));
          if (appState.current !== "APP_RUNNING") {
            appState.transition("APP_RUNNING");
          }
          break;
        }
        case "app_closed": {
          appState.transition("HOME");
          break;
        }
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
          if (msg.direction === "left") move("left");
          else if (msg.direction === "right") move("right");
          else if (msg.direction === "up") move("up");
          else if (msg.direction === "down") move("down");
          break;
        }
        case "confirm":
          select();
          break;
        case "back":
          goBack();
          break;
        case "home":
          appState.transition("HOME");
          resetToRoot();
          break;
        case "action": {
          const action = msg;
          if (action.type === "navigate" && action.value?.direction) {
            if (action.value.direction === "left") move("left");
            else if (action.value.direction === "right") move("right");
            else if (action.value.direction === "up") move("up");
            else if (action.value.direction === "down") move("down");
          } else if (action.type === "confirm") {
            select();
          } else if (action.type === "back") {
            goBack();
          } else if (action.type === "jump" && action.playerId) {
            sceneRef.current?.jump(action.playerId);
          }
          break;
        }
        case "move": {
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
    };
  }, [state, move, select, goBack, resetToRoot, setRemotePlayers, setAppPhase]);

  return null;
}

// ---------------------------------------------------------------
export default function App() {
  const [state, setState] = useState<AppState>("BOOT");
  const [remotePlayers, setRemotePlayers] = useState<Player[]>([]);
  const [appPhase, setAppPhase] = useState<{
    phase: "launching" | "running";
    name?: string;
  }>({ phase: "launching" });

  const remotePlayerIds = useMemo(
    () => new Set(remotePlayers.map((p) => p.id)),
    [remotePlayers],
  );

  const gameState = useGameLoop();
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
    sceneRef.current.onUpdate = (players: Player[]) => {
      playerManager.players = players;
      emitChange();
    };
    return () => {
      if (sceneRef.current) sceneRef.current.onUpdate = undefined;
    };
  }, [sceneRef]);

  // While an app is running, freeze the 3D scene (physics + GPU) so the
  // machine's resources go to the launched app — same win as the old
  // lightweight page, without the page-reload jank.
  useEffect(() => {
    sceneRef.current?.setPaused(state === "APP_RUNNING");
  }, [state, sceneRef]);

  if (state === "BOOT") return <BootScreen />;

  return (
    <div
      className="h-screen w-screen bg-[#04040a] text-slate-100 overflow-hidden select-none"
      style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
    >
      <div ref={mountRef} className="fixed inset-0 z-0 pointer-events-none" />
      <FocusProvider>
        <AppController
          state={state}
          sceneRef={sceneRef}
          remotePlayerIds={remotePlayerIds}
          setRemotePlayers={setRemotePlayers}
          setAppPhase={setAppPhase}
        />
        <div
          className={`h-full transition-all duration-700 ${
            state === "APP_RUNNING"
              ? "opacity-0 scale-95 blur-2xl pointer-events-none"
              : ""
          }`}
        >
          <DashboardLayout clock={clock} players={allPlayers} />
        </div>
        {state === "APP_RUNNING" && (
          <AppRunningOverlay phase={appPhase.phase} appName={appPhase.name} />
        )}
      </FocusProvider>
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
