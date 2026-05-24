import { playerManager } from "../systems/player/playerManager";
import type { Player } from "../shared/types";

let snapshot: { players: Player[]; count: number } = {
  players: [],
  count: 0,
};
const listeners = new Set<() => void>();

function emitChange() {
  snapshot = {
    players: [...playerManager.players],
    count: playerManager.players.length,
  };
  listeners.forEach((l) => l());
}

export { emitChange };

export function useGameLoop() {
  const subscribe = (callback: () => void) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  };
  const getSnapshot = () => snapshot;
  return { players: snapshot.players, count: snapshot.count };
}
