import { getSocket } from "./socket";
import { notifService } from "./notificationService";
import type { AppDefinition } from "../shared/types";

export function launchApp(app: AppDefinition) {
  const socket = getSocket();
  if (!socket?.connected) {
    notifService.push("Not connected to backend");
    return;
  }
  notifService.push(`Starting ${app.name}…`);
  socket.emit(
    "launch_app",
    { appId: app.id, launcher: app.launcher },
    (res: any) => {
      if (!res?.ok) {
        notifService.push(
          `Failed to launch ${app.name}: ${res?.error || "Unknown error"}`,
        );
      }
    },
  );
}
