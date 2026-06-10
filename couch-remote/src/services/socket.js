import { setTransport } from "./inputActions";
import { io } from "socket.io-client";

let socket = null;
let listeners = [];

function notify(msg) {
  listeners.forEach((fn) => fn(msg));
}

export function connect(url, opts = {}) {
  const backendPort = 3001;
  const wsUrl =
    url ||
    (location.protocol === "https:" ? "wss://" : "ws://") +
      location.hostname +
      ":" +
      backendPort;

  // If we've already created a socket, reuse it instead of creating a new
  // connection on every call (connect() can be invoked from many hooks).
  if (socket) {
    // If caller asked to join and we're already connected, emit join.
    if (opts.name && socket.connected) {
      socket.emit(
        "join",
        { name: opts.name, color: opts.color, deviceType: "phone" },
        (res) => {
          if (res && res.ok) notify({ type: "joined", playerId: res.playerId });
        },
      );
    }

    return {
      subscribe(fn) {
        listeners.push(fn);
        return () => {
          listeners = listeners.filter((l) => l !== fn);
        };
      },
      sendAction(action) {
        setTransport && setTransport(action);
      },
      disconnect() {
        socket && socket.disconnect();
        socket = null;
      },
    };
  }

  // Allow engine.io polling fallback (don't force websocket) to avoid "Invalid frame header" errors
  socket = io(wsUrl, { auth: { token: opts.token } });

  socket.on("connect", () => {
    console.log("Connected to server via socket.io", opts.color);
    if (opts.name)
      socket.emit(
        "join",
        { name: opts.name, color: opts.color, deviceType: "phone" },
        (res) => {
          if (res && res.ok) notify({ type: "joined", playerId: res.playerId });
        },
      );
  });

  // Forward server events to subscribers
  const forwardEvents = [
    "lobby_state",
    "queue_updated",
    "player_joined",
    "player_left",
    "action",
    "input:ownership_updated",
    "queue_add_failed",
    "video_error",
  ];
  forwardEvents.forEach((e) =>
    socket.on(e, (payload) => notify({ type: e, ...payload })),
  );

  socket.on("disconnect", () => notify({ type: "disconnect" }));

  // set transport for inputActions
  let lastMoveSent = 0;
  setTransport((action) => {
    if (!socket || !socket.connected) return;
    const { type, payload } = action;

    switch (type) {
      // ── Cube movement (joystick) ──
      case "CUBE_MOVE": {
        const x = payload?.x ?? 0;
        const y = payload?.y ?? 0;
        // Throttle the touch-frequency stream to ~20/s so the backend's
        // rate limiter (30/s) never runs dry — when it did, the final 0,0
        // release packet got dropped and the cube kept moving forever.
        // Zero (release) packets always pass.
        const now = Date.now();
        if ((x !== 0 || y !== 0) && now - lastMoveSent < 50) break;
        lastMoveSent = now;
        socket.emit("input:event", { analog: { x, y } });
        break;
      }

      // ── A / B / X / Y ──
      case "A":
        socket.emit("input:event", { buttons: { a: true } });
        break;
      case "B":
        socket.emit("input:event", { buttons: { b: true } });
        break;
      case "X":
        socket.emit("input:event", { buttons: { x: true } });
        break;
      case "Y":
        socket.emit("input:event", { buttons: { y: true } });
        break;

      // ── D‑pad → directional buttons ──
      case "NAV_UP":
        socket.emit("input:event", { buttons: { up: true } });
        break;
      case "NAV_DOWN":
        socket.emit("input:event", { buttons: { down: true } });
        break;
      case "NAV_LEFT":
        socket.emit("input:event", { buttons: { left: true } });
        break;
      case "NAV_RIGHT":
        socket.emit("input:event", { buttons: { right: true } });
        break;

      // ── CONFIRM (A already covers it, but keep for safety) ──
      case "CONFIRM":
        socket.emit("input:event", { buttons: { a: true } });
        break;

      // ── BACK (backend maps b → back in menu focus) ──
      case "BACK":
        socket.emit("input:event", { buttons: { b: true } });
        break;

      // ── HOME (backend maps start → home in menu focus) ──
      case "HOME":
        socket.emit("input:event", { buttons: { start: true } });
        break;
      case "MENU":
        socket.emit("action", { type: "menu" });
        break;
      case "POWER":
        socket.emit("action", { type: "power" });
        break;
      case "START":
        socket.emit("input:event", { buttons: { start: true } });
        break;
      case "SELECT":
        socket.emit("input:event", { buttons: { select: true } });
        break;
      // Generic gamepad buttons (l1/l2/r1/r2 …) — forwarded as-is; the
      // backend maps them per focus mode.
      case "GP_BUTTON":
        if (payload?.button)
          socket.emit("input:event", { buttons: { [payload.button]: true } });
        break;

      // ── Touchpad: OS mouse / keyboard control ─────────────
      case "MOUSE_MOVE":
        socket.emit("control", {
          kind: "move",
          dx: payload?.dx ?? 0,
          dy: payload?.dy ?? 0,
        });
        break;
      case "MOUSE_CLICK":
        socket.emit("control", { kind: "click" });
        break;
      case "MOUSE_RIGHT_CLICK":
        socket.emit("control", { kind: "rclick" });
        break;
      case "MOUSE_DOWN":
        socket.emit("control", { kind: "mdown" });
        break;
      case "MOUSE_UP":
        socket.emit("control", { kind: "mup" });
        break;
      case "SCROLL":
        // Two-finger drag delta (px) → wheel notches; invert for natural scroll.
        socket.emit("control", { kind: "scroll", dy: -(payload?.dy ?? 0) * 3 });
        break;
      case "KEY_PRESS":
        socket.emit("control", { kind: "key", key: payload?.key });
        break;
      case "TEXT_INPUT":
        socket.emit("control", { kind: "text", text: payload?.text ?? "" });
        break;

      // ── Media controls ────────────────────────────────────
      case "MEDIA_PLAY_PAUSE":
        socket.emit("media_playpause");
        break;
      case "MEDIA_NEXT":
        socket.emit("media_next");
        break;
      case "MEDIA_PREV":
        socket.emit("media_prev");
        break;
      case "ADD_TO_QUEUE":
        socket.emit("queue_add", payload.url);
        break;
      case "REMOVE_FROM_QUEUE":
        socket.emit("queue_remove", payload.index);
        break;

      default:
        console.warn("unhandled action", action);
    }
  });

  return {
    subscribe(fn) {
      listeners.push(fn);
      return () => {
        listeners = listeners.filter((l) => l !== fn);
      };
    },
    sendAction(action) {
      setTransport && setTransport(action);
    },
    disconnect() {
      socket && socket.disconnect();
      socket = null;
    },
  };
}
