const WebSocket = require("ws");
const PORT = process.env.PORT || 3001;
const url = `ws://localhost:${PORT}`;

console.log("Connecting console to", url);
const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("console open");
  ws.send(
    JSON.stringify({ type: "join", name: "Console", deviceType: "console" }),
  );
});

ws.on("message", (data) => {
  try {
    const msg = JSON.parse(data.toString());
    console.log("CONSOLE RECV", msg);
    if (msg.type === "joined") {
      // send an action payload
      setTimeout(() => {
        ws.send(
          JSON.stringify({
            type: "action",
            action: { type: "navigate", value: { direction: "right" } },
          }),
        );
      }, 200);
      setTimeout(() => process.exit(0), 800);
    }
  } catch (e) {
    console.error("invalid msg", data.toString());
  }
});

ws.on("close", () => console.log("console closed"));
ws.on("error", (e) => console.error("error", e));
