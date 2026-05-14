import qrcode from "qrcode";
import express from "express";
import http from "http";
import path from "path";
import { initWebSocketServer } from "./websocket/server";
import { setWss } from "./websocket/broadcast";
import { initSocketIO } from "./socketio_server";
import { lobbySync } from "./services/LobbySyncService";
import { settingsService } from "./services/SettingsService";
import { gameScanner } from "./services/GameScanner";
import { appLauncher } from "./services/AppLauncher";
import { PORT, CACHE_DIR, CONFIG_DIR } from "./config/constants";
import logger from "./utils/logger";
import fs from "fs";
import { inputService } from "./services/InputService";
import { broadcast } from "./websocket/broadcast";
import { authService } from "./services/AuthService";

async function bootstrap() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

  await settingsService.init();
  await gameScanner.scan();

  const app = express();
  const server = http.createServer(app);

  const frontendPath = path.join(process.cwd(), "frontend-build");
  const phonePath = path.join(frontendPath, "phone");

  // Serve phone static files under /phone
  if (fs.existsSync(phonePath)) {
    app.use("/phone", express.static(phonePath));
    logger.info(`Serving phone frontend from ${phonePath}`);
  } else {
    logger.warn(`Phone frontend not found at ${phonePath}`);
  }

  // Serve TV UI static files at root
  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    logger.info(`Serving TV UI from ${frontendPath}`);
  } else {
    logger.warn(
      "Frontend build not found, please build couch-console and copy to ./frontend-build",
    );
  }

  // Video stream endpoint
  app.get("/stream", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      res.status(400).send("Missing url");
      return;
    }
    const { streamVideo } = await import("./utils/ytdlp");
    streamVideo(url, res);
  });

  // SPA fallback for phone app (deep links)
  app.get("/phone/*", (req, res) => {
    const phoneIndex = path.join(phonePath, "index.html");
    if (fs.existsSync(phoneIndex)) {
      res.sendFile(phoneIndex);
    } else {
      res.status(404).send("Phone app not found");
    }
  });

  // SPA fallback for TV UI (all other routes)
  app.get("*", (req, res) => {
    // Skip API and stream paths
    if (req.path.startsWith("/stream") || req.path.startsWith("/ws")) {
      return res.status(404).send("Not found");
    }
    const tvIndex = path.join(frontendPath, "index.html");
    if (fs.existsSync(tvIndex)) {
      res.sendFile(tvIndex);
    } else {
      res.status(404).send("TV UI not found");
    }
  });

  const wss = initWebSocketServer(server);
  setWss(wss);

  // Pairing endpoints: create and inspect short-lived pairing tokens
  app.post("/pair", express.json(), (req, res) => {
    const { meta, ttl, oneTime } = req.body || {};
    const entry = authService.createPairToken(
      meta,
      typeof ttl === "number" ? ttl : undefined,
      !!oneTime,
    );
    res.json({ ok: true, token: entry.token, expiresAt: entry.expiresAt });
  });

  app.get("/pair/:token", (req, res) => {
    const t = req.params.token;
    const info = authService.get(t);
    if (!info) return res.status(404).json({ ok: false });
    res.json({ ok: true, info });
  });

  // QR pairing: returns an SVG QR code containing the token (useful for displaying on TV)
  app.get("/pair/qr", async (req, res) => {
    const entry = authService.createPairToken({}, 2 * 60 * 1000, true);
    const payload = JSON.stringify({ token: entry.token });
    try {
      const svg = await qrcode.toString(payload, {
        type: "svg",
        errorCorrectionLevel: "M",
      });
      res.type("image/svg+xml").send(svg);
    } catch (err) {
      res.status(500).json({ ok: false });
    }
  });

  // Initialize Socket.IO alongside existing WebSocket server
  try {
    initSocketIO(server);
    logger.info("Socket.IO initialized");
  } catch (err) {
    logger.warn("Failed to initialize Socket.IO:", err);
  }

  lobbySync.start();

  appLauncher.onExit((appId, code) => {
    broadcast("app_closed", { appId, code });
    inputService.setFocus("menu");
  });

  server.listen(PORT, () => {
    logger.info(`Backend listening on http://localhost:${PORT}`);
    logger.info(`TV UI: http://localhost:${PORT}`);
    logger.info(`Phone UI: http://localhost:${PORT}/phone`);
  });
}

bootstrap().catch((err) => {
  logger.error("Fatal error during bootstrap:", err);
  process.exit(1);
});
