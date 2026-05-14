const { io } = require("socket.io-client");
const url = "http://localhost:3001";
const socket = io(url, { transports: ["websocket"] });

socket.on("connect", () => {
  console.log("connected", socket.id);
  socket.emit("join", { name: "SOClient", deviceType: "phone" }, (res) => {
    console.log("join res", res);
    if (res && res.ok) {
      socket.emit(
        "input:event",
        { analog: { x: 1, y: 0 }, buttons: {} },
        (ack) => {
          console.log("input ack", ack);
          socket.disconnect();
        },
      );
    } else {
      socket.disconnect();
    }
  });
});

socket.on("connect_error", (err) => {
  console.error("connect_error", err);
  socket.disconnect();
});
socket.on("action", (a) => console.log("action", a));
socket.on("queue_updated", (q) => console.log("queue_updated", q));
