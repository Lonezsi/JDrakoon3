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
    // Map action to socket.io events
    const { type, payload } = action;
    switch (type) {
      case "MOUSE_MOVE":
        return socket.emit("input:event", {
          analog: { x: payload.dx || 0, y: payload.dy || 0 },
          buttons: {},
        });
      case "MOUSE_CLICK":
        return socket.emit("input:event", { buttons: { a: true } });
      case "MOUSE_RIGHT_CLICK":
        return socket.emit("input:event", { buttons: { b: true } });
      case "NAV_UP":
      case "NAV_DOWN":
      case "NAV_LEFT":
      case "NAV_RIGHT":
        return socket.emit("action", {
          type: "navigate",
          value: { direction: type.split("_")[1].toLowerCase() },
        });
      case "CONFIRM":
        return socket.emit("action", { type: "confirm" });
      case "SCROLL":
        return socket.emit("action", {
          type: "scroll",
          value: { dy: payload.dy },
        });
      case "KEY_PRESS":
        return socket.emit("action", {
          type: "key",
          value: { key: payload.key },
        });
      case "TEXT_INPUT":
        return socket.emit("action", {
          type: "text",
          value: { text: payload.text },
        });
      case "MEDIA_PLAY_PAUSE":
        return socket.emit("media_playpause");
      case "MEDIA_NEXT":
        return socket.emit("media_next");
      case "MEDIA_PREV":
        return socket.emit("media_prev");
      case "ADD_TO_QUEUE":
        return socket.emit("queue_add", payload.url);
      case "REMOVE_FROM_QUEUE":
        return socket.emit("queue_remove", payload.index);
      default:
        return console.warn("unhandled action", action);
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
