import { Action } from "../models/types";
import { settingsService } from "./SettingsService";

export type InputPacket = {
  playerId: string;
  buttons: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    a: boolean;
    b: boolean;
    x: boolean;
    y: boolean;
    start: boolean;
    select: boolean;
  };
  analog: { x: number; y: number };
};

type Ownership = { ownerId: string; expiresAt: number; priority?: number };

class InputService {
  private currentFocus: "menu" | "lobby" | "fullscreen" = "menu";
  private ownership = new Map<string, Ownership>();
  private ownershipListeners: ((
    target: string,
    owner: Ownership | null,
  ) => void)[] = [];

  constructor() {
    setInterval(() => this.cleanupExpired(), 1000);
  }

  setFocus(focus: typeof this.currentFocus) {
    this.currentFocus = focus;
  }

  // Claim control for a target (e.g., 'menu', 'fullscreen', 'app:xyz')
  claim(playerId: string, target: string, ttl = 30000, priority = 0) {
    const now = Date.now();
    const existing = this.ownership.get(target);
    if (existing && existing.ownerId !== playerId) {
      // respect priority header: only higher priority can steal
      if ((existing.priority || 0) > priority)
        return { ok: false, owner: existing };
    }
    const entry: Ownership = {
      ownerId: playerId,
      expiresAt: now + ttl,
      priority,
    };
    this.ownership.set(target, entry);
    this.emitOwnershipUpdate(target, entry);
    return { ok: true, owner: entry };
  }

  release(playerId: string, target: string) {
    const existing = this.ownership.get(target);
    if (!existing) return { ok: false };
    if (existing.ownerId !== playerId) return { ok: false };
    this.ownership.delete(target);
    this.emitOwnershipUpdate(target, null);
    return { ok: true };
  }

  heartbeat(playerId: string, target: string, ttl = 30000) {
    const existing = this.ownership.get(target);
    if (!existing) return { ok: false };
    if (existing.ownerId !== playerId) return { ok: false };
    existing.expiresAt = Date.now() + ttl;
    this.emitOwnershipUpdate(target, existing);
    return { ok: true, owner: existing };
  }

  getOwner(target: string) {
    const existing = this.ownership.get(target);
    if (!existing) return null;
    if (existing.expiresAt < Date.now()) {
      this.ownership.delete(target);
      this.emitOwnershipUpdate(target, null);
      return null;
    }
    return existing;
  }

  canSendInput(playerId: string, target?: string) {
    const t = target || this.currentFocus;
    const owner = this.getOwner(t);
    if (!owner) return true;
    return owner.ownerId === playerId;
  }

  processInput(packet: InputPacket): Action[] {
    const actions: Action[] = [];
    const { playerId, buttons, analog } = packet;
    // Enforce ownership for current focus
    if (!this.canSendInput(playerId)) return actions;

    const deadzone = settingsService.get().input.deadzone;

    let dx = analog.x;
    let dy = analog.y;
    if (Math.abs(dx) < deadzone) dx = 0;
    if (Math.abs(dy) < deadzone) dy = 0;
    if (dx !== 0 || dy !== 0) {
      actions.push({ type: "move", playerId, dx, dy });
    }

    if (this.currentFocus === "menu") {
      if (buttons.up)
        actions.push({ type: "navigate", playerId, direction: "up" });
      if (buttons.down)
        actions.push({ type: "navigate", playerId, direction: "down" });
      if (buttons.left)
        actions.push({ type: "navigate", playerId, direction: "left" });
      if (buttons.right)
        actions.push({ type: "navigate", playerId, direction: "right" });
      if (buttons.a) actions.push({ type: "confirm", playerId });
      if (buttons.b) actions.push({ type: "back", playerId });
      if (buttons.start) actions.push({ type: "home", playerId });
    } else if (this.currentFocus === "lobby") {
      if (buttons.a) actions.push({ type: "jump", playerId });
      if (buttons.x) actions.push({ type: "emote", playerId, emote: "wave" });
      if (buttons.y) actions.push({ type: "emote", playerId, emote: "hype" });
    } else if (this.currentFocus === "fullscreen") {
      actions.push({ type: "gamepad_input", playerId, buttons, analog });
    }

    return actions;
  }

  private cleanupExpired() {
    const now = Date.now();
    for (const [target, entry] of Array.from(this.ownership.entries())) {
      if (entry.expiresAt < now) {
        this.ownership.delete(target);
        this.emitOwnershipUpdate(target, null);
      }
    }
  }

  subscribeOwnership(fn: (target: string, owner: Ownership | null) => void) {
    this.ownershipListeners.push(fn);
    return () => {
      this.ownershipListeners = this.ownershipListeners.filter((f) => f !== fn);
    };
  }

  private emitOwnershipUpdate(target: string, owner: Ownership | null) {
    this.ownershipListeners.forEach((fn) => fn(target, owner));
  }
}

export const inputService = new InputService();
