import { useEffect, useState, useMemo, useRef } from "react";
import { appState } from "./core/stateMachine";
import { events } from "./core/events";
import { connect, subscribe, getSocket } from "./services/socket";
import { useLobbyRenderer } from "./hooks/useLobbyRenderer";
import { useGameLoop, emitChange } from "./hooks/useGameLoop";
import { useClock } from "./hooks/useClock";
import { BootScreen } from "./ui/components/BootScreen";
import { inputManager } from "./systems/input/inputManager";
import { playerManager } from "./systems/player/playerManager";
import { DashboardLayout } from "./ui/layouts/DashboardLayout";
import { AppRunningOverlay } from "./ui/components/AppRunningOverlay";
import { Notifications } from "./ui/components/Notifications";
import { ConfirmHost } from "./ui/components/ConfirmHost";
import { TooltipHost } from "./ui/components/TooltipHost";
import { SyncPanel } from "./ui/components/SyncPanel";
import { VirtualKeyboard } from "./ui/components/VirtualKeyboard";
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

  // Device→account assignments (#10). Held in a ref so both the input effect
  // (to birth a cube with the right color) and the socket effect (to recolor a
  // live cube) read the latest mapping without re-subscribing.
  const accountsRef = useRef<{
    accounts: { id: string; gamertag: string; colorHex: string }[];
    deviceMap: Record<string, string>;
  }>({ accounts: [], deviceMap: {} });

  const cosmeticFor = (
    deviceId: string,
  ): { color: string; name: string } | null => {
    const { accounts, deviceMap } = accountsRef.current;
    const acc = accounts.find((a) => a.id === deviceMap[deviceId]);
    return acc ? { color: acc.colorHex, name: acc.gamertag } : null;
  };

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
      // If this device is assigned to an account, the cube is born with that
      // account's gamertag + color; otherwise fall back to a generated name and
      // a random palette pick (a sequential index resets on effect re-run, which
      // made every player the same color).
      const cos = cosmeticFor(playerId);
      const name = cos?.name ?? displayName(playerId);
      const color =
        cos?.color ??
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

    let lastLobbyForward = 0;
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
        } else if (action.type === "slam" && action.playerId) {
          ensurePlayerExists(action.playerId);
          sceneRef.current?.slam(action.playerId);
        } else if (
          action.type === "spin" &&
          action.playerId &&
          action.value &&
          typeof action.value !== "boolean"
        ) {
          // Local gamepad spin stick → rotate that pad's cube (same path the
          // phone's right stick uses via the backend).
          const v = action.value as { x: number; y: number };
          ensurePlayerExists(action.playerId);
          sceneRef.current?.applySpin(action.playerId, v.x, v.y);
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

      // Mirror local lobby input to a synced peer console (if linked). Sparse
      // events (jump/slam) go immediately; continuous move/spin are throttled.
      const lobby = actions.filter(
        (a) =>
          a.playerId &&
          (a.type === "move" ||
            a.type === "jump" ||
            a.type === "slam" ||
            a.type === "spin"),
      );
      if (lobby.length) {
        const now = Date.now();
        const sparse = lobby.some((a) => a.type === "jump" || a.type === "slam");
        if (sparse || now - lastLobbyForward > 40) {
          lastLobbyForward = now;
          getSocket()?.emit("lobby_input", { actions: lobby });
        }
      }
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
          // #5: a non-gamepad app → auto-enable gamepad mouse mode so the right
          // stick drives the OS cursor (RB/LB click) inside the app.
          if (msg.isGame === false) {
            inputManager.setAppMouseAuto(true);
            notifService.push("Controller mouse on — right stick moves the cursor");
          }
          break;
        }
        case "app_closed": {
          appState.transition("HOME");
          inputManager.setAppMouseAuto(false);
          // Land focus cleanly on the dashboard (first app tile) instead of a
          // stale pre-launch target.
          resetToRoot();
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
        case "open_settings":
          // Phone "settings" button → open the dashboard's settings modal.
          window.dispatchEvent(new Event("open-settings"));
          break;
        case "shutting_down":
          notifService.push("Shutting down…");
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
          } else if (action.type === "slam" && action.playerId) {
            sceneRef.current?.slam(action.playerId);
          } else if (action.type === "home") {
            // Phone START (menu focus) → return the dashboard to its root.
            appState.transition("HOME");
            resetToRoot();
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
        case "spin": {
          // Right-stick rotation from a phone → spin that player's cube.
          if (msg.playerId)
            sceneRef.current?.applySpin(msg.playerId, msg.sx || 0, msg.sy || 0);
          break;
        }
        case "accounts_updated": {
          // Cache the device→account map, then recolor any live cube whose
          // device is assigned (covers re-assignment while a cube is on screen;
          // cubes created later are born correct via cosmeticFor()).
          accountsRef.current = {
            accounts: msg.accounts || [],
            deviceMap: msg.deviceMap || {},
          };
          for (const [deviceId, accId] of Object.entries(
            accountsRef.current.deviceMap,
          )) {
            const acc = accountsRef.current.accounts.find((a) => a.id === accId);
            if (acc)
              sceneRef.current?.setPlayerCosmetic(
                deviceId,
                acc.colorHex,
                acc.gamertag,
              );
          }
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

  // Display settings (settings.display) — these were never wired to anything.
  const [display, setDisplay] = useState({
    crtEffect: true,
    crtIntensity: 100,
    fullscreen: true,
  });
  const { mountRef, sceneRef } = useLobbyRenderer(
    allPlayers,
    display.crtEffect,
    display.crtIntensity,
  );

  // Click a lobby cube → open the Accounts panel focused on that device. We
  // listen on document and raycast against the cubes only for "background"
  // clicks (not on a UI control, app card, or overlay), so normal UI still works.
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (stateRef.current !== "HOME") return;
      const t = e.target as Element | null;
      if (
        !t ||
        t.closest(
          "button, a, input, select, textarea, [data-tip], [role='button'], [data-app-card], .rv-slider, .queue-card, .fixed",
        )
      )
        return;
      const pid = sceneRef.current?.pickPlayerId(e.clientX, e.clientY);
      if (pid)
        window.dispatchEvent(
          new CustomEvent("open-accounts", { detail: { playerId: pid } }),
        );
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [sceneRef]);

  // Load display settings + react to live changes (settings_updated).
  useEffect(() => {
    const apply = (s: any) => {
      const d = s?.display || {};
      setDisplay({
        crtEffect: d.crtEffect !== false,
        crtIntensity: typeof d.crtIntensity === "number" ? d.crtIntensity : 100,
        fullscreen: d.fullscreen !== false,
      });
      // Fullscreen: honor the toggle. requestFullscreen needs a user gesture,
      // so this reliably works when toggled from Settings (a click); on initial
      // load the browser may reject it (harmless — the kiosk is already FS).
      const want = d.fullscreen !== false;
      const isFs = !!document.fullscreenElement;
      if (want && !isFs) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (!want && isFs) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
    fetch("/api/settings").then((r) => r.json()).then(apply).catch(() => {});
    const unsub = subscribe((msg) => {
      if (msg.type === "settings_updated")
        fetch("/api/settings").then((r) => r.json()).then(apply).catch(() => {});
    });
    return unsub;
  }, []);

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
    // Gamepad mouse mode (#6) only on the dashboard.
    inputManager.setDashboardActive(state === "HOME");
  }, [state, sceneRef]);

  // Feedback when mouse mode toggles (Select on a gamepad).
  const [mouseOn, setMouseOn] = useState(false);
  useEffect(() => {
    const onMode = (e: Event) => {
      const on = !!(e as CustomEvent).detail?.on;
      setMouseOn(on);
      notifService.push(on ? "Mouse mode ON (RB/LB click)" : "Mouse mode off");
    };
    window.addEventListener("mousemode-changed", onMode);
    return () => window.removeEventListener("mousemode-changed", onMode);
  }, []);

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
        {/* Inside FocusProvider — ConfirmHost uses the focus layer for nav. */}
        <ConfirmHost />
        <SyncPanel />
        <VirtualKeyboard />
      </FocusProvider>
      {mouseOn && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-600/90 border border-indigo-300/30 shadow-lg pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-[11px] font-black uppercase tracking-widest text-white">
            Mouse mode · RB/LB click · Select to exit
          </span>
        </div>
      )}
      <Notifications />
      <TooltipHost />
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
