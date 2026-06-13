import "dotenv/config";
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
import { accountsService } from "./services/AccountsService";
import { PORT, CACHE_DIR, CONFIG_DIR } from "./config/constants";
import {
  readRunningFile,
  isPidAlive as rfIsPidAlive,
  removeRunningFile,
  validateRunningFileStartup,
  isProcessNameRunning,
} from "./services/RunningFile";
import logger from "./utils/logger";
import fs from "fs";
import fg from "fast-glob";
import { inputService } from "./services/InputService";
import { broadcast } from "./websocket/broadcast";
import { authService } from "./services/AuthService";
import { createProxyMiddleware } from "http-proxy-middleware";
import { exec, execSync } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

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

  // Forward unhandled errors to all connected clients
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception:", err);
    try {
      broadcast("error", { message: err.message });
    } catch {}
  });

  process.on("unhandledRejection", (reason: any) => {
    logger.error("Unhandled rejection:", reason);
    try {
      broadcast("error", { message: reason?.message || String(reason) });
    } catch {}
  });

  // ── API routes (must come before proxies / static) ──────────

  app.get("/api/version", (req, res) => {
    try {
      const version = fs
        .readFileSync(path.join(process.cwd(), "../VERSION"), "utf-8")
        .trim();
      res.json({ version });
    } catch {
      res.json({ version: "0.0.0" });
    }
  });

  // Serve cached thumbnails and video files under /cache
  app.use("/cache", express.static(CACHE_DIR));

  app.get("/api/settings", (req, res) => {
    res.json(settingsService.get());
  });

  // Get default settings values
  app.get("/api/settings/defaults", (req, res) => {
    res.json(settingsService.getDefaults());
  });

  // Partial update settings
  app.patch("/api/settings", express.json(), async (req, res) => {
    try {
      const partial = req.body;
      if (typeof partial !== "object" || partial === null) {
        return res.status(400).json({ ok: false, error: "invalid body" });
      }
      delete partial._descriptions; // don't let the client overwrite descriptions
      await settingsService.update(partial);
      res.json({ ok: true, settings: settingsService.get() });
    } catch (err) {
      logger.error("Failed to update settings:", err);
      res.status(500).json({ ok: false, error: "update_failed" });
    }
  });

  // Delete an app tile (deep-merge PATCH can't remove keys, so this is explicit)
  app.delete("/api/apps/:id", async (req, res) => {
    try {
      const removed = await settingsService.removeApp(req.params.id);
      res.json({ ok: true, removed, settings: settingsService.get() });
    } catch (err) {
      logger.error("Failed to delete app:", err);
      res.status(500).json({ ok: false, error: "delete_failed" });
    }
  });

  // ── Accounts (local gamertags + stats; not real auth) ──────────────
  app.get("/api/accounts", (req, res) => res.json(accountsService.get()));

  app.post("/api/accounts", express.json(), (req, res) => {
    const acc = accountsService.create(req.body || {});
    res.json({ ok: true, account: acc, state: accountsService.get() });
  });

  app.patch("/api/accounts/:id", express.json(), (req, res) => {
    const ok = accountsService.update(req.params.id, req.body || {});
    res.json({ ok, state: accountsService.get() });
  });

  app.delete("/api/accounts/:id", (req, res) => {
    const ok = accountsService.remove(req.params.id);
    res.json({ ok, state: accountsService.get() });
  });

  app.post("/api/accounts/active", express.json(), (req, res) => {
    const ok = accountsService.setActive(req.body?.id ?? null);
    res.json({ ok, state: accountsService.get() });
  });

  // Map an input device (keyboard slot / gamepad / phone) to an account, so its
  // lobby cube adopts that account's color & gamertag. accountId null clears it.
  app.post("/api/accounts/assign", express.json(), (req, res) => {
    const { deviceId, accountId } = req.body || {};
    const ok = accountsService.assignDevice(deviceId, accountId ?? null);
    res.json({ ok, state: accountsService.get() });
  });

  // ── Auto‑update endpoint ──────────────────────────────────────────
  app.post("/api/update", express.json(), async (req, res) => {
    const { key } = req.body || {};
    const secret = process.env.UPDATE_SECRET;

    // Require a secret to be configured and matched
    if (!secret || key !== secret) {
      logger.warn("Update attempt with invalid or missing secret");
      return res.status(403).json({ ok: false, error: "unauthorized" });
    }

    try {
      // 1. Pull the latest code (assumes the server was cloned from git)
      logger.info("Pulling latest changes from git...");
      await execAsync("git pull origin main", { cwd: process.cwd() });

      // 2. Install backend dependencies (in case package.json changed)
      logger.info("Installing backend dependencies...");
      await execAsync("npm install", { cwd: process.cwd() });

      // 3. Rebuild the TV frontend
      const tvDir = path.join(process.cwd(), "../couch-console");
      if (fs.existsSync(tvDir)) {
        logger.info("Building couch-console...");
        await execAsync("npm install", { cwd: tvDir });
        await execAsync("npm run build", { cwd: tvDir });
        // Copy the build output into frontend-build
        const tvDist = path.join(tvDir, "dist");
        const tvTarget = path.join(process.cwd(), "frontend-build");
        if (fs.existsSync(tvDist)) {
          await execAsync(
            `powershell -Command "Copy-Item -Path '${tvDist}\\*' -Destination '${tvTarget}' -Recurse -Force"`,
          );
          logger.info("TV frontend updated.");
        }
      } else {
        logger.warn("TV frontend folder not found; skipping.");
      }

      // 4. Rebuild the phone frontend
      const phoneDir = path.join(process.cwd(), "../couch-remote");
      if (fs.existsSync(phoneDir)) {
        logger.info("Building couch-remote...");
        await execAsync("npm install", { cwd: phoneDir });
        await execAsync("npm run build", { cwd: phoneDir });
        const phoneDist = path.join(phoneDir, "dist");
        const phoneTarget = path.join(process.cwd(), "frontend-build", "phone");
        if (fs.existsSync(phoneDist)) {
          await execAsync(
            `powershell -Command "Copy-Item -Path '${phoneDist}\\*' -Destination '${phoneTarget}' -Recurse -Force"`,
          );
          logger.info("Phone frontend updated.");
        }
      } else {
        logger.warn("Phone frontend folder not found; skipping.");
      }

      res.json({
        ok: true,
        message:
          "Update applied. Please restart the server or refresh the frontends.",
      });
    } catch (err: any) {
      logger.error("Auto‑update failed:", err);
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  // Dynamic QR code for phone pairing
  app.get("/qr-code", async (req, res) => {
    try {
      const PORT = 3001; // (or use your imported PORT constant)
      let bestIP = req.hostname; // fallback

      // 1. Collect all usable IPv4 addresses
      const nets = os.networkInterfaces();
      const candidates: { address: string; iface: string }[] = [];

      for (const [name, details] of Object.entries(nets)) {
        if (!details) continue;
        for (const net of details) {
          if (net.family === "IPv4" && !net.internal) {
            candidates.push({ address: net.address, iface: name });
          }
        }
      }

      // 2. Filter out known virtual interfaces
      const virtualKeywords = [
        "virtual",
        "hyper-v",
        "wsl",
        "docker",
        "vbox",
        "vmware",
        "vethernet",
        "utun",
        "lo",
      ];
      const physicalCandidates = candidates.filter(
        (c) => !virtualKeywords.some((k) => c.iface.toLowerCase().includes(k)),
      );

      // 3. Prefer Wi‑Fi / Ethernet over other (e.g. Bluetooth PAN)
      const preferredKeywords = [
        "wi-fi",
        "wlan",
        "ethernet",
        "eth",
        "en0",
        "en",
      ];
      const preferred = physicalCandidates.filter((c) =>
        preferredKeywords.some((k) => c.iface.toLowerCase().includes(k)),
      );

      if (preferred.length > 0) {
        bestIP = preferred[0].address;
      } else if (physicalCandidates.length > 0) {
        bestIP = physicalCandidates[0].address;
      } else if (candidates.length > 0) {
        // fallback to any non-internal IP (including virtual)
        bestIP = candidates[0].address;
      }

      logger.info(
        `QR code using IP: ${bestIP} (interface: ${preferred[0]?.iface || physicalCandidates[0]?.iface || candidates[0]?.iface})`,
      );

      const phoneUrl = `http://${bestIP}:${PORT}/phone`;
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
      const players = (lobbySync as any).getPlayers();
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

  function getWifiSSID(): string {
    try {
      logger.debug("Detecting WiFi SSID for platform:", process.platform);
      if (process.platform === "win32") {
        const cmd = `
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new();
    $OutputEncoding = [System.Text.UTF8Encoding]::new();
    (Get-NetConnectionProfile | Where-Object {
      $_.InterfaceAlias -like 'Wi-Fi*'
    }).Name
  `;

        const output = execSync(
          `powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd.replace(/\n/g, "")}"`,
          {
            encoding: "buffer",
            shell: "cmd.exe",
          },
        )
          .toString("utf8")
          .trim();

        return output || "Unknown WiFi";
      } else if (process.platform === "darwin") {
        const output = execSync(
          "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I",
          { encoding: "utf8" },
        );
        const match = output.match(/^\s*SSID:\s*(.+)\s*$/m);
        return match ? match[1].trim() : "Unknown WiFi";
      } else {
        // Linux
        const output = execSync("iwgetid -r", { encoding: "utf8" }).trim();
        return output || "Unknown WiFi";
      }
    } catch (err) {
      return `Unknown WiFi | ${err}`;
    }
  }

  app.get("/api/network-info", (req, res) => {
    res.setHeader("content-type", "application/json; charset=utf-8");
    const ssid = getWifiSSID();
    res.json({ ssid });
  });

  // Serve a local image file as an app icon (the browser can't load
  // file:// paths directly). Validates it's an existing image before streaming.
  app.get("/api/app-icon", (req, res) => {
    const p = String(req.query.path || "");
    const ext = path.extname(p).toLowerCase();
    const types: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".bmp": "image/bmp",
    };
    if (!types[ext] || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
      return res.status(404).end();
    }
    res.setHeader("Content-Type", types[ext]);
    res.setHeader("Cache-Control", "max-age=3600");
    fs.createReadStream(p)
      .on("error", () => res.status(500).end())
      .pipe(res);
  });

  // Resolve a bare exe name (from a browser file drop, where the full path
  // isn't exposed) to an absolute path: PATH lookup first, then a shallow
  // sweep of the usual install locations.
  app.post("/api/apps/resolve", express.json(), async (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name || !/^[\w .()-]+\.exe$/i.test(name)) {
      return res.status(400).json({ ok: false, error: "invalid_name" });
    }

    try {
      const out = execSync(`where "${name}"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split(/\r?\n/)[0]
        ?.trim();
      if (out) return res.json({ ok: true, path: out });
    } catch {}

    const home = os.homedir().replace(/\\/g, "/");
    const roots = [
      "C:/Program Files",
      "C:/Program Files (x86)",
      `${home}/AppData/Local/Programs`,
      `${home}/Desktop`,
    ];
    for (const root of roots) {
      try {
        const hits = await fg(`${root}/**/${name}`, {
          deep: 3,
          absolute: true,
          caseSensitiveMatch: false,
          suppressErrors: true,
        });
        if (hits.length) {
          return res.json({ ok: true, path: hits[0].replace(/\//g, "\\") });
        }
      } catch {}
    }
    res.json({ ok: false, error: "not_found" });
  });

  // List installed apps for the "Add System" picker: Start Menu shortcuts
  // (resolved to their .exe target via WScript.Shell) + scanned Steam games.
  // Cached for the session; pass ?refresh=1 to rescan.
  let installedAppsCache: { name: string; launcher: string }[] | null = null;
  app.get("/api/installed-apps", async (req, res) => {
    if (req.query.refresh) installedAppsCache = null;
    if (installedAppsCache) return res.json({ apps: installedAppsCache });

    const apps: { name: string; launcher: string }[] = [];

    // Steam games from the existing scanner (steam://rungameid/… launchers).
    try {
      for (const e of gameScanner.getLibrary()) {
        if (e.category === "Steam" && e.name) {
          apps.push({ name: e.name, launcher: e.path });
        }
      }
    } catch {}

    // Start Menu .lnk shortcuts (Windows only). Pure-Node glob — no PowerShell
    // subprocess (that proved flaky). Windows launches a .lnk directly, and the
    // launcher resolves the real target, so we just hand back the shortcut path.
    if (process.platform === "win32") {
      const startMenuDirs = [
        path.join(
          process.env.ProgramData || "C:\\ProgramData",
          "Microsoft\\Windows\\Start Menu\\Programs",
        ),
        path.join(
          process.env.APPDATA || "",
          "Microsoft\\Windows\\Start Menu\\Programs",
        ),
      ].filter((d) => d && fs.existsSync(d));

      for (const dir of startMenuDirs) {
        try {
          const lnks = await fg("**/*.lnk", {
            cwd: dir,
            absolute: true,
            deep: 4,
            caseSensitiveMatch: false,
            suppressErrors: true,
          });
          for (const lnk of lnks) {
            const win = lnk.replace(/\//g, "\\");
            const base = path.basename(win, ".lnk");
            if (/uninstall|setup|update|crash|readme|website|help/i.test(base))
              continue;
            apps.push({ name: base, launcher: win });
          }
        } catch (e) {
          logger.warn("installed-apps glob failed:", e);
        }
      }
    }

    // De-dupe by name (machine + per-user Start Menus often both have it).
    const seen = new Set<string>();
    const deduped = apps
      .filter((a) => {
        const k = a.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    installedAppsCache = deduped;
    res.json({ apps: deduped });
  });

  // Lightweight page shown when an app is running (reduces lag)
  app.get("/app-running", (req, res) => {
    res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>App Running</title>
  <style>
    body { background: #04040a; color: #e2e8f0; font-family: 'Segoe UI',system-ui,sans-serif; display:flex; align-items:center; justify-content:center; height:100dvh; margin:0; }
    .box { text-align:center; }
    h1 { font-size:2rem; font-weight:900; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:0.5rem; }
    p { color:#64748b; font-size:0.875rem; }
    button { margin-top:2rem; padding:0.75rem 1.5rem; background:#ef4444; color:white; border:none; border-radius:1rem; font-weight:bold; cursor:pointer; font-size:1rem; }
  </style>
  <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
</head>
<body>
  <div class="box">
    <h1>App is running</h1>
    <p>Press any button on your controller or click below to close it.</p>
    <button onclick="closeApp()">Close App</button>
  </div>
  <script>
    const socket = io(location.origin);
    socket.on("app_closed", () => { window.location.replace("/"); });
    function closeApp() { socket.emit("close_app"); }
    document.addEventListener("keydown", () => { socket.emit("close_app"); });
  </script>
</body>
</html>`);
  });

  // Graceful shutdown – called from TV dashboard
  app.post("/api/shutdown", async (req, res) => {
    res.json({ ok: true, message: "Shutting down..." });

    // Force‑close all TCP connections so Edge doesn't leave leftovers
    try {
      server.close(); // stop accepting new connections
      // Destroy all current sockets
      (server as any).getConnections((err: any, count: number) => {
        if (!err) {
          // This is a bit hacky – we iterate the internal sockets
          const sockets = (server as any)._connections || {};
          for (const key of Object.keys(sockets)) {
            sockets[key].destroy();
          }
        }
      });
    } catch {}

    // Kill Edge via PID file (if present)
    try {
      const pidFile = path.join(process.cwd(), ".edge_pid");
      if (fs.existsSync(pidFile)) {
        const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim());
        if (pid)
          execSync(`taskkill /PID ${pid} /F /T`, {
            encoding: "utf-8",
            stdio: "ignore",
          });
      }
    } catch {}

    // Exit immediately (the script will clean up the process)
    process.exit(0);
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

    // Phone UI → Vite (port 5174) — Rewrite path to include /phone prefix
    app.use(
      "/phone",
      createProxyMiddleware({
        target: phoneTarget,
        changeOrigin: true,
        ws: true,
        pathRewrite: (path, req) => "/phone" + path,
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

  try {
    const startup = validateRunningFileStartup();
    if (startup.existed && !startup.removed) {
      broadcast("mode-change", { mode: "app-running", pid: startup.pid });
    }
  } catch (e) {
    logger.warn("Failed running-file startup check:", e);
  }

  const runningFileWatcher = setInterval(() => {
    try {
      const cur = readRunningFile();
      if (!cur) return;
      if (!cur.pid || !rfIsPidAlive(cur.pid)) {
        // PID is gone. Check by process name as a fallback (handles launchers)
        if (isProcessNameRunning(cur.app)) {
          // Still running by name — keep the running file
          return;
        }
        try {
          removeRunningFile();
        } catch {}
        broadcast("mode-change", { mode: "normal" });
      }
    } catch (err) {
      logger.warn("Running-file watchdog error:", err);
    }
  }, 1000);

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
