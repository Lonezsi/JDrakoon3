const MOCK_STATE = {
  currentApp: 'home',
  currentScreen: 'HOME',
  mediaState: {
    playing: false,
    current: null,
    queue: [],
    volume: 72,
    muted: false,
    progress: 0,
    loop: false,
    shuffle: false,
  },
  connectedPlayers: [],
  fullscreen: false,
};

let listeners = [];

export function connect(url) {
  return {
    subscribe(fn) {
      listeners.push(fn);
      fn(MOCK_STATE);
      return () => { listeners = listeners.filter(l => l !== fn); };
    },
    sendAction: (action) => {
      console.log('[WebSocket]', action);
    },
    disconnect() {},
  };
}
