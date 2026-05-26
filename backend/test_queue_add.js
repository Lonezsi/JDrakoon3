// backend/test_queue_add.js
const { io } = require("socket.io-client");
const s = io("http://localhost:3001", { transports: ["websocket"] });
s.on("connect", () => {
  s.emit("join", { name: "test" }, () => {
    const pid = "pending-" + Date.now();
    s.emit(
      "queue_add",
      {
        url: "https://www.youtube.com/watch?v=EM5Q7HIe3_8",
        pendingId: pid,
        requestedBy: "test",
      },
      (ack) => console.log("ack", ack),
    );
  });
});
s.on("queue_add_failed", (m) => console.log("queue_add_failed", m));
s.on("queue_updated", (q) => console.log("queue_updated", q));
s.on("video_error", (m) => console.log("video_error", m));
