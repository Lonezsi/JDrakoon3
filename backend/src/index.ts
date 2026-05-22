import qrcode from "qrcode";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import os from "os";
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
import { createProxyMiddleware } from "http-proxy-middleware";

async function bootstrap() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

  await settingsService.init();
  await gameScanner.scan();

  const app = express();
  const server = http.createServer(app);

  const frontendPath = path.join(process.cwd(), "frontend-build");
  const phonePath = path.join(frontendPath, "phone");

  const isDev = process.env.NODE_ENV !== "production";

  // ── API routes (must come before proxies / static) ──────────

  // Dynamic QR code for phone pairing
  app.get("/qr-code", async (req, res) => {
    try {
      let ip = req.hostname;
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]!) {
          if (net.family === "IPv4" && !net.internal) {
            ip = net.address;
            break;
          }
        }
        if (ip !== req.hostname) break;
      }
      const phoneUrl = `http://${ip}:${PORT}/phone`;
      const svg = await qrcode.toString(phoneUrl, {
        type: "svg",
        errorCorrectionLevel: "M",
      });
      res.json({ svg, url: phoneUrl });
    } catch (err) {
      res.status(500).json({ ok: false });
    }
  });

  // Video streaming
  app.get("/stream", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      res.status(400).send("Missing url");
      return;
    }
    const { streamVideo } = await import("./utils/ytdlp");
    streamVideo(url, res);
  });

  // Pairing endpoints
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

  // Debug: return current lobby players (subscribe returns current state synchronously)
  app.get("/_debug/lobby", (req, res) => {
    try {
      const players = (lobbySync as any).getPlayers()
      res.json({ players });
    } catch (err) {
      res.status(500).json({ ok: false });
    }
  });

  // Token‑based QR (deprecated)
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

  // ── Frontend serving ───────────────────────────────────────

  if (isDev) {
    logger.info("Development mode: proxying to Vite dev servers");

    // Detect which Vite server is serving the phone UI (ports may swap
    // if one port is already in use). Probe both common ports and pick the
    // one that responds to /phone/ with 200.
    let phoneTarget = "http://localhost:5174";
    let tvTarget = "http://localhost:5173";
    const probePhone = async (port: number) => {
      return new Promise<boolean>((resolve) => {
        const req = http.request(
          {
            hostname: "localhost",
            port,
            path: "/phone/",
            method: "GET",
            timeout: 1000,
          },
          (res) => {
            const ok = res.statusCode === 200;
            res.resume();
            resolve(ok);
          },
        );
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
        req.end();
      });
    };
    try {
      const p5174 = await probePhone(5174);
      const p5173 = await probePhone(5173);
      if (p5174 && !p5173) {
        phoneTarget = "http://localhost:5174";
        tvTarget = "http://localhost:5173";
      } else if (p5173 && !p5174) {
        phoneTarget = "http://localhost:5173";
        tvTarget = "http://localhost:5174";
      }
      logger.info(`Detected phone dev server: ${phoneTarget}`);
    } catch (e) {
      logger.warn("Failed to probe Vite dev servers, using defaults");
    }

    // Safe redirect from /phone → /phone/ BEFORE the proxy (avoids Vite's own redirect)
    // Only redirect for the exact `/phone` path — don't redirect if the path
    // is already `/phone/` (Express may call this handler for both variants).
    app.get("/phone", (req: Request, res: Response, next: NextFunction) => {
      const orig = (req.originalUrl || req.url || "") as string;
      if (!orig.endsWith("/")) return res.redirect(301, "/phone/");
      return next();
    });

    // Phone UI → Vite (port 5174) — NO pathRewrite, Vite expects /phone/ paths
    app.use(
      "/phone",
      createProxyMiddleware({
        target: phoneTarget,
        changeOrigin: true, // needed for HMR
        ws: true,
        // Preserve the original request URL (including /phone prefix)
        // because when mounted with app.use('/phone', ...) Express strips
        // the mount path from req.url — Vite expects to see /phone/* paths
        // because it's configured with base '/phone/'. Using a function
        // lets us forward the true original path.
        pathRewrite: (pathReq, req) => {
          const anyReq = req as any;
          return (anyReq && anyReq.originalUrl) || pathReq;
        },
      }),
    );

    // TV UI → Vite (port 5173)
    app.use(
      "/",
      createProxyMiddleware({
        target: tvTarget,
        changeOrigin: true,
        ws: true,
      }),
    );
  } else {
    // Production: serve static builds
    if (fs.existsSync(phonePath)) {
      app.use("/phone", express.static(phonePath));
      logger.info(`Serving phone frontend from ${phonePath}`);
    } else {
      logger.warn(`Phone frontend not found at ${phonePath}`);
    }

    if (fs.existsSync(frontendPath)) {
      app.use(express.static(frontendPath));
      logger.info(`Serving TV UI from ${frontendPath}`);
    } else {
      logger.warn(
        "Frontend build not found, please build couch-console and copy to ./frontend-build",
      );
    }

    // SPA fallback for phone deep links
    app.get("/phone/*", (req, res) => {
      const phoneIndex = path.join(phonePath, "index.html");
      if (fs.existsSync(phoneIndex)) {
        res.sendFile(phoneIndex);
      } else {
        res.status(404).send("Phone app not found");
      }
    });

    // SPA fallback for TV UI
    app.get("*", (req, res) => {
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
  }

  const wss = initWebSocketServer(server);
  setWss(wss);

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
