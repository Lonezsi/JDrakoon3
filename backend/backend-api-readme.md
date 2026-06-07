## 📡 Backend (`backend/`) – API & Real‑time Server

### Overview

The backend is an Express (Node.js) server that:

- Serves static frontend builds or proxies to Vite dev servers
- Provides REST endpoints for media streaming, QR‑code pairing, and debug
- Runs a **Socket.IO** server for real‑time lobby, input, and media queue
- Also runs a **raw WebSocket** server at `/ws` for legacy input
- Manages services: lobby physics, video queue, input ownership, game scanning, app launching, and sync

### Configuration

- Port: `3001` (configurable via `PORT` env)
- Cache & config directories inside `backend/cache`, `backend/config`
- Settings stored in `backend/config/settings.json`
- Default settings include display options, media volume/cache, input deadzone, library folders

---

### REST API Endpoints

| Endpoint            | Method | Input                                                        | Output                                                                    | Description                                                                                                 |
| ------------------- | ------ | ------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/qr-code`          | GET    | –                                                            | `{ svg: string, url: string }`                                            | Returns SVG QR code + URL for phone pairing. Prefers physical network adapter IP, filters out virtual ones. |
| `/stream?url=...`   | GET    | query `url` (string, YouTube/Direct media URL)               | Streaming binary (video/audio)                                            | Streams media via yt‑dlp directly to the client.                                                            |
| `/pair`             | POST   | JSON body: `{ meta?: any, ttl?: number, oneTime?: boolean }` | `{ ok: true, token: string, expiresAt: number }`                          | Creates an auth token for secure Socket.IO connection.                                                      |
| `/pair/:token`      | GET    | URL param `token`                                            | `{ ok: true, info: { token, created, expiresAt, meta, oneTime } }` or 404 | Retrieves token info (if still valid).                                                                      |
| `/_debug/lobby`     | GET    | –                                                            | `{ players: Player[] }`                                                   | Returns current lobby players (debug).                                                                      |
| `/pair/qr`          | GET    | –                                                            | SVG image                                                                 | Deprecated; returns QR with a one‑time token.                                                               |
| `/api/network-info` | GET    | –                                                            | `{ ssid: string }`                                                        | Returns current Wi‑Fi SSID (platform‑dependent).                                                            |

---

### Socket.IO Server (`socketio_server.ts`)

**Connection:**

- URL: `http://<host>:3001` (auto‑detected)
- Auth: optional `token` in `socket.handshake.auth` – validated via `AuthService`
- Transports: `websocket`, `polling`

**Rate Limiting:** 30 events/sec per socket (burst 60)

#### Incoming Events (client → server)

| Event             | Payload                                                                                 | Callback Response                                        | Action                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `join`            | `{ name: string, color: string (hex), deviceType: string }`                             | `{ ok: true, playerId: string }`                         | Creates a player, adds to lobby, emits `player_joined`, sends current queue state to this client only.                                                                        |
| `input:event`     | `{ buttons?: { up, down, left, right, a, b, x, y, start, select }, analog?: { x, y } }` | `{ ok: true }`                                           | Processes input through `InputService`, dispatches actions (move, navigate, confirm, etc.) and forwards `action` events to lobby.                                             |
| `queue_add`       | `string` or `{ url: string, requestedBy?: string, pendingId?: string }`                 | `{ ok: true }` or `{ ok: false, error: "..." }`          | Adds video to queue. Server resolves metadata via yt‑dlp, broadcasts `queue_updated`. If `pendingId` is given, failure is sent back as `queue_add_failed` to the same socket. |
| `queue_remove`    | `number` (index) or `{ index: number }`                                                 | `{ ok: true }`                                           | Removes queue item at index.                                                                                                                                                  |
| `queue_move`      | `{ index: number, direction: "up"                                                       | "down" }`                                                | `{ ok: true }`                                                                                                                                                                | Moves queue item. |
| `clear_queue`     | –                                                                                       | `{ ok: true }`                                           | Empties the queue.                                                                                                                                                            |
| `shuffle_queue`   | –                                                                                       | `{ ok: true }`                                           | Shuffles queue.                                                                                                                                                               |
| `loop_toggle`     | –                                                                                       | `{ ok: true }`                                           | Toggles loop mode.                                                                                                                                                            |
| `media_playpause` | –                                                                                       | –                                                        | Toggles playing state.                                                                                                                                                        |
| `media_next`      | –                                                                                       | –                                                        | Advances to next item.                                                                                                                                                        |
| `media_prev`      | –                                                                                       | –                                                        | Goes to previous item.                                                                                                                                                        |
| `media_seek`      | `number` (seconds) or `{ progress: number }`                                            | `{ ok: true }`                                           | Seeks within current track.                                                                                                                                                   |
| `media_volume`    | `number` (0-100) or `{ volume: number }`                                                | `{ ok: true }`                                           | Sets volume (unmutes).                                                                                                                                                        |
| `media_mute`      | –                                                                                       | `{ ok: true }`                                           | Toggles mute.                                                                                                                                                                 |
| `input:claim`     | `{ target: string, ttl?: number, priority?: number }`                                   | `{ ok: boolean, owner?: Ownership }`                     | Claims input ownership for a target (e.g. `"menu"`).                                                                                                                          |
| `input:release`   | `{ target: string }`                                                                    | `{ ok: boolean }`                                        | Releases ownership.                                                                                                                                                           |
| `input:heartbeat` | `{ target: string, ttl?: number }`                                                      | `{ ok: boolean }`                                        | Refreshes ownership timeout.                                                                                                                                                  |
| `resync`          | `{ type: string, since?: number }`                                                      | `{ ok: true, replay: { full, snapshot?, diffs?, seq } }` | Requests replay of events since a given sequence number.                                                                                                                      |

#### Outgoing Events (server → all clients in lobby)

| Event                     | Payload                                                                                            | Description                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------- |
| `lobby_state`             | `{ players: Player[], seq?: number }`                                                              | Full snapshot of lobby players, emitted ~20 Hz.                               |
| `player_joined`           | `Player` object (with `seq`)                                                                       | A new player joined.                                                          |
| `player_left`             | `{ playerId: string }`                                                                             | A player left.                                                                |
| `action`                  | `Action` object (type, playerId, etc.) + `seq`                                                     | An action was performed (move, navigate, confirm, emote, jump, etc.).         |
| `queue_updated`           | `{ queue: QueueItem[], playback: PlaybackState, pendingItems?: PendingQueueItem[], seq?: number }` | Full queue state. Sent after any queue/playback change.                       |
| `input:ownership_updated` | `{ target: string, owner: Ownership                                                                | null, seq? }`                                                                 | Ownership changed for a target. |
| `queue_add_failed`        | `{ pendingId: string, url: string, message: string }`                                              | Sent to the **socket that requested the add** when metadata extraction fails. |

**Data Types:**

```ts
Player {
  id: string;
  name: string;
  color: string;         // hex
  deviceType: "phone" | "gamepad";
  isActive: boolean;
  lastSeen: number;
  pos: { x: number, z: number };
  vel: { x: number, z: number };
}

QueueItem {
  id: string;
  title: string;
  url: string;
  requestedBy: string;
  duration: number;      // seconds
  thumbnail: string;     // path like /cache/thumbnails/...
}

PlaybackState {
  currentIndex: number;
  isPlaying: boolean;
  position: number;      // seconds
  volume: number;        // 0-100
  muted: boolean;
  loop: boolean;
  shuffle: boolean;
}

Ownership {
  ownerId: string;
  expiresAt: number;
  priority?: number;
}
```

---

### Raw WebSocket Server (`/ws`)

- Used by legacy clients (e.g., old phone app or test scripts)
- Message format: JSON strings with `type` field
- Supports similar actions: `join`, `input`, `action`, `queue_add`, `queue_remove`, `media_*`, etc.
- Broadcasts `queue_updated`, `player_joined`, `player_left`, etc.
- **Note:** The phone app now uses Socket.IO, not raw WS.

---

### Services

- **LobbySyncService**: Physics simulation for cubes, broadcasts `lobby_state`.
- **VideoQueueService**: Manages queue, playback, and pending items; resolves metadata via yt‑dlp.
- **InputService**: Processes button/analog input, enforces ownership for menu navigation.
- **AuthService**: One‑time token generation/validation for secure connections.
- **GameScanner**: Scans library folders for Steam games and executables.
- **AppLauncher**: Spawns external applications.
