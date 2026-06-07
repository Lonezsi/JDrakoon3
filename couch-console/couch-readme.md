## 📺 TV Frontend (`couch-console/`) – Lobby Dashboard & Media Player

### Overview

The TV frontend is a React + Three.js application running on the main screen. It provides:

- **Boot screen** with animated logo.
- **Dashboard** with app launcher, media player footer, and phone QR code.
- **3D lobby** rendered with Three.js and Rapier physics. Remote players appear as cubes, local keyboard/gamepad players also have cubes.
- **Media player** with full queue management, playback controls, and optimistic “pending” UI.
- **Socket.IO client** that syncs lobby state, remote input, and media queue/playback with the backend.

### Tech Stack

- **React 19** + **TypeScript** (strict)
- **Vite** for bundling/dev server
- **Tailwind CSS v4** via Vite plugin
- **Socket.IO client** for real‑time communication
- **Three.js** + **Rapier3D** for the 3D lobby scene (physics + CRT post‑processing)
- **Lucide React** for icons

### File Structure (src/)

```
src/
├── App.tsx                    # Main app component (state, input, socket)
├── main.tsx                   # ReactDOM entry
├── index.css                  # Tailwind + custom scrollbar
├── vite-env.d.ts
├── core/
│   ├── events.ts              # Global event bus
│   └── stateMachine.ts        # AppState machine (BOOT/HOME/APP_RUNNING)
├── hooks/
│   ├── useClock.ts            # Clock tick (Date)
│   ├── useGameLoop.ts         # Sync snapshot of PlayerManager
│   ├── useLobbyRenderer.ts    # Mount/dismount LobbyScene
│   └── useMediaPlayer.ts      # Queue/playback hook (see below)
├── scenes/lobby/
│   ├── LobbyScene.ts          # Rapier world, Three.js rendering
│   └── shaders.ts             # CRT post‑processing shaders
├── services/
│   ├── socket.ts              # Socket.IO connection, subscribe, sendAction
│   ├── notificationService.ts # Toast notifications
│   └── launcherService.ts     # App launch simulation
├── shared/
│   ├── constants.ts           # BOUNDS, CUBE_SIZE, mock apps, types
│   └── types.ts               # Player, DeviceAction, AppState, etc.
├── systems/
│   ├── input/
│   │   └── inputManager.ts    # Central input processing (keyboard, gamepad)
│   └── player/
│       └── playerManager.ts   # Player list store
└── ui/
    ├── layouts/
    │   └── DashboardLayout.tsx
    └── components/
        ├── BootScreen.tsx
        ├── AppLauncher.tsx
        ├── TopBar.tsx
        ├── Footer.tsx         # Media player + queue
        ├── Notifications.tsx
        ├── PhoneQR.tsx
        └── AppRunningOverlay.tsx (not shown but referenced)
```

---

### App State Machine

```
BOOT  ──(2.6s)──>  HOME  ──(launchApp)──> APP_RUNNING
APP_RUNNING ──(3.2s)──> HOME
```

- `BOOT` shows `BootScreen`.
- `HOME` shows `DashboardLayout` (app launcher, lobby overlay, media footer).
- `APP_RUNNING` hides the dashboard with a blur/opacity transition and shows `AppRunningOverlay`.

State is managed by `core/stateMachine.ts` and synced via `events` bus.

---

### Socket.IO Connection

- **Service:** `services/socket.ts`
- **Connect:** Automatically on boot (when `state !== "BOOT"`) using `connect({ name: "Console", color: "#000000", deviceType: "console" })`.
- **URL:** `ws://<hostname>:3001` (auto‑detected via `location.hostname`).
- **Auth:** Optional token via `handshake.auth.token`.
- **Transports:** `websocket`, `polling`.
- **On connect:** Emits `"join"` with console identity.

#### Events the TV listens to (via `subscribe`)

| Event                             | Handler                                                              |
| --------------------------------- | -------------------------------------------------------------------- |
| `lobby_state`                     | Update `remotePlayers` (filter out console), add to `playerManager`. |
| `player_joined`                   | Add remote player if `deviceType !== "console"`.                     |
| `player_left`                     | Remove player from remote list and `playerManager`.                  |
| `action` (type `navigate`)        | Trigger `navigateLeft()` / `navigateRight()`.                        |
| `action` (type `confirm`)         | Call `confirm()` to launch selected app.                             |
| `action` (type `home`)            | Transition state to `HOME`, reset app index.                         |
| `move` (legacy)                   | Inject remote thumbstick input into `InputManager`.                  |
| `queue_updated`                   | Handled inside `useMediaPlayer` hook.                                |
| `video_error`, `queue_add_failed` | Handled inside `useMediaPlayer` hook.                                |

**The TV does not emit `input:event` for its own local input** – local input goes directly into the 3D scene and UI, not through the server. Only remote input from phones is received and injected.

#### Events the TV emits

- `join` (on connect)
- Media controls: `media_playpause`, `media_next`, `media_prev`, `media_seek`, `media_volume`, `media_mute`, `queue_add`, `queue_remove`, `queue_move`, `clear_queue`, `shuffle_queue`, `loop_toggle` – via `useMediaPlayer`.
- (No `input:event` emitted by the TV.)

---

### Input Handling (Local)

**`InputManager`** (`systems/input/inputManager.ts`) aggregates all local input into `DeviceAction[]` every frame.

#### Keyboard

- `W A S D` → continuous move for player ID `"AWSD"` (normalised direction).
- `U H J K` → continuous move for player ID `"UHJK"`.
- Arrow keys → navigation actions (`navigateLeft` / `navigateRight`), debounced globally.
- Enter → confirm.
- All key states stored in a `Map<string, boolean>`.

#### Gamepad

- Polled every animation frame via `navigator.getGamepads()`.
- Left stick → move for player ID `"gp<index>"` (raw axis values).
- D‑pad buttons 14/15 → navigation left/right.
- Button 0 → confirm.
- All axes/buttons are sent as actions every frame while held.

#### External Actions

- `InputManager.injectActions()` is used by the socket handler to feed remote `move` events into the same pipeline.

#### Action Processing (in `App.tsx`)

- `move` actions → ensure local player exists in `playerManager`, then call `sceneRef.current.setPlayerInput(playerId, vx, vz)`.
- `navigate` / `confirm` actions → debounced UI calls.
- Players that did **not** send a move this frame are stopped via `setPlayerInput(id, 0, 0)`.

**Note:** Local players (keyboard/gamepad) are created on‑the‑fly by `ensurePlayerExists` with auto‑incremented names and a color palette. They are **not** sent to the server.

---

### Player Management

**`playerManager`** (`systems/player/playerManager.ts`):

- Maintains a global array of `Player` objects (local + remote).
- `addPlayer`, `removePlayer`, subscribe.
- `useGameLoop` hook provides a reactive snapshot that the UI and `LobbyScene.syncEntities` consume.

---

### 3D Lobby Scene (`LobbyScene.ts`)

- **Initialization:** Async (`RAPIER.init()`). Creates a Rapier world with a floor and four walls.
- **Physics:** Fixed timestep (1/60s), accumulator pattern.
- **Player Representation:** Each player gets a colored box (`BoxGeometry`) with emissive material, a sprite name label, and a dynamic rigid body (cuboid collider).
- **Input → Physics:** `setPlayerInput` stores desired horizontal velocity. On each physics step, the cube's linear velocity is set directly (instant start/stop) with the stored input, clamped to `MAX_SPEED`. When input is zero, a one‑shot horizontal stop is applied; subsequent frames let gravity/contacts move the cube freely.
- **Particles:** On impacts (velocity change > 5.5), a burst of particles spawns.
- **Rendering:** Three.js WebGLRenderer, orthographic post‑processing with a CRT shader (vignette, scanlines, chroma separation, VHS tear, noise).
- **Sync with React:** After each physics step, positions/velocities are pushed via `onUpdate` callback, which updates `playerManager` and re‑renders UI.
- **Lifecycle:** `syncEntities` adds/removes meshes and bodies when the player list changes.

---

### Media Player Hook (`useMediaPlayer.ts`)

Central hook used by the `Footer` component.

#### Local State

- `queue: QueueItem[]`
- `pendingItems: PendingItem[]` (optimistic adds with retries)
- `playback: PlaybackState` (currentIndex, isPlaying, position, volume, muted, loop, shuffle)
- `videoRef` for the `<video>` element
- `suppressSyncUntil` ref to avoid seek echo after user seek/volume
- `prevQueueLen` ref to auto‑play on first add

#### Socket Subscription

- Listens to `queue_updated`, `video_error`, `queue_add_failed`.
- On `queue_updated`: updates `queue` and `playback`, removes any pending item whose URL now exists in the queue.
- On `queue_add_failed` / `video_error`: shows a notification and removes the pending item.

#### Queue Add (Optimistic)

- `handleQueueAdd(url, requestedBy)` creates a `PendingItem`, emits `queue_add` with a `pendingId`.
- Server acknowledges: if `ok: false`, pending item is removed and notification shown.
- The UI shows a loading shimmer card for each pending item.

#### Retry Logic

- Every second, stale pending items (older than `RETRY_DELAYS` and under `MAX_RETRIES`) are re‑emitted as `queue_add`.
- After max retries, the pending item is removed with a failure notification.

#### Playback Controls

- Play/pause, next/prev, seek, volume, mute, clear queue, move item, remove item.
- Volume/seek/mute set `suppressSyncUntil` for 2 seconds to prevent the server’s echoed position from snapping the video.
- Seek sync from server is thresholded: while playing only large jumps (>5s) are applied; while paused any jump >0.5s.
- Auto‑play: When queue length becomes 1 and was previously 0, emits `media_playpause`.
- Auto‑advance: If queue is non‑empty but `currentItem` is null, emits `media_next`.
- Current time reported to server every 1 second while playing.

#### Video Element

- `src` is set to `/stream?url=...` only when `currentItem.url` changes, so volume/seek never reload the video.
- Volume/mute applied directly via `video.volume` and `video.muted`.
- Error listener: if a load error occurs, sets `videoError` (which `Footer` pushes as a notification).

---

### UI Components

- **TopBar** – Shows logo, app name, active player count, Wi‑Fi SSID (fetched from `/api/network-info`), clock, user name (from `/api/users/me`).
- **AppLauncher** – Horizontal scrollable list of `MOCK_APPS`. Selection via `activeIndex`, confirm launches the app (simulated). Includes an “Add System” placeholder.
- **Footer** – Contains:
  - “In the Lobby” player avatars.
  - Mini media player (only visible when a video is present and not fullscreen). Shows now‑playing card, seekbar, volume, fullscreen toggle, clear button.
  - Queue panel: horizontal scroll list of confirmed items (with thumbnail, title, requester, move/delete buttons) and pending shimmer items.
  - URL input to add new videos.
- **PhoneQR** – Fetches `/qr-code` and displays the QR code + click‑to‑copy URL.
- **Notifications** – Toast messages from `notifService`.

### Dashboard Layout

`DashboardLayout` arranges `TopBar`, `AppLauncher`, and `Footer` vertically. The 3D canvas is placed behind as a fixed background (via `mountRef`). When an app is launched, the dashboard fades out and an overlay appears (simulated).

---

### How It Connects to the Backend

- The TV frontend is served by the backend (either proxied in dev or served statically from `frontend-build`).
- Socket.IO connection is initiated in `App.tsx` → `services/socket.ts`.
- It receives `lobby_state`, `player_joined`, `player_left`, and `action` (navigation/confirm/move) events to keep remote players and UI in sync.
- It emits media control events (`media_*`, `queue_*`) to the server, which updates the shared `VideoQueueService` and broadcasts `queue_updated` back to all clients.

### Missing / Future

- App launching is mocked (`launchApp` just transitions state).
- Touchpad/mouse/keyboard input from phone is not yet processed by backend (actions defined but unused).
- Settings UI and logout are stubbed.
- Game library scanning integration with backend (mock apps only).
