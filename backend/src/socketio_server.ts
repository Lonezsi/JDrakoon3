import { Server as HttpServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import logger from "./utils/logger";
import { lobbySync } from "./services/LobbySyncService";
import { videoQueue } from "./services/VideoQueueService";
import { inputService } from "./services/InputService";
import { syncService } from "./services/SyncService";
import { authService } from "./services/AuthService";
import { console } from "inspector";

type RateBucket = { tokens: number; lastRefill: number };

function makeRateLimiter(ratePerSec: number, burst: number) {
  const buckets = new WeakMap<Socket, RateBucket>();
  return (socket: Socket, cost = 1) => {
    let b = buckets.get(socket);
    const now = Date.now();
    if (!b) {
      b = { tokens: burst, lastRefill: now };
      buckets.set(socket, b);
    }
    const elapsed = (now - b.lastRefill) / 1000;
    b.tokens = Math.min(burst, b.tokens + elapsed * ratePerSec);
    b.lastRefill = now;
    if (b.tokens >= cost) {
      b.tokens -= cost;
      return true;
    }
    return false;
  };
}

function validateInputPacket(pkt: any) {
  if (!pkt || typeof pkt !== "object") return false;
  if (pkt.buttons && typeof pkt.buttons === "object") return true;
  if (pkt.analog && typeof pkt.analog === "object") return true;
  return false;
}

function validateUrl(u: any) {
  return (
    typeof u === "string" &&
    u.length > 5 &&
    (u.startsWith("http://") || u.startsWith("https://"))
  );
}

function verifyToken(token?: string) {
  if (!token) {
    if (process.env.NODE_ENV !== "production") return true;
    return false;
  }
  if (authService.consumeToken(token)) return true;
  if (process.env.SOCKET_SECRET) return token === process.env.SOCKET_SECRET;
  return false;
}

export function initSocketIO(server: HttpServer) {
  const io = new IOServer(server, {
    cors: { origin: "*" },
    transports: ["polling", "websocket"],
    perMessageDeflate: false,
  });
  const rateLimiter = makeRateLimiter(30, 60);

  io.on("connection", (socket) => {
    logger.info("Socket.IO connection", socket.id);

    const token =
      (socket.handshake.auth && (socket.handshake.auth as any).token) ||
      undefined;
    if (!verifyToken(token)) {
      logger.warn("Socket rejected (bad token)", socket.id);
      socket.emit("error", { code: "unauthorized" });
      socket.disconnect(true);
      return;
    }

    socket.on("join", (payload: any, cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });

      let color = "#6366f1";
      if (payload?.color) {
        if (typeof payload.color === "string") {
          color = payload.color;
        } else if (payload.color.hex && typeof payload.color.hex === "string") {
          color = payload.color.hex;
        }
      }

      const playerId = uuidv4();
      const player = {
        id: playerId,
        name: payload?.name || "Guest",
        color,
        deviceType: payload?.deviceType || "phone",
        isActive: true,
        lastSeen: Date.now(),
        pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 },
      };

      lobbySync.addPlayer(player as any);
      socket.data.playerId = playerId;
      socket.join("lobby");
      const seq = syncService.recordEvent("player_joined", player);
      io.to("lobby").emit("player_joined", { ...player, seq });
      cb?.({ ok: true, playerId });
    });
    //
    socket.on("input:event", (pkt: any, cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      const playerId = socket.data.playerId as string | undefined;
      if (!playerId) return cb?.({ ok: false, error: "not_joined" });
      if (!validateInputPacket(pkt))
        return cb?.({ ok: false, error: "invalid_packet" });
      const packet = {
        playerId,
        buttons: pkt.buttons || {},
        analog: pkt.analog || { x: 0, y: 0 },
      };
      const actions = inputService.processInput(packet as any);
      for (const action of actions) {
        const seq = syncService.recordEvent("action", action);
        io.to("lobby").emit("action", { ...action, seq });
        lobbySync.handleAction(action as any);
      }
      cb?.({ ok: true });
    });

    // --- QUEUE & MEDIA (new, but backward‑compatible) ---

    // Helper: extract URL from either a plain string or an object payload
    function extractUrl(payload: any): string | undefined {
      if (!payload) return undefined;
      if (typeof payload === "string") return payload;
      if (typeof payload === "object") {
        if (typeof payload.url === "string") return payload.url;
        // fallback: find any string that looks like an http(s) URL
        for (const k of Object.keys(payload)) {
          const v = payload[k];
          if (
            typeof v === "string" &&
            (v.startsWith("http://") || v.startsWith("https://"))
          )
            return v;
        }
      }
      return undefined;
    }

    socket.on("queue_add", async (payload: any, cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });

      const url = extractUrl(payload);
      if (!url || !validateUrl(url))
        return cb?.({ ok: false, error: "invalid_url" });

      // requestedBy: if payload is an object with that field, use it; else fallback to playerId or "Phone"
      const requestedBy =
        (typeof payload === "object" && payload.requestedBy) ||
        socket.data.playerId ||
        "Phone";

      const item = await videoQueue.addToQueue(url, requestedBy);
      if (item) {
        const state = videoQueue.getState();
        const seq = syncService.recordSnapshot("queue_updated", state);
        io.to("lobby").emit("queue_updated", { ...state, seq });
      }
      cb?.({ ok: !!item });
    });

    socket.on("queue_remove", (payload: any, cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      const index = typeof payload === "number" ? payload : payload?.index;
      if (typeof index !== "number")
        return cb?.({ ok: false, error: "invalid_payload" });
      videoQueue.removeFromQueue(index);
      const state = videoQueue.getState();
      const seq = syncService.recordSnapshot("queue_updated", state);
      io.to("lobby").emit("queue_updated", { ...state, seq });
      cb?.({ ok: true });
    });

    socket.on("queue_move", (payload: any, cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      const index = payload?.index;
      const direction = payload?.direction;
      if (
        typeof index !== "number" ||
        (direction !== "up" && direction !== "down")
      )
        return cb?.({ ok: false, error: "invalid_payload" });
      videoQueue.moveItem(index, direction);
      const state = videoQueue.getState();
      const seq = syncService.recordSnapshot("queue_updated", state);
      io.to("lobby").emit("queue_updated", { ...state, seq });
      cb?.({ ok: true });
    });

    socket.on("clear_queue", (cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      videoQueue.clearQueue();
      const state = videoQueue.getState();
      const seq = syncService.recordSnapshot("queue_updated", state);
      io.to("lobby").emit("queue_updated", { ...state, seq });
      cb?.({ ok: true });
    });

    socket.on("shuffle_queue", (cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      videoQueue.shuffle();
      const state = videoQueue.getState();
      const seq = syncService.recordSnapshot("queue_updated", state);
      io.to("lobby").emit("queue_updated", { ...state, seq });
      cb?.({ ok: true });
    });

    socket.on("loop_toggle", (cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      videoQueue.toggleLoop();
      const state = videoQueue.getState();
      const seq = syncService.recordSnapshot("queue_updated", state);
      io.to("lobby").emit("queue_updated", { ...state, seq });
      cb?.({ ok: true });
    });

    socket.on("media_playpause", () => {
      if (!rateLimiter(socket)) return;
      videoQueue.setPlaying(!videoQueue.getState().playback.isPlaying);
      const state = videoQueue.getState();
      const seq = syncService.recordSnapshot("queue_updated", state);
      io.to("lobby").emit("queue_updated", { ...state, seq });
    });

    socket.on("media_next", () => {
      if (!rateLimiter(socket)) return;
      videoQueue.next();
      const state = videoQueue.getState();
      const seq = syncService.recordSnapshot("queue_updated", state);
      io.to("lobby").emit("queue_updated", { ...state, seq });
    });

    socket.on("media_prev", () => {
      if (!rateLimiter(socket)) return;
      videoQueue.previous();
      const state = videoQueue.getState();
      const seq = syncService.recordSnapshot("queue_updated", state);
      io.to("lobby").emit("queue_updated", { ...state, seq });
    });

    socket.on("media_seek", (payload: any, cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      const progress =
        payload && typeof payload === "object" ? payload.progress : payload;
      const secs = typeof progress === "number" ? progress : Number(progress);
      if (isNaN(secs)) return cb?.({ ok: false, error: "invalid_payload" });
      videoQueue.setPosition(secs);
      const state = videoQueue.getState();
      const seq = syncService.recordSnapshot("queue_updated", state);
      io.to("lobby").emit("queue_updated", { ...state, seq });
      cb?.({ ok: true });
    });

    socket.on("media_volume", (payload: any, cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      const vol =
        payload && typeof payload === "object" ? payload.volume : payload;
      const num = typeof vol === "number" ? vol : Number(vol);
      if (isNaN(num)) return cb?.({ ok: false, error: "invalid_payload" });
      videoQueue.setVolume(num);
      const state = videoQueue.getState();
      const seq = syncService.recordSnapshot("queue_updated", state);
      io.to("lobby").emit("queue_updated", { ...state, seq });
      cb?.({ ok: true });
    });

    socket.on("media_mute", (cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      videoQueue.toggleMute();
      const state = videoQueue.getState();
      const seq = syncService.recordSnapshot("queue_updated", state);
      io.to("lobby").emit("queue_updated", { ...state, seq });
      cb?.({ ok: true });
    });

    // ---- ownership events (unchanged) ----
    socket.on(
      "input:claim",
      (
        payload: { target: string; ttl?: number; priority?: number },
        cb?: Function,
      ) => {
        if (!rateLimiter(socket))
          return cb?.({ ok: false, error: "rate_limited" });
        const playerId = socket.data.playerId as string | undefined;
        if (!playerId) return cb?.({ ok: false, error: "not_joined" });
        const res = inputService.claim(
          playerId,
          payload.target,
          payload.ttl,
          payload.priority || 0,
        );
        if (res.ok) {
          const seq = syncService.recordEvent("input:ownership", {
            target: payload.target,
            owner: res.owner,
          });
          io.to("lobby").emit("input:ownership_updated", {
            target: payload.target,
            owner: res.owner,
            seq,
          });
        }
        cb?.(res);
      },
    );

    socket.on("input:release", (payload: { target: string }, cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      const playerId = socket.data.playerId as string | undefined;
      if (!playerId) return cb?.({ ok: false, error: "not_joined" });
      const res = inputService.release(playerId, payload.target);
      if (res.ok) {
        const seq = syncService.recordEvent("input:ownership", {
          target: payload.target,
          owner: null,
        });
        io.to("lobby").emit("input:ownership_updated", {
          target: payload.target,
          owner: null,
          seq,
        });
      }
      cb?.(res);
    });

    socket.on(
      "input:heartbeat",
      (payload: { target: string; ttl?: number }, cb?: Function) => {
        if (!rateLimiter(socket))
          return cb?.({ ok: false, error: "rate_limited" });
        const playerId = socket.data.playerId as string | undefined;
        if (!playerId) return cb?.({ ok: false, error: "not_joined" });
        const res = inputService.heartbeat(
          playerId,
          payload.target,
          payload.ttl,
        );
        if (res.ok) {
          const seq = syncService.recordEvent("input:ownership", {
            target: payload.target,
            owner: res.owner,
          });
          io.to("lobby").emit("input:ownership_updated", {
            target: payload.target,
            owner: res.owner,
            seq,
          });
        }
        cb?.(res);
      },
    );

    socket.on(
      "resync",
      (payload: { type: string; since?: number }, cb?: Function) => {
        try {
          const since = payload?.since || 0;
          const type = payload?.type || "lobby_state";
          const replay = syncService.getReplay(type, since);
          cb?.({ ok: true, replay });
        } catch (err) {
          cb?.({ ok: false, error: "resync_failed" });
        }
      },
    );

    socket.on("disconnect", () => {
      const pid = socket.data.playerId as string | undefined;
      if (pid) {
        lobbySync.removePlayer(pid);
        io.to("lobby").emit("player_left", { playerId: pid });
      }
    });
  });

  lobbySync.subscribe((players, meta) => {
    const payload = { players, meta };
    const seq = syncService.recordSnapshot("lobby_state", payload);
    io.to("lobby").emit("lobby_state", { ...payload, seq });
  });

  videoQueue.subscribe((queue, playback) => {
    const payload = { queue, playback };
    const seq = syncService.recordSnapshot("queue_updated", payload);
    io.to("lobby").emit("queue_updated", { ...payload, seq });
  });

  inputService.subscribeOwnership((target, owner) => {
    const seq = syncService.recordEvent("input:ownership", { target, owner });
    io.to("lobby").emit("input:ownership_updated", { target, owner, seq });
  });

  return io;
}
