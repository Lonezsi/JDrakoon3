import os from "os";
import fs from "fs";
import path from "path";
import https from "https";
import { spawn } from "child_process";
import fetch from "node-fetch";
import logger from "../utils/logger";

// ---------------------------------------------------------------
// Tracks connectivity + update availability, and applies updates at runtime.
//
// Why this exists:
//  • The console can run for days without restarting, so the launcher's
//    startup-only auto-update never fires — updates must also be checkable +
//    appliable while running.
//  • The old /api/update was git+npm based: impossible in the packaged release
//    (no git, no source, no npm) and gated behind a secret. This replaces it
//    with the launcher's approach — download the latest Setup.exe and run it
//    silently; the installer swaps files and relaunches.
//  • The UI needs a live offline/online signal (hide the phone QR when there's
//    no LAN, show "offline", recover automatically).
//
// Connectivity is probed against a lightweight 204 endpoint (not the GitHub
// API, which is rate-limited to 60 req/hr); the GitHub release check runs at
// most every 15 min while online.
// ---------------------------------------------------------------

const REPO = "Lonezsi/JDrakoon3";
// Use the releases LIST, not /releases/latest: the latter only returns full
// (non-prerelease) releases and 404s when every release is a pre-release —
// which is exactly the case for this Alpha. We take the highest version among
// non-draft releases, pre-releases included.
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases`;
// Several captive-portal / connectivity probes — online = ANY reachable, so a
// single blocked host (region, corporate proxy) doesn't read as offline.
const CONNECTIVITY_URLS = [
  "https://www.gstatic.com/generate_204",
  "https://www.msftconnecttest.com/connecttest.txt",
  "https://captive.apple.com/hotspot-detect.html",
];
const TICK_ONLINE_MS = 10000; // re-probe connectivity this often when online
const TICK_OFFLINE_MS = 2500; // …and more eagerly while offline (fast recovery)
const UPDATE_CHECK_MS = 15 * 60 * 1000;

export interface SystemStatus {
  version: string;
  lan: boolean;
  lanIp: string | null;
  online: boolean;
  updateAvailable: boolean;
  latestVersion: string | null;
  applying: boolean;
}

const VIRTUAL = ["virtual", "hyper-v", "wsl", "docker", "vbox", "vmware", "vethernet", "utun", "lo"];
const PREFERRED = ["wi-fi", "wlan", "ethernet", "eth", "en0", "en"];

class SystemStatusService {
  private online = false;
  private updateAvailable = false;
  private latestVersion: string | null = null;
  private applying = false;
  private lastUpdateCheck = 0;
  private timer: NodeJS.Timeout | null = null;

  start() {
    if (this.timer) return;
    this.tick();
  }

  private schedule() {
    this.timer = setTimeout(
      () => this.tick(),
      this.online ? TICK_ONLINE_MS : TICK_OFFLINE_MS,
    );
  }

  private async tick() {
    const wasOnline = this.online;
    this.online = await this.probeOnline();
    // Check GitHub for a newer release on first connect, on reconnect, or on a
    // long interval — never while offline, never faster than the rate limit.
    if (
      this.online &&
      (!wasOnline || Date.now() - this.lastUpdateCheck > UPDATE_CHECK_MS)
    ) {
      this.checkUpdate();
    }
    this.schedule();
  }

  private probeOnline(): Promise<boolean> {
    const tryOne = (url: string) =>
      new Promise<boolean>((resolve) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        fetch(url, { signal: ctrl.signal as any })
          .then((r) => {
            clearTimeout(t);
            resolve(r.status === 204 || r.ok);
          })
          .catch(() => {
            clearTimeout(t);
            resolve(false);
          });
      });
    return Promise.all(CONNECTIVITY_URLS.map(tryOne)).then((rs) =>
      rs.some(Boolean),
    );
  }

  private async checkUpdate() {
    this.lastUpdateCheck = Date.now();
    try {
      const newest = await this.fetchNewestRelease();
      if (!newest) return;
      this.latestVersion = newest.tag;
      this.updateAvailable = this.isNewer(newest.tag, this.version());
      if (this.updateAvailable)
        logger.info(`[update] newer release available: ${newest.tag} (have ${this.version()})`);
    } catch {
      /* offline / rate-limited — keep the previous result */
    }
  }

  /** Newest non-draft release (pre-releases included), with its Setup.exe asset. */
  private async fetchNewestRelease(): Promise<{ tag: string; assetUrl: string | null } | null> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(RELEASES_API, {
      headers: { "User-Agent": "JDrakoon3-Updater", Accept: "application/vnd.github+json" },
      signal: ctrl.signal as any,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const list: any[] = await r.json();
    const rels = (list || []).filter((x) => x && !x.draft);
    if (!rels.length) return null;
    rels.sort((a, b) =>
      this.cmpVer(
        String(b.tag_name || "").replace(/^v/i, ""),
        String(a.tag_name || "").replace(/^v/i, ""),
      ),
    );
    const top = rels[0];
    const asset = (top.assets || []).find((a: any) => {
      const n = String(a.name || "").toLowerCase();
      return n.endsWith(".exe") && n.includes("setup");
    });
    return {
      tag: String(top.tag_name || "").replace(/^v/i, "").trim(),
      assetUrl: asset?.browser_download_url || null,
    };
  }

  version(): string {
    for (const p of [
      path.join(process.cwd(), "..", "VERSION"),
      path.join(process.cwd(), "VERSION"),
    ]) {
      try {
        const v = fs.readFileSync(p, "utf-8").trim();
        if (v) return v;
      } catch {}
    }
    return "0.0.0";
  }

  private cmpVer(a: string, b: string): number {
    const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
    const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0;
      const y = pb[i] || 0;
      if (x !== y) return x - y;
    }
    return 0;
  }

  private isNewer(remote: string, current: string): boolean {
    if (current === "0.0.0") return false; // dev build — never auto-update
    return this.cmpVer(remote, current) > 0;
  }

  private lan(): { lan: boolean; lanIp: string | null } {
    const nets = os.networkInterfaces();
    const candidates: { address: string; iface: string }[] = [];
    for (const [name, details] of Object.entries(nets)) {
      if (!details) continue;
      for (const net of details) {
        if (net.family === "IPv4" && !net.internal)
          candidates.push({ address: net.address, iface: name });
      }
    }
    const physical = candidates.filter(
      (c) => !VIRTUAL.some((k) => c.iface.toLowerCase().includes(k)),
    );
    const preferred = physical.filter((c) =>
      PREFERRED.some((k) => c.iface.toLowerCase().includes(k)),
    );
    const ip =
      preferred[0]?.address || physical[0]?.address || candidates[0]?.address || null;
    return { lan: !!ip, lanIp: ip };
  }

  get(): SystemStatus {
    const { lan, lanIp } = this.lan();
    return {
      version: this.version(),
      lan,
      lanIp,
      online: this.online,
      updateAvailable: this.updateAvailable,
      latestVersion: this.latestVersion,
      applying: this.applying,
    };
  }

  /** Download the latest Setup.exe and run it silently; the installer swaps
   *  files and relaunches. Windows only (the installer is Windows). */
  async applyUpdate(): Promise<{ ok: boolean; error?: string }> {
    if (process.platform !== "win32")
      return { ok: false, error: "manual_update_required" };
    if (this.applying) return { ok: false, error: "already_applying" };
    this.applying = true;
    try {
      const newest = await this.fetchNewestRelease();
      if (!newest?.assetUrl) throw new Error("no Setup.exe asset in newest release");

      const dst = path.join(os.tmpdir(), "JDrakoon3-Setup.exe");
      await this.download(newest.assetUrl, dst);
      logger.info(`[update] downloaded ${newest.assetUrl} → ${dst}, launching silently`);

      // Run AFTER a short delay so any file lock clears; installer relaunches us.
      spawn(
        "cmd.exe",
        ["/c", `timeout /t 2 /nobreak >nul & "${dst}" /VERYSILENT /NORESTART`],
        { detached: true, stdio: "ignore", windowsHide: true },
      ).unref();
      return { ok: true };
    } catch (e) {
      this.applying = false;
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("[update] apply failed:", msg);
      return { ok: false, error: msg };
    }
  }

  private download(url: string, dst: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const go = (u: string, depth: number) => {
        if (depth > 5) return reject(new Error("too many redirects"));
        https
          .get(u, { headers: { "User-Agent": "JDrakoon3-Updater" } }, (res) => {
            if (
              (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) &&
              res.headers.location
            ) {
              res.resume();
              return go(res.headers.location, depth + 1);
            }
            if (res.statusCode !== 200)
              return reject(new Error(`download ${res.statusCode}`));
            const file = fs.createWriteStream(dst);
            res.pipe(file);
            file.on("finish", () => file.close(() => resolve()));
            file.on("error", reject);
          })
          .on("error", reject);
      };
      go(url, 0);
    });
  }
}

export const systemStatus = new SystemStatusService();
