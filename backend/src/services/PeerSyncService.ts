import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import crypto from "crypto";
import { settingsService } from "./SettingsService";
import { accountsService } from "./AccountsService";
import logger from "../utils/logger";

// Two consoles "sync" by agreeing on a shared **sync code** (our lightweight
// stand-in for an online account — there is no central server) and one dialing
// the other's address. Once linked they exchange app libraries + the active
// account, and forward input both ways so each sees the other's players. Input
// packets carry a sequence number + checksum; a mismatch triggers a resync.
//
// This is a direct peer link (LAN, or internet with a reachable address / VPN),
// not NAT-traversing P2P — that would need a signalling/relay server.

type Transport = {
  emit: (ev: string, ...args: any[]) => void;
  on: (ev: string, fn: (...args: any[]) => void) => void;
  disconnect?: () => void;
};

export interface PeerApp {
  id: string;
  name: string;
  launcher: string;
}
export interface PeerAccount {
  gamertag: string;
  colorHex: string;
}

type SyncStatus = "disconnected" | "connecting" | "connected" | "error";

function checksum(actions: any[]): string {
  return crypto
    .createHash("md5")
    .update(JSON.stringify(actions))
    .digest("hex")
    .slice(0, 8);
}

class PeerSyncService {
  private status: SyncStatus = "disconnected";
  private role: "host" | "peer" | null = null;
  private code = "";
  private remoteUrl = "";
  private client: ClientSocket | null = null;
  private peer: Transport | null = null;
  private peerApps: PeerApp[] = [];
  private peerAccount: PeerAccount | null = null;
  private lastError = "";
  private outSeq = 0;
  private inSeq = -1;
  private subs: (() => void)[] = [];
  private applyRemote: ((actions: any[]) => void) | null = null;

  // ── Config ──────────────────────────────────────────────
  setCode(code: string) {
    this.code = (code || "").trim();
    // Persist so both consoles remember their room across restarts (skip the
    // save if it already matches, e.g. when restoring at boot).
    if (settingsService.get().sync?.code !== this.code) {
      settingsService.update({ sync: { code: this.code } } as any);
    }
    this.notify();
  }
  getCode() {
    return this.code;
  }
  /** Socket layer registers how to apply remote input to the local lobby. */
  onApplyRemote(fn: (actions: any[]) => void) {
    this.applyRemote = fn;
  }

  // ── Local snapshot helpers ──────────────────────────────
  localApps(): PeerApp[] {
    const apps = settingsService.get().apps || {};
    return Object.entries(apps).map(([id, a]) => ({
      id,
      name: (a as any).name || id,
      launcher: (a as any).launcher || "",
    }));
  }
  localAccount(): PeerAccount | null {
    const st = accountsService.get();
    const active = st.accounts.find((a) => a.id === st.activeId);
    return active
      ? { gamertag: active.gamertag, colorHex: active.colorHex }
      : null;
  }

  // ── Client role: dial a host ────────────────────────────
  connect(remoteUrl: string, code: string) {
    this.disconnect();
    this.remoteUrl = (remoteUrl || "").trim();
    this.code = (code || "").trim();
    if (!this.remoteUrl || !this.code) {
      this.lastError = "Need a host address and a sync code";
      this.status = "error";
      this.notify();
      return;
    }
    this.role = "peer";
    this.status = "connecting";
    this.lastError = "";
    this.notify();
    const sock = ioClient(this.remoteUrl, {
      auth: { peer: true, code: this.code },
      reconnection: true,
      timeout: 8000,
      transports: ["websocket", "polling"],
    });
    this.client = sock;
    sock.on("connect", () => {
      this.bindPeer(sock);
      this.status = "connected";
      this.sendHello();
      this.notify();
      logger.info(`[peer] connected to ${this.remoteUrl}`);
    });
    sock.on("peer_rejected", (msg: any) => {
      this.lastError = msg?.reason || "rejected (code mismatch?)";
      this.status = "error";
      this.notify();
    });
    sock.on("connect_error", (e: any) => {
      this.lastError = e?.message || "connect failed";
      this.status = "error";
      this.notify();
    });
    sock.on("disconnect", () => {
      this.peer = null;
      if (this.status === "connected") this.status = "disconnected";
      this.notify();
    });
  }

  // ── Host role: a peer connected to us ───────────────────
  attachIncomingPeer(socket: Transport) {
    this.role = "host";
    this.bindPeer(socket);
    this.status = "connected";
    this.lastError = "";
    this.sendHello();
    this.notify();
    logger.info("[peer] incoming peer linked");
    socket.on("disconnect", () => {
      if (this.peer === socket) {
        this.peer = null;
        this.status = "disconnected";
        this.notify();
      }
    });
  }

  private bindPeer(p: Transport) {
    this.peer = p;
    p.on("peer_hello", (data: any) => {
      this.peerApps = Array.isArray(data?.apps) ? data.apps : [];
      this.peerAccount = data?.account || null;
      this.notify();
    });
    p.on("peer_input", (pkt: any) => {
      if (!pkt || typeof pkt.seq !== "number") return;
      const actions = Array.isArray(pkt.actions) ? pkt.actions : [];
      if (checksum(actions) !== pkt.checksum) {
        logger.warn("[peer] input checksum mismatch — requesting resync");
        this.peer?.emit("peer_resync");
        return;
      }
      // Out-of-order / replayed packets are dropped (basic history check).
      if (pkt.seq <= this.inSeq) return;
      this.inSeq = pkt.seq;
      this.applyRemote?.(actions);
    });
    p.on("peer_resync", () => this.sendHello());
  }

  private sendHello() {
    this.peer?.emit("peer_hello", {
      apps: this.localApps(),
      account: this.localAccount(),
    });
  }

  /** Forward local input to the peer (seq + checksum for the receiver to
   *  verify). Only lobby/cube actions cross the link — never menu navigation,
   *  so a peer can't drive your dashboard. Skips peer-origin actions (no echo). */
  forwardInput(actions: any[]) {
    if (this.status !== "connected" || !this.peer) return;
    const LOBBY = new Set(["move", "jump", "slam", "spin"]);
    const own = actions.filter(
      (a) =>
        LOBBY.has(a?.type) &&
        !(typeof a?.playerId === "string" && a.playerId.startsWith("peer:")),
    );
    if (!own.length) return;
    this.outSeq++;
    this.peer.emit("peer_input", {
      seq: this.outSeq,
      checksum: checksum(own),
      actions: own,
    });
  }

  disconnect() {
    try {
      this.client?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.peer?.disconnect?.();
    } catch {
      /* ignore */
    }
    this.client = null;
    this.peer = null;
    this.peerApps = [];
    this.peerAccount = null;
    this.outSeq = 0;
    this.inSeq = -1;
    if (this.status !== "error") this.status = "disconnected";
    this.role = null;
    this.notify();
  }

  // ── Status (for the console UI) ─────────────────────────
  getStatus() {
    const mine = this.localApps();
    const norm = (a: PeerApp) => (a.name || "").toLowerCase().trim();
    const theirNames = new Set(this.peerApps.map(norm));
    return {
      status: this.status,
      role: this.role,
      code: this.code,
      remoteUrl: this.remoteUrl,
      error: this.lastError,
      peerAccount: this.peerAccount,
      // Common apps are selectable on both; the rest greyed out / unselectable.
      apps: mine.map((a) => ({ ...a, shared: theirNames.has(norm(a)) })),
    };
  }

  subscribe(fn: () => void) {
    this.subs.push(fn);
    return () => {
      this.subs = this.subs.filter((s) => s !== fn);
    };
  }
  private notify() {
    this.subs.forEach((s) => s());
  }
}

export const peerSync = new PeerSyncService();
