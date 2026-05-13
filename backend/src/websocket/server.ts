import WebSocket from "ws";
import { Server } from "http";
import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";
import { handleMessage } from "./handlers";
import { broadcast } from "./broadcast";
import { Player } from "../models/types";
import { lobbySync } from "../services/LobbySyncService";

export interface ExtendedWebSocket extends WebSocket {
  playerId?: string;
  isAlive?: boolean;
}

const clients = new Map<string, ExtendedWebSocket>();

export function initWebSocketServer(httpServer: Server) {
  const wss = new WebSocket.Server({ server: httpServer });

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
