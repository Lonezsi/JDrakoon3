import express from "express";
import http from "http";
import { Server as IOServer } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import logger from "../src/utils/logger";
import { lobbySync } from "../src/services/LobbySyncService";
import { videoQueue } from "../src/services/VideoQueueService";
import { inputService } from "../src/services/InputService";

// Lightweight Socket.IO example server that reuses existing services.
// Install with: `npm i socket.io` in the backend folder, then run with ts-node.

const app = express();
const httpServer = http.createServer(app);
const io = new IOServer(httpServer, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  logger.info("Socket connected", socket.id);

  socket.on("join", (payload: any, cb?: Function) => {
    const playerId = uuidv4();
    const player = {
      id: playerId,
      name: payload?.name || "Guest",
      color: payload?.color || "#6366f1",
      deviceType: payload?.deviceType || "phone",
      isActive: true,
      lastSeen: Date.now(),
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
    };
    lobbySync.addPlayer(player as any);
    socket.data.playerId = playerId;
    socket.join("lobby");
    io.to("lobby").emit("player_joined", player);
    if (cb) cb({ ok: true, playerId });
  });

  socket.on("input:event", (pkt: any, cb?: Function) => {
    const playerId = socket.data.playerId;
    if (!playerId) return cb?.({ ok: false, error: "not_joined" });
    const packet = { playerId, buttons: pkt.buttons, analog: pkt.analog };
    const actions = inputService.processInput(packet as any);
    for (const action of actions) {
      io.to("lobby").emit("action", action);
      lobbySync.handleAction(action as any);
    }
    cb?.({ ok: true });
  });

  socket.on("queue_add", async (url: string, cb?: Function) => {
    const item = await videoQueue.addToQueue(
      url,
      socket.data.playerId || "Phone",
    );
    if (item) io.to("lobby").emit("queue_updated", videoQueue.getState());
    cb?.({ ok: !!item });
  });

  socket.on("queue_remove", (index: number, cb?: Function) => {
    videoQueue.removeFromQueue(index);
    io.to("lobby").emit("queue_updated", videoQueue.getState());
    cb?.({ ok: true });
  });

  socket.on("media_playpause", () => {
    videoQueue.setPlaying(!videoQueue.getState().playback.isPlaying);
    io.to("lobby").emit("queue_updated", videoQueue.getState());
  });

  socket.on("disconnect", () => {
    const pid = socket.data.playerId;
    if (pid) {
      lobbySync.removePlayer(pid);
      io.to("lobby").emit("player_left", { playerId: pid });
    }
  });
});

// Subscribe services to broadcast updates to clients
lobbySync.subscribe((players, meta) => {
  io.to("lobby").emit("lobby_state", { players, meta });
});

videoQueue.subscribe((queue, playback) => {
  io.to("lobby").emit("queue_updated", { queue, playback });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () =>
  logger.info(`Socket.IO example server listening on ${PORT}`),
);

export default io;
