const { io } = require("socket.io-client");
const url = "http://localhost:3001";
const socket = io(url, { transports: ["polling"] });

socket.on("connect", () => {
  console.log("connected (polling)", socket.id);
  socket.emit("join", { name: "PollClient", deviceType: "phone" }, (res) => {
    console.log("join res", res);
    socket.disconnect();
  });
});

socket.on("connect_error", (err) => {
  console.error("connect_error", err);
  socket.disconnect();
});

socket.on("action", (a) => console.log("action", a));
socket.on("queue_updated", (q) => console.log("queue_updated", q));
