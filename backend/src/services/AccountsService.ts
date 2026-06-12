import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { CONFIG_DIR } from "../config/constants";
import logger from "../utils/logger";

// Lightweight local "accounts" — gamertags with a color, an icon, simple
// lifetime stats and a short activity history. NOT real authentication; it's
// just identity + flavor for the couch. Persisted to config/accounts.json.

export interface AccountStats {
  appsLaunched: number;
  videosQueued: number;
  jumps: number;
}

export interface AccountHistoryItem {
  type: string; // "app" | "queue" | …
  label: string;
  at: number; // epoch ms
}

export interface Account {
  id: string;
  gamertag: string;
  colorHex: string;
  icon: string; // lucide name or image path/URL
  createdAt: number;
  stats: AccountStats;
  history: AccountHistoryItem[];
}

export interface AccountsState {
  accounts: Account[];
  activeId: string | null;
}

const ACCOUNTS_FILE = path.join(CONFIG_DIR, "accounts.json");
const HISTORY_CAP = 30;

class AccountsService {
  private state: AccountsState = { accounts: [], activeId: null };
  private subscribers: ((s: AccountsState) => void)[] = [];

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(ACCOUNTS_FILE)) {
        const data = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
        if (data && Array.isArray(data.accounts)) {
          this.state = {
            accounts: data.accounts,
            activeId: data.activeId ?? data.accounts[0]?.id ?? null,
          };
        }
      }
    } catch (err) {
      logger.error("Failed to load accounts:", err);
    }
  }

  private save() {
    try {
      if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(this.state, null, 2));
    } catch (err) {
      logger.error("Failed to save accounts:", err);
    }
  }

  private notify() {
    this.subscribers.forEach((fn) => fn(this.state));
  }

  get(): AccountsState {
    return this.state;
  }

  subscribe(fn: (s: AccountsState) => void) {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((f) => f !== fn);
    };
  }

  create(input: { gamertag?: string; colorHex?: string; icon?: string }) {
    const acc: Account = {
      id: uuidv4(),
      gamertag: (input.gamertag || "Player").slice(0, 24),
      colorHex: input.colorHex || "#6366f1",
      icon: input.icon || "User",
      createdAt: Date.now(),
      stats: { appsLaunched: 0, videosQueued: 0, jumps: 0 },
      history: [],
    };
    this.state.accounts.push(acc);
    if (!this.state.activeId) this.state.activeId = acc.id;
    this.save();
    this.notify();
    return acc;
  }

  update(id: string, patch: Partial<Pick<Account, "gamertag" | "colorHex" | "icon">>) {
    const acc = this.state.accounts.find((a) => a.id === id);
    if (!acc) return false;
    if (typeof patch.gamertag === "string") acc.gamertag = patch.gamertag.slice(0, 24);
    if (typeof patch.colorHex === "string") acc.colorHex = patch.colorHex;
    if (typeof patch.icon === "string") acc.icon = patch.icon;
    this.save();
    this.notify();
    return true;
  }

  remove(id: string) {
    const before = this.state.accounts.length;
    this.state.accounts = this.state.accounts.filter((a) => a.id !== id);
    if (this.state.activeId === id) {
      this.state.activeId = this.state.accounts[0]?.id ?? null;
    }
    if (this.state.accounts.length !== before) {
      this.save();
      this.notify();
      return true;
    }
    return false;
  }

  setActive(id: string | null) {
    if (id !== null && !this.state.accounts.some((a) => a.id === id)) return false;
    this.state.activeId = id;
    this.save();
    this.notify();
    return true;
  }

  /** Record an event against the active account. `app`/`queue` add a history
   *  row; `jump` only bumps the counter (too frequent for history). */
  record(type: "app" | "queue" | "jump", label = "") {
    const acc = this.state.accounts.find((a) => a.id === this.state.activeId);
    if (!acc) return; // nobody's "playing as" anyone yet — silently ignore

    if (type === "app") acc.stats.appsLaunched++;
    else if (type === "queue") acc.stats.videosQueued++;
    else if (type === "jump") acc.stats.jumps++;

    if (type !== "jump") {
      acc.history.unshift({ type, label, at: Date.now() });
      if (acc.history.length > HISTORY_CAP) acc.history.length = HISTORY_CAP;
    }
    this.save();
    this.notify();
  }
}

export const accountsService = new AccountsService();
