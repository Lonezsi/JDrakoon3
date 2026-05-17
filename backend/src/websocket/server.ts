import WebSocket from "ws";
import { Server } from "http";
import logger from "../utils/logger";
import { handleMessage } from "./handlers";
import { broadcast } from "./broadcast";
import { lobbySync } from "../services/LobbySyncService";

export interface ExtendedWebSocket extends WebSocket {
  playerId?: string;
  isAlive?: boolean;
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

    ws.on("message", async (data: string) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleMessage(ws, msg);
      } catch (err) {
        logger.error("WebSocket message error:", err);
      }
    });

    ws.on("close", () => {
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

  return wss;
}

export function getClient(playerId: string): ExtendedWebSocket | undefined {
  return clients.get(playerId);
}

export function registerClient(ws: ExtendedWebSocket, playerId: string) {
  ws.playerId = playerId;
  clients.set(playerId, ws);
}
