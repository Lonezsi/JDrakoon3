import { useEffect } from "react";
import { inputManager } from "../systems/input/inputManager";
import { playerManager } from "../systems/player/playerManager";
import { physicsTick } from "../systems/physics/physicsSystem";
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

export function useGameLoop() {
  useEffect(() => {
    const unsub = inputManager.onActions((actions) => {
      playerManager.handleActions(actions);
      const updated = physicsTick(playerManager.players, actions);
      playerManager.players = updated;
      emitChange();
    });
    return unsub;
  }, []);

  const subscribe = (callback: () => void) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  };
  const getSnapshot = () => snapshot;
  return { players: snapshot.players, count: snapshot.count };
}
