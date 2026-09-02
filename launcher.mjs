// ──────────────────────────────────────────────────────────────────────────
//  JDrakoon3 launcher — macOS / Linux (the cross-platform counterpart to
//  launcher.cs, which stays the Windows path with its WebView2 host).
//
//  Pure Node, zero deps. Mirrors the proven Windows lifecycle:
//    1. free port 3001 (best-effort),
//    2. start the prebuilt backend with THIS node (hidden, logged),
//    3. wait for it to answer,
//    4. open a Chromium-family browser in --kiosk fullscreen (own profile),
//    5. shut down when EITHER the kiosk closes OR the backend exits.
//
//  Run:  node launcher.mjs        (needs Node 18+ and a Chromium browser;
//                                   falls back to the default browser, no kiosk)
// ──────────────────────────────────────────────────────────────────────────
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const PORT = 3001;
const BASEURL = `http://127.0.0.1:${PORT}`;
const ROOT = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = join(ROOT, "backend");
const IS_MAC = process.platform === "darwin";

const DATA_DIR = join(homedir(), ".jdrakoon3");
mkdirSync(DATA_DIR, { recursive: true });
const LOG = join(DATA_DIR, "launcher.log");
const BACKEND_LOG = join(DATA_DIR, "backend.log");
const PROFILE = join(DATA_DIR, "browser-profile");

const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}\n`;
  try { appendFileSync(LOG, line); } catch {}
  process.stdout.write(line);
};

let backend = null;
let kiosk = null;
let shuttingDown = false;

// ── free the port (best-effort; the backend would fail to bind otherwise) ──
function killPort() {
  try {
    // lsof is on macOS and most Linux; ignore if absent.
    const pids = execSync(`lsof -ti tcp:${PORT}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .split(/\s+/)
      .filter(Boolean);
    for (const pid of pids) {
      try { process.kill(Number(pid), "SIGKILL"); log(`Freed port ${PORT} (pid ${pid})`); } catch {}
    }
  } catch { /* nothing listening, or lsof missing */ }
}

// ── start the backend with the same node that's running this launcher ──────
function startBackend() {
  const entry = join(BACKEND_DIR, "dist", "index.js");
  if (!existsSync(entry)) {
    log(`FATAL: ${entry} missing — run the build first.`);
    process.exit(1);
  }
  const out = openSync(BACKEND_LOG, "w");
  log(`Starting backend with ${process.execPath}`);
  backend = spawn(process.execPath, ["dist/index.js"], {
    cwd: BACKEND_DIR,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", out, out],
  });
  backend.on("exit", (code) => {
    log(`Backend exited (${code}).`);
    if (!shuttingDown) cleanup(0);
  });
}

// ── poll until the backend answers ─────────────────────────────────────────
function waitForBackend(tries = 60) {
  return new Promise((resolve) => {
    const attempt = (n) => {
      if (n <= 0) return resolve(false);
      const req = http.get(`${BASEURL}/api/version`, (res) => {
        res.resume();
        res.statusCode < 500 ? resolve(true) : retry(n);
      });
      req.on("error", () => retry(n));
      req.setTimeout(1500, () => { req.destroy(); retry(n); });
    };
    const retry = (n) => setTimeout(() => attempt(n - 1), 500);
    attempt(tries);
  });
}

// ── find a Chromium-family browser for true kiosk mode ─────────────────────
function findBrowser() {
  if (IS_MAC) {
    const apps = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
    return apps.find((p) => existsSync(p)) || null;
  }
  for (const cmd of [
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
    "microsoft-edge", "microsoft-edge-stable", "brave-browser",
  ]) {
    try {
      const p = execSync(`command -v ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      if (p) return p;
    } catch {}
  }
  return null;
}

function launchKiosk() {
  const browser = findBrowser();
  if (!browser) {
    log("No Chromium browser found — opening default browser (no kiosk).");
    const opener = IS_MAC ? "open" : "xdg-open";
    try { spawn(opener, [BASEURL], { detached: true, stdio: "ignore" }).unref(); }
    catch (e) { log(`default browser failed: ${e.message}`); }
    return;
  }
  log(`Opening kiosk: ${browser}`);
  kiosk = spawn(
    browser,
    [
      "--kiosk", BASEURL,
      "--no-first-run", "--no-default-browser-check",
      "--disable-session-crashed-bubble", "--noerrdialogs",
      `--user-data-dir=${PROFILE}`,
    ],
    { stdio: "ignore" },
  );
  kiosk.on("exit", () => { log("Kiosk closed."); if (!shuttingDown) cleanup(0); });
}

function cleanup(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("Shutting down.");
  try { if (kiosk && kiosk.exitCode === null) kiosk.kill("SIGTERM"); } catch {}
  try { if (backend && backend.exitCode === null) backend.kill("SIGTERM"); } catch {}
  killPort();
  log("Done.");
  process.exit(code);
}

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));

// ── main ────────────────────────────────────────────────────────────────────
log(`Launching from ${ROOT}`);
killPort();
startBackend();
const up = await waitForBackend();
if (!up) {
  log("Backend never answered.");
  cleanup(1);
} else {
  launchKiosk();
}
