const { io } = require("socket.io-client");
const url = "http://localhost:3001";
const socket = io(url, { transports: ["websocket"] });

socket.on("connect", () => {
  console.log("connected", socket.id);
  socket.emit("join", { name: "KEEP", deviceType: "phone" }, (res) => {
    console.log("join res", res);
  });
});

socket.on("lobby_state", (p) => console.log('lobby_state', JSON.stringify(p).slice(0,300)));
socket.on("disconnect", () => console.log("disconnected"));

setInterval(() => {}, 1000000);
