import { Player, Action } from '../models/types';
import { settingsService } from './SettingsService';
import logger from '../utils/logger';

const BOUNDS = { x: 12, z: 8 };
const COLLISION_RADIUS = 0.75;
const ACC = 0.025;
const FRIC = 0.94;

class LobbySyncService {
  private players: Map<string, Player> = new Map();
  private subscribers: ((players: Player[], meta?: any) => void)[] = [];
  private interval: NodeJS.Timeout | null = null;

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => this.update(), 1000 / 20);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  addPlayer(player: Player) {
    player.pos = { x: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 5 };
    player.vel = { x: 0, z: 0 };
    this.players.set(player.id, player);
    this.broadcast();
  }

  removePlayer(id: string) {
    this.players.delete(id);
    this.broadcast();
  }

  handleAction(action: Action) {
    if (action.type === 'move') {
      const player = this.players.get(action.playerId);
      if (player) {
        const force = { x: action.dx, z: action.dy };
        const ax = force.x * ACC;
        const az = force.z * ACC;
        player.vel.x = (player.vel.x + ax) * FRIC;
        player.vel.z = (player.vel.z + az) * FRIC;
      }
    } else if (action.type === 'jump') {
      this.broadcastEmote(action.playerId, 'jump');
    } else if (action.type === 'emote') {
      this.broadcastEmote(action.playerId, action.emote);
    }
  }

  private update() {
    for (const player of this.players.values()) {
      player.pos.x += player.vel.x;
      player.pos.z += player.vel.z;
    }

    const playerList = Array.from(this.players.values());
    for (let i = 0; i < playerList.length; i++) {
      for (let j = i + 1; j < playerList.length; j++) {
        const a = playerList[i];
        const b = playerList[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const dist = Math.hypot(dx, dz);
        const minDist = COLLISION_RADIUS * 2;
        if (dist < minDist && dist > 0.001) {
          const angle = Math.atan2(dz, dx);
          const overlap = minDist - dist;
          const cx = Math.cos(angle) * (overlap / 2);
          const cz = Math.sin(angle) * (overlap / 2);
          a.pos.x -= cx; a.pos.z -= cz;
          b.pos.x += cx; b.pos.z += cz;
          const nx = dx / dist, nz = dz / dist;
          const imp = (a.vel.x * nx + a.vel.z * nz) - (b.vel.x * nx + b.vel.z * nz);
          a.vel.x -= imp * nx * 0.78;
          a.vel.z -= imp * nz * 0.78;
          b.vel.x += imp * nx * 0.78;
          b.vel.z += imp * nz * 0.78;
        }
      }
    }

    for (const player of this.players.values()) {
      if (player.pos.x > BOUNDS.x) { player.pos.x = BOUNDS.x; player.vel.x *= -0.5; }
      if (player.pos.x < -BOUNDS.x) { player.pos.x = -BOUNDS.x; player.vel.x *= -0.5; }
      if (player.pos.z > BOUNDS.z) { player.pos.z = BOUNDS.z; player.vel.z *= -0.5; }
      if (player.pos.z < -BOUNDS.z) { player.pos.z = -BOUNDS.z; player.vel.z *= -0.5; }
    }

    this.broadcast();
  }

  private broadcast() {
    const playersArray = Array.from(this.players.values());
    this.subscribers.forEach(fn => fn(playersArray));
  }

  private broadcastEmote(playerId: string, emote: string) {
    this.subscribers.forEach(fn => fn(Array.from(this.players.values()), { type: 'emote', playerId, emote }));
  }

  subscribe(fn: (players: Player[], meta?: any) => void) {
    this.subscribers.push(fn);
    fn(Array.from(this.players.values()));
    return () => { this.subscribers = this.subscribers.filter(f => f !== fn); };
  }
}

export const lobbySync = new LobbySyncService();
