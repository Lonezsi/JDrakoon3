import type { Player, DeviceAction } from "../../shared/types";

const PLAYER_COLORS: Record<string, string> = {
  p1: "#6366f1",
  p2: "#ec4899",
};

class PlayerManager {
  players: Player[] = [];
  private subscribers: Set<(p: Player[]) => void> = new Set();

  handleActions(actions: DeviceAction[]) {
    // No longer needed for movement, but keep for future logic
  }

  addPlayer(player: Player) {
    if (this.players.find((p) => p.id === player.id)) return;
    this.players = [...this.players, player];
    this.subscribers.forEach((fn) => fn(this.players));
  }

  removePlayer(id: string) {
    this.players = this.players.filter((p) => p.id !== id);
    this.subscribers.forEach((fn) => fn(this.players));
  }

  subscribe(fn: (p: Player[]) => void) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

export const playerManager = new PlayerManager();
