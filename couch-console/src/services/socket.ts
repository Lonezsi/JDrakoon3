import { io, Socket } from "socket.io-client";

type Listener = (msg: any) => void;

let socket: Socket | null = null;
let listeners: Listener[] = [];

function notify(msg: any) {
  listeners.forEach((fn) => fn(msg));
}

export function connect(url?: string, opts: any = {}) {
  const backendPort = 3001;
  const wsUrl =
    url ||
    (location.protocol === "https:" ? "wss://" : "ws://") +
      location.hostname +
      ":" +
      backendPort;
  // Allow polling fallback; let Socket.IO handle upgrade to WebSocket
  socket = io(wsUrl, { auth: { token: opts.token } });

  socket.on("connect", () => {
    if (opts.name)
      socket.emit(
        "join",
        { name: opts.name, deviceType: "console" },
        (res: any) => {
          if (res && res.ok) notify({ type: "joined", playerId: res.playerId });
        },
      );
  });

  const forward = [
    "lobby_state",
    "queue_updated",
    "player_joined",
    "player_left",
    "action",
    "input:ownership_updated",
  ];
  forward.forEach((e) =>
    socket!.on(e, (payload: any) => notify({ type: e, ...payload })),
  );

  socket.on("disconnect", () => notify({ type: "disconnect" }));

  return {
    subscribe(fn: Listener) {
      listeners.push(fn);
      return () => {
        listeners = listeners.filter((l) => l !== fn);
      };
    },
    sendAction(action: any) {
      if (!socket || !socket.connected)
        return console.warn("socket not connected");
      // map action to socket.io events
      const { type, payload } = action;
      switch (type) {
        default:
          socket.emit("action", action);
      }
    },
    disconnect() {
      socket && socket.disconnect();
      socket = null;
    },
  };
}

export default { connect };
