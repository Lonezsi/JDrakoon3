import WebSocket from "ws";
import { Server } from "http";
import logger from "../utils/logger";
import { handleMessage } from "./handlers";
import { broadcast } from "./broadcast";
import { lobbySync } from "../services/LobbySyncService";
import { videoQueue } from "../services/VideoQueueService";

export interface ExtendedWebSocket extends WebSocket {
  playerId?: string;
  isAlive?: boolean;
  pendingIds?: Set<string>;
}

const clients = new Map<string, ExtendedWebSocket>();

export function initWebSocketServer(httpServer: Server) {
  // noServer: true – no automatic upgrade listener
  const wss = new WebSocket.Server({ noServer: true });

  // Single upgrade handler that delegates to the correct server
  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", "http://localhost");

    if (url.pathname === "/ws") {
      // Our legacy WebSocket
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
    // For any other path (including /socket.io/) we do nothing,
    // so Socket.IO's own upgrade listener will handle it.
  });

  wss.on("connection", (ws: ExtendedWebSocket) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    // Track optimistic pending IDs created by this connection so we can
    // forward add-failure events only to the originating client.
    ws.pendingIds = new Set<string>();

    // Forward queue add errors to the originating websocket (if it owns
    // the pending id). The returned unsubscribe is called on close.
    const unsubQueueError = videoQueue.onError((pendingId, url, message) => {
      try {
        if (
          ws.pendingIds &&
          ws.pendingIds.has(pendingId) &&
          ws.readyState === WebSocket.OPEN
        ) {
          ws.send(
            JSON.stringify({
              type: "queue_add_failed",
              pendingId,
              url,
              message,
            }),
          );
          ws.pendingIds.delete(pendingId);
        }
      } catch (err) {
        logger.warn(
          "Failed to forward queue_add_failed to websocket client:",
          err,
        );
      }
    });

    ws.on("message", async (data: string) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleMessage(ws, msg);
      } catch (err) {
        logger.error("WebSocket message error:", err);
      }
    });

    ws.on("close", () => {
      try {
        unsubQueueError && unsubQueueError();
      } catch (err) {
        logger.warn("Error unsubscribing websocket queue error handler:", err);
      }
      if (ws.playerId) {
        clients.delete(ws.playerId);
        lobbySync.removePlayer(ws.playerId);
        broadcast("player_left", { playerId: ws.playerId });
      }
    });
  });

  setInterval(() => {
    wss.clients.forEach((ws: ExtendedWebSocket) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  // Broadcast queue updates (including pending items) to websocket clients.
  videoQueue.subscribe((queue, playback, pendingItems) => {
    broadcast("queue_updated", { queue, playback, pendingItems });
  });

  return wss;
}

export function getClient(playerId: string): ExtendedWebSocket | undefined {
  return clients.get(playerId);
}

export function registerClient(ws: ExtendedWebSocket, playerId: string) {
  ws.playerId = playerId;
  clients.set(playerId, ws);
}
