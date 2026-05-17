import { io, Socket } from "socket.io-client";

type MessageHandler = (msg: any) => void;

let socket: Socket | null = null;
const handlers: MessageHandler[] = [];

function notify(msg: any) {
  handlers.forEach((fn) => fn(msg));
}

export function connect(
  opts: {
    url?: string;
    name?: string;
    color?: string;
    token?: string;
  } = {},
) {
  const backendPort = 3001;
  const wsUrl =
    opts.url ||
    (location.protocol === "https:" ? "wss://" : "ws://") +
      location.hostname +
      ":" +
      backendPort;

  if (socket?.connected) return socket;

  socket = io(wsUrl, {
    auth: { token: opts.token },
    transports: ["websocket", "polling"],
  });

  socket.on("connect", () => {
    if (opts.name) {
      socket!.emit(
        "join",
        {
          name: opts.name,
          color: opts.color || "#6366f1",
          deviceType: "console",
        },
        (res: any) => {
          if (res?.ok) notify({ type: "joined", playerId: res.playerId });
        },
      );
    }
  });

  const events = [
    "lobby_state",
    "queue_updated",
    "player_joined",
    "player_left",
    "action",
    "input:ownership_updated",
  ];
  events.forEach((event) => {
    socket!.on(event, (payload: any) => notify({ type: event, ...payload }));
  });

  socket.on("disconnect", () => notify({ type: "disconnect" }));

  return socket;
}

export function getSocket() {
  return socket;
}

export function subscribe(handler: MessageHandler) {
  handlers.push(handler);
  return () => {
    handlers.splice(handlers.indexOf(handler), 1);
  };
}

export function sendAction(action: { type: string; payload?: any }) {
  if (!socket?.connected) {
    console.warn("Socket not connected");
    return;
  }
  socket.emit(action.type, action.payload);
}
