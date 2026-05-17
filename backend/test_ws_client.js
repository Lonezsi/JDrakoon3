const WebSocket = require("ws");
const PORT = process.env.PORT || 3001;
const url = `ws://localhost:${PORT}/ws`;

console.log("Connecting to", url);
const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("open");
  ws.send(
    JSON.stringify({
      type: "join",
      name: "TestClient",
      color: "#10b981",
      deviceType: "phone",
    }),
  );
});

ws.on("message", (data) => {
  try {
    const msg = JSON.parse(data.toString());
    console.log("RECV", msg);
    if (msg.type === "joined") {
      // send an input payload
      setTimeout(() => {
        ws.send(
          JSON.stringify({
            type: "input",
            analog: { x: 1, y: 0 },
            buttons: {},
          }),
        );
      }, 200);
      setTimeout(() => process.exit(0), 800);
    }
  } catch (e) {
    console.error("invalid msg", data.toString());
  }
});

ws.on("close", () => console.log("closed"));
ws.on("error", (e) => console.error("error", e));
