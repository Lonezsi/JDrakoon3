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
  // Always allow for now (local machine only)
  return true;
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

  // inside initSocketIO, after io is created:
  process.on("uncaughtException", (err) => {
    io.to("lobby").emit("error", { message: err.message });
  });
  process.on("unhandledRejection", (reason: any) => {
    io.to("lobby").emit("error", {
      message: reason?.message || String(reason),
    });
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

    // Track optimistic pending IDs created by this socket so we can forward
    // add-failure events only to the originating client.
    const pendingIds = new Set<string>();
    const unsubQueueError = videoQueue.onError((pendingId, url, message) => {
      try {
        if (pendingIds.has(pendingId)) {
          socket.emit("queue_add_failed", { pendingId, url, message });
          pendingIds.delete(pendingId);
        }
      } catch (err) {
        logger.warn(
          "Failed to forward queue_add_failed to socket client:",
          err,
        );
      }
    });

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
      // FIX: send current queue state immediately so this client doesn't
      // see an empty queue until the next mutation.
      socket.emit("queue_updated", videoQueue.getState());

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

      const cleanUrl = (url: string) => {
        const parsed = new URL(url);

        parsed.searchParams.delete("list");
        parsed.searchParams.delete("index");
        parsed.searchParams.delete("radio");
        parsed.searchParams.delete("sid");

        return parsed.toString();
      };

      if (typeof payload === "string") {
        return cleanUrl(payload);
      }

      if (typeof payload === "object") {
        if (typeof payload.url === "string") {
          return cleanUrl(payload.url);
        }

        // fallback: find any string that looks like an http(s) URL
        for (const k of Object.keys(payload)) {
          const v = payload[k];

          if (
            typeof v === "string" &&
            (v.startsWith("http://") || v.startsWith("https://"))
          ) {
            return cleanUrl(v);
          }
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

      const pendingId =
        typeof payload === "object" && typeof payload.pendingId === "string"
          ? payload.pendingId
          : undefined;

      if (pendingId) pendingIds.add(pendingId);

      // Pass the caller-supplied pendingId through so clients can match
      // optimistic pending entries with server-side notifications.
      const item = await videoQueue.addToQueue(url, requestedBy, pendingId);
      if (item) {
        cb?.({ ok: true });
      } else {
        // The VideoQueueService will call error subscribers which forwards
        // `queue_add_failed` to the originating socket when appropriate.
        cb?.({ ok: false, error: "extraction_failed" });
      }
    });

    socket.on("queue_remove", (payload: any, cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      const index = typeof payload === "number" ? payload : payload?.index;
      if (typeof index !== "number")
        return cb?.({ ok: false, error: "invalid_payload" });
      videoQueue.removeFromQueue(index);
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
      cb?.({ ok: true });
    });

    socket.on("clear_queue", (cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      videoQueue.clearQueue();
      cb?.({ ok: true });
    });

    socket.on("shuffle_queue", (cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      videoQueue.shuffle();
      cb?.({ ok: true });
    });

    socket.on("loop_toggle", (cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      videoQueue.toggleLoop();
      cb?.({ ok: true });
    });

    socket.on("media_playpause", () => {
      if (!rateLimiter(socket)) return;
      videoQueue.setPlaying(!videoQueue.getState().playback.isPlaying);
    });

    socket.on("media_next", () => {
      if (!rateLimiter(socket)) return;
      videoQueue.next();
    });

    socket.on("media_prev", () => {
      if (!rateLimiter(socket)) return;
      videoQueue.previous();
    });

    socket.on("media_seek", (payload: any, cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      const progress =
        payload && typeof payload === "object" ? payload.progress : payload;
      const secs = typeof progress === "number" ? progress : Number(progress);
      if (isNaN(secs)) return cb?.({ ok: false, error: "invalid_payload" });
      videoQueue.setPosition(secs);
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
      cb?.({ ok: true });
    });

    socket.on("media_mute", (cb?: Function) => {
      if (!rateLimiter(socket))
        return cb?.({ ok: false, error: "rate_limited" });
      videoQueue.toggleMute();
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
      try {
        unsubQueueError && unsubQueueError();
      } catch (err) {
        logger.warn("Error unsubscribing socket queue error handler:", err);
      }
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

  videoQueue.subscribe((queue, playback, pendingItems) => {
    const payload = { queue, playback, pendingItems };
    const seq = syncService.recordSnapshot("queue_updated", payload);
    io.to("lobby").emit("queue_updated", { ...payload, seq });
  });

  inputService.subscribeOwnership((target, owner) => {
    const seq = syncService.recordEvent("input:ownership", { target, owner });
    io.to("lobby").emit("input:ownership_updated", { target, owner, seq });
  });

  return io;
}
