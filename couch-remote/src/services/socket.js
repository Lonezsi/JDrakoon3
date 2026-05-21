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
  ];
  forwardEvents.forEach((e) =>
    socket.on(e, (payload) => notify({ type: e, ...payload })),
  );

  socket.on("disconnect", () => notify({ type: "disconnect" }));

  // set transport for inputActions
  setTransport((action) => {
    if (!socket || !socket.connected)
      return console.warn("socket not connected");

    const { type, payload } = action;

    switch (type) {
      // ── Cube movement (joystick) ──────────────────────────
      case "CUBE_MOVE":
        socket.emit("input:event", {
          analog: {
            x: payload?.x ?? 0,
            y: payload?.y ?? 0,
          },
          buttons: {},
        });
        console.log("📱 Sending CUBE_MOVE:", payload);
        break;

      // ── Jump ──────────────────────────────────────────────
      case "JUMP":
        socket.emit("input:event", {
          analog: { x: 0, y: 0 },
          buttons: { jump: true },
        });
        console.log("📱 Sending JUMP");
        break;

      // ── Emote ─────────────────────────────────────────────
      case "EMOTE":
        socket.emit("action", {
          type: "emote",
          value: payload?.emote ?? "wave",
        });
        console.log("📱 Sending EMOTE:", payload?.emote);
        break;

      // ── Mouse / touchpad ─────────────────────────────────
      case "MOUSE_MOVE":
        socket.emit("input:event", {
          analog: { x: payload.dx || 0, y: payload.dy || 0 },
          buttons: {},
        });
        break;
      case "MOUSE_CLICK":
        socket.emit("input:event", { buttons: { a: true } });
        break;
      case "MOUSE_RIGHT_CLICK":
        socket.emit("input:event", { buttons: { b: true } });
        break;

      // ── Navigation (D‑pad) ────────────────────────────────
      case "NAV_UP":
      case "NAV_DOWN":
      case "NAV_LEFT":
      case "NAV_RIGHT":
        socket.emit("action", {
          type: "navigate",
          value: { direction: type.split("_")[1].toLowerCase() },
        });
        break;
      case "CONFIRM":
        socket.emit("action", { type: "confirm" });
        break;

      // ── Scrolling / keyboard / text ───────────────────────
      case "SCROLL":
        socket.emit("action", { type: "scroll", value: { dy: payload.dy } });
        break;
      case "KEY_PRESS":
        socket.emit("action", { type: "key", value: { key: payload.key } });
        break;
      case "TEXT_INPUT":
        socket.emit("action", { type: "text", value: { text: payload.text } });
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
