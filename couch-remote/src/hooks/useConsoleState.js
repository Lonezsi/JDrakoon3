import { useState, useEffect } from "react";
import { connect } from "../services/socket";

const DEFAULT_STATE = {
  playing: false,
  queue: [],
  volume: 72,
  muted: true,
  progress: 0,
  loop: false,
  shuffle: false,
  currentApp: "Home",
  currentItem: null,
};

let cachedState = { ...DEFAULT_STATE };
const subscriberSet = new Set();

export function useConsoleState() {
  const [state, setState] = useState(cachedState);

  useEffect(() => {
    const connection = connect();
    const unsub = connection.subscribe((newState) => {
      // Normalize incoming events into a stable console state shape so
      // components don't have to handle raw event envelopes.
      if (newState?.type === "queue_updated") {
        const playback = newState.playback || {};
        const queue = newState.queue || [];
        const next = {
          ...cachedState,
          playing: playback.isPlaying ?? cachedState.playing,
          queue,
          volume: playback.volume ?? cachedState.volume,
          muted: playback.muted ?? cachedState.muted,
          progress: playback.position ?? cachedState.progress,
          loop: playback.loop ?? cachedState.loop,
          shuffle: playback.shuffle ?? cachedState.shuffle,
          currentItem: queue[playback.currentIndex ?? 0] ?? null,
        };
        cachedState = next;
        setState(next);
        subscriberSet.forEach((fn) => fn(next));
        return;
      }

      // Fallback: for other event types keep previous normalized shape but
      // expose the raw event under `lastEvent` for components that need it.
      const next = { ...cachedState, lastEvent: newState };
      cachedState = next;
      setState(next);
      subscriberSet.forEach((fn) => fn(next));
    });
    return () => unsub();
  }, []);

  return state;
}

export function onStateChange(fn) {
  subscriberSet.add(fn);
  return () => subscriberSet.delete(fn);
}
