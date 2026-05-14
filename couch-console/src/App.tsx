import { useEffect, useState } from "react";
import { appState } from "./core/stateMachine";
import { events } from "./core/events";
import { launchApp } from "./services/launcherService";
import { inputManager } from "./systems/input/inputManager";
import { connect as connectSocket } from "./services/socket";
import { useLobbyRenderer } from "./hooks/useLobbyRenderer";
import { useGameLoop } from "./hooks/useGameLoop";
import { useClock } from "./hooks/useClock";
import { BootScreen } from "./ui/components/BootScreen";
import { DashboardLayout } from "./ui/layouts/DashboardLayout";
import { AppRunningOverlay } from "./ui/components/AppRunningOverlay";
import { Notifications } from "./ui/components/Notifications";
import { PhoneQR } from "./ui/components/PhoneQR";
import { MOCK_APPS } from "./shared/constants";
import type { AppState } from "./shared/types";

export default function App() {
  const [state, setState] = useState<AppState>("BOOT");
  const [activeIndex, setActiveIndex] = useState(0);
  const { mountRef, sceneRef } = useLobbyRenderer();
  const gameState = useGameLoop(sceneRef);
  const clock = useClock();

  // Boot → HOME after 2.6s
  useEffect(() => {
    if (state !== "BOOT") return;
    const t = setTimeout(() => {
      appState.transition("HOME");
      setState("HOME");
    }, 2600);
    return () => clearTimeout(t);
  }, [state]);

  // Sync with state machine (for later transitions)
  useEffect(() => {
    const unsub = events.on("state:change", (newState: AppState) =>
      setState(newState),
    );
    return unsub;
  }, []);

  // Start input manager after boot
  useEffect(() => {
    if (state === "BOOT") return;
    const stop = inputManager.start();
    // wire input manager actions to backend transport
    try {
      const conn = connectSocket();
      const unsubActions = inputManager.onActions((actions) => {
        actions.forEach((a) => {
          // Map local DeviceAction to backend message shapes
          if (
            a.type === "move" ||
            a.type === "emote" ||
            a.type === "jump" ||
            a.type === "navigate" ||
            a.type === "confirm"
          ) {
            conn.sendAction({ type: "action", action: a });
          } else {
            // Fallback: send as input containing analog/buttons if present
            const msg: any = { type: "input" };
            if ((a as any).value && typeof (a as any).value === "object")
              msg.analog = (a as any).value;
            if ((a as any).buttons) msg.buttons = (a as any).buttons;
            conn.sendAction(msg);
          }
        });
      });
      // subscribe to server messages if needed
      const unsubMsg = conn.subscribe((msg) => {
        // minimal handling: log for now; later map to state machine
        if (msg?.type) console.debug("server msg", msg.type, msg);
      });
      return () => {
        unsubActions();
        unsubMsg();
        stop();
      };
    } catch (e) {
      console.warn("socket connect failed", e);
    }
  }, [state]);

  // Navigation
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
        className={`h-full transition-all duration-700 ${state === "APP_RUNNING" ? "opacity-0 scale-95 blur-2xl pointer-events-none" : ""}`}
      >
        <DashboardLayout
          clock={clock}
          players={gameState.players}
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
