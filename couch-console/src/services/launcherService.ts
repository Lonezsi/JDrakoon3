import { getSocket } from "./socket";
import { notifService } from "./notificationService";
import { appState } from "../core/stateMachine";
import type { AppDefinition } from "../shared/types";

export function launchApp(app: AppDefinition) {
  const socket = getSocket();
  if (!socket?.connected) {
    notifService.push("Not connected to backend");
    return;
  }
  notifService.push(`Starting ${app.name}…`);
  appState.transition("APP_RUNNING"); // loading overlay right away
  console.log("App running happened ar least");

  socket.emit(
    "launch_app",
    { appId: app.id, launcher: app.launcher },
    (res: any) => {
      if (!res?.ok) {
        appState.transition("HOME");
        notifService.push(
          `Failed to launch ${app.name}: ${res?.error || "Unknown error"}`,
        );
      }
    },
  );
}
