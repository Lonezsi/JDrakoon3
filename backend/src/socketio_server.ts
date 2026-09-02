import { Server as HttpServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import logger from "./utils/logger";
import { lobbySync } from "./services/LobbySyncService";
import { videoQueue } from "./services/VideoQueueService";
import { inputService } from "./services/InputService";
import { inputControl } from "./services/InputControlService";
import { syncService } from "./services/SyncService";
import { authService } from "./services/AuthService";
//import { console } from "inspector";
import { gameScanner } from "./services/GameScanner";
import { settingsService } from "./services/SettingsService";
import { accountsService } from "./services/AccountsService";
import { launchApp, RunningApp } from "./services/launcher";
import { focusKiosk } from "./services/kioskFocus";
import { peerSync } from "./services/PeerSyncService";
import { isLikelyGame } from "./utils/gameHeuristic";
import { exec } from "child_process";
import { isWindows, isMac } from "./platform";

// Power off the host. Windows: shutdown.exe; macOS: AppleScript (no sudo for
// the logged-in user); Linux: systemctl/shutdown (may need privileges).
function systemShutdown() {
  const cmd = isWindows
    ? "shutdown /s /t 0"
    : isMac
      ? `osascript -e 'tell application "System Events" to shut down'`
      : "systemctl poweroff || shutdown -h now";
  exec(cmd, (err) => {
    if (err) logger.error("[system] shutdown failed:", err.message);
  });
}

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
  if (pkt.spin && typeof pkt.spin === "object") return true;
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
  let currentApp: RunningApp | null = null;

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
  // Mouse moves stream at touch frequency, so give OS-control its own
  // generous bucket rather than starving it through the shared limiter.
  const controlLimiter = makeRateLimiter(300, 300);

  io.on("connection", (socket) => {
    logger.info("Socket.IO connection", socket.id);

    const auth = (socket.handshake.auth || {}) as any;

    // Peer console linking (PeerSyncService) authenticates by the shared sync
    // code, not the local token. Handle it before the normal token gate and
    // skip all the per-player wiring below.
    if (auth.peer) {
      if (!peerSync.getCode() || auth.code !== peerSync.getCode()) {
        socket.emit("peer_rejected", { reason: "sync code mismatch" });
        socket.disconnect(true);
        return;
      }
      peerSync.attachIncomingPeer(socket as any);
      return;
    }

    const token = auth.token || undefined;
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
      // Warm the OS input driver now so the first touchpad gesture is instant.
      inputControl.warm();
      const seq = syncService.recordEvent("player_joined", player);
      io.to("lobby").emit("player_joined", { ...player, seq });
      // FIX: send current queue state immediately so this client doesn't
      // see an empty queue until the next mutation.
      socket.emit("queue_updated", videoQueue.getState());
      socket.emit("accounts_updated", accountsService.get());

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
        spin: pkt.spin || undefined,
      };

      // While an app is running ("fullscreen" focus) the phone keeps working
      // as a real input device: gamepad buttons are translated into OS key
      // presses so they reach the foreground app.
      if (inputService.getFocus() === "fullscreen") {
        const b = packet.buttons as Record<string, boolean>;
        if (b.up) inputControl.key("UP");
        if (b.down) inputControl.key("DOWN");
        if (b.left) inputControl.key("LEFT");
        if (b.right) inputControl.key("RIGHT");
        if (b.a) inputControl.key("ENTER");
        if (b.b) inputControl.key("ESC");
        if (b.x) inputControl.key("SPACE");
        if (b.y) inputControl.key("TAB");
        if (b.start) inputControl.key("ENTER");
        if (b.select) inputControl.key("ESC");
        if (b.l1) inputControl.key("ALTTAB");
      }

      const actions = inputService.processInput(packet as any);
      for (const action of actions) {
        const seq = syncService.recordEvent("action", action);
        io.to("lobby").emit("action", { ...action, seq });
        lobbySync.handleAction(action as any);
        if (action.type === "jump") accountsService.record("jump");
        if (action.type === "slam") accountsService.record("slam");
      }
      // Mirror lobby input to a synced peer console (if linked) so each sees the
      // other's players.
      peerSync.forwardInput(actions as any[]);
      cb?.({ ok: true });
    });

    // OS-level remote control from the phone touchpad (mouse/keyboard).
    socket.on("control", (pkt: any) => {
      if (!controlLimiter(socket)) return;
      if (!pkt || typeof pkt !== "object") return;
      if (!socket.data.playerId) return;
      switch (pkt.kind) {
        case "move":
          inputControl.move(Number(pkt.dx) || 0, Number(pkt.dy) || 0);
          break;
        case "click":
          inputControl.click("left");
          break;
        case "rclick":
          inputControl.click("right");
          break;
        case "mdown":
          inputControl.mouseDown();
          break;
        case "mup":
          inputControl.mouseUp();
          break;
        case "scroll":
          inputControl.scroll(Number(pkt.dy) || 0);
          break;
        case "key":
          inputControl.key(String(pkt.key || ""));
          break;
        case "combo":
          if (typeof pkt.combo === "string") inputControl.combo(pkt.combo);
          break;
        case "text":
          if (typeof pkt.text === "string") inputControl.text(pkt.text);
          break;
        case "warm":
          inputControl.warm();
          break;
        default:
          break;
      }
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

      // requestedBy: prefer the account gamertag this device is "playing as"
      // (so the queue shows a real name); else the client-supplied name; else
      // the playerId / "Phone".
      const requestedBy =
        accountsService.gamertagForDevice(socket.data.playerId) ||
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
        accountsService.record("queue", item.title);
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

    // ── Library & App launching ────────────────────────────── // TODO check on this. not really used for now
    socket.on("scan_library", async (cb?: Function) => {
      const library = await gameScanner.scan();
      socket.emit("library_updated", library);
      cb?.({ ok: true, library });
    });

    function watchApp(pid: number) {
      const interval = setInterval(() => {
        try {
          process.kill(pid, 0);

          //console.log("alive", pid);
        } catch {
          //console.log("closed", pid);

          clearInterval(interval);

          currentApp = null;

          io.emit("mode_change", {
            mode: "normal",
          });

          io.emit("app_closed");
        }
      }, 1000);

      return interval;
    }

    socket.on(
      "launch_app",
      (payload: { appId: string; launcher?: string }, cb?: Function) => {
        const exePath = payload.launcher;
        if (!exePath) return cb?.({ ok: false, error: "no_launcher_path" });

        // Is this a game (uses a gamepad) or a regular app (needs a cursor)?
        // The console uses this to auto-enable gamepad mouse mode for non-games.
        const appCfg = settingsService.get().apps?.[payload.appId];
        const isGame = isLikelyGame(appCfg?.name || payload.appId, exePath);

        try {
          if (currentApp) {
            currentApp.kill();
            currentApp = null;
          }

          // Tell every client a launch is in progress → loading overlay
          io.to("lobby").emit("app_launching", { appId: payload.appId, isGame });
          accountsService.record("app", payload.appId);

          //watchApp(currentApp?.pid ?? -1);

          currentApp = launchApp(exePath, {
            onReady: (focused) => {
              // Window exists and is foregrounded → safe to swap to the lite page
              io.to("lobby").emit("app_launched", {
                appId: payload.appId,
                focused,
                isGame,
              });
              inputService.setFocus("fullscreen");
            },
            onExit: (code) => {
              currentApp = null;
              io.emit("app_closed", { appId: payload.appId, code });
              inputService.setFocus("menu");
              focusKiosk(); // raise the dashboard back to the foreground
            },
          });

          cb?.({ ok: true });
        } catch (err) {
          logger.error("Failed to launch app:", err);
          io.emit("app_closed", { appId: payload.appId });
          cb?.({ ok: false, error: "launch_failed" });
        }
      },
    );

    // Accept both emit("close_app", cb) and emit("close_app", payload, cb)
    socket.on("close_app", (payloadOrCb?: any, maybeCb?: Function) => {
      const cb = typeof payloadOrCb === "function" ? payloadOrCb : maybeCb;
      if (currentApp) {
        currentApp.kill();
        currentApp = null;
      }
      io.emit("app_closed", {});
      inputService.setFocus("menu");
      focusKiosk(); // raise the dashboard back to the foreground
      cb?.({ ok: true });
    });

    // Phone "system" buttons (home / settings / back / shutdown).
    socket.on("system", (payload: any, cb?: Function) => {
      const action = String(payload?.action || "");
      switch (action) {
        case "home":
          // Close any running app and return the dashboard to its home screen,
          // then raise the kiosk window so the dashboard is actually visible +
          // focused (Windows won't reliably hand focus back to our borderless
          // window when the foreground app dies).
          if (currentApp) {
            currentApp.kill();
            currentApp = null;
          }
          inputService.setFocus("menu");
          io.emit("app_closed", {});
          io.to("lobby").emit("home");
          focusKiosk();
          break;
        case "settings":
          io.to("lobby").emit("open_settings");
          break;
        case "back":
          io.to("lobby").emit("back");
          break;
        case "shutdown":
          logger.warn("[system] shutdown requested from phone");
          io.to("lobby").emit("shutting_down");
          systemShutdown();
          break;
        default:
          break;
      }
      cb?.({ ok: true });
    });

    // ── Peer console sync (PeerSyncService) control, from the dashboard UI ──
    socket.on("sync_set_code", (p: any, cb?: Function) => {
      peerSync.setCode(typeof p === "string" ? p : p?.code || "");
      cb?.({ ok: true, status: peerSync.getStatus() });
    });
    socket.on("sync_connect", (p: any, cb?: Function) => {
      peerSync.connect(p?.url || "", p?.code || peerSync.getCode());
      cb?.({ ok: true, status: peerSync.getStatus() });
    });
    socket.on("sync_disconnect", (cb?: Function) => {
      peerSync.disconnect();
      cb?.({ ok: true });
    });
    socket.on("sync_status", (cb?: Function) => {
      cb?.(peerSync.getStatus());
    });
    // Console-local lobby input (keyboard/gamepad cubes) → forward to the peer
    // only (the console already applied it to its own scene; don't echo back).
    socket.on("lobby_input", (p: any) => {
      if (Array.isArray(p?.actions)) peerSync.forwardInput(p.actions);
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

    // Remove a device from the lobby on request (the dashboard's per-device
    // "disconnect" button). Phones are socket-backed → tell them they were
    // kicked (so they stop auto-reconnecting) and drop the connection; their
    // own disconnect handler emits player_left. Console-local devices
    // (keyboards/gamepads) have no socket → just broadcast player_left so the
    // console removes the cube.
    socket.on("kick_player", (payload: any, cb?: Function) => {
      const pid = payload?.playerId;
      if (!pid) return cb?.({ ok: false });
      let socketBacked = false;
      for (const s of io.sockets.sockets.values()) {
        if (s.data?.playerId === pid) {
          s.emit("kicked");
          s.disconnect(true);
          socketBacked = true;
        }
      }
      if (!socketBacked) {
        lobbySync.removePlayer(pid);
        io.to("lobby").emit("player_left", { playerId: pid });
      }
      logger.info(`[kick] removed player ${pid} from lobby`);
      cb?.({ ok: true });
    });

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

  // Apply a synced peer's lobby input here: re-emit as normal `action`s with
  // "peer:"-prefixed player ids so their cubes appear locally without colliding
  // with our own players' ids. Lobby actions only (never menu navigation).
  peerSync.onApplyRemote((actions) => {
    for (const a of actions) {
      if (!a || !["move", "jump", "slam", "spin"].includes(a.type)) continue;
      const base =
        typeof a.playerId === "string"
          ? a.playerId.replace(/^peer:/, "")
          : "guest";
      io.to("lobby").emit("action", { ...a, playerId: `peer:${base}` });
    }
  });
  // Push link status to the dashboard whenever it changes.
  peerSync.subscribe(() =>
    io.to("lobby").emit("sync_status", peerSync.getStatus()),
  );

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

  // Push settings changes to every client so e.g. the TV's app grid
  // refreshes live when apps are edited or added.
  settingsService.subscribe((settings) => {
    io.emit("settings_updated", { settings });
  });

  // Push account changes (stats tick, create/edit/delete, active switch).
  accountsService.subscribe((state) => {
    io.emit("accounts_updated", state);
  });

  return io;
}
