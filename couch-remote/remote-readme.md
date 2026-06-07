## 📱 Phone App (`couch-remote/`) – Mobile Companion

### Overview

The phone app is a mobile-first React companion that connects to the JDrakoon3 backend via Socket.IO. It allows users to:

- Log in with a name and color.
- Navigate the TV dashboard using a D‑pad, analog joystick, and ABXY buttons.
- Use a touchpad/mouse and keyboard input.
- Manage the shared media queue and playback.

It is served under `/phone/` by the backend (proxied in dev, static in production).

### Tech Stack

- **React 19** + JavaScript (JSX)
- **Vite** with `/phone/` base path
- **Tailwind CSS v4** via Vite plugin
- **Socket.IO client** for real‑time communication
- **Lucide React** for icons

### File Structure (src/)

```
src/
├── App.jsx                   # Main app – login screen vs main interface
├── main.jsx                  # ReactDOM entry
├── index.css                 # Tailwind + touch/overscroll prevention
├── components/
│   ├── LoginScreen.jsx       # Name/color picker
│   ├── Header.jsx            # User info, connection status
│   └── tabs/
│       ├── RemoteTab.jsx     # D-pad, joystick, ABXY, system buttons, volume
│       ├── TouchpadTab.jsx   # Touch area, keyboard input
│       └── MediaTab.jsx      # Now playing, seek, queue management
├── hooks/
│   └── useConsoleState.js    # Global state from Socket.IO events
└── services/
    ├── socket.js             # Socket.IO connection + transport setup
    └── inputActions.js       # Action constants and sendAction dispatcher
```

---

### App Flow

1. **Login Screen** – User enters name, picks a color (or selects custom), then presses “Join the Couch”.
2. **`App.jsx`** calls `connectSocket(null, { name, color })` and transitions to `MAIN` screen.
3. **Main Screen** shows a header and three tabs:
   - **Remote** (gamepad‑like controls)
   - **Touchpad** (mouse/keyboard)
   - **Media** (queue + playback)

---

### Socket.IO Connection (`services/socket.js`)

- **URL:** `ws://<hostname>:3001` (auto‑detected)
- **Connection:** Managed by a singleton `socket`; reused across calls.
- **On `connect`:** Emits `join` with `{ name, color, deviceType: "phone" }`.
- **Forwarded server events:** `lobby_state`, `queue_updated`, `player_joined`, `player_left`, `action`, `input:ownership_updated`, `queue_add_failed`, `video_error`.  
  All events are wrapped with a `type` property and sent to listeners.
- **Transport function:** `setTransport` from `inputActions.js` is called with a function that translates actions into socket emits (see below).
- **Re‑join logic:** If `connect()` is called again with a name and the socket already exists, it emits `join` again (useful for re‑logging without reconnecting).

---

### Input Actions & Transport (`services/inputActions.js`)

This module defines a global `sendFn` (the transport) and a set of action constants.

**Action Constants:**

```js
(NAV_UP,
  NAV_DOWN,
  NAV_LEFT,
  NAV_RIGHT,
  CONFIRM,
  BACK,
  HOME,
  START,
  MENU,
  POWER,
  MOUSE_MOVE,
  MOUSE_CLICK,
  MOUSE_RIGHT_CLICK,
  SCROLL,
  KEY_PRESS,
  TEXT_INPUT,
  MEDIA_PLAY_PAUSE,
  MEDIA_NEXT,
  MEDIA_PREV,
  MEDIA_VOLUME,
  MEDIA_MUTE,
  MEDIA_SEEK,
  FULLSCREEN,
  ADD_TO_QUEUE,
  REMOVE_FROM_QUEUE,
  MOVE_QUEUE_ITEM,
  CLEAR_QUEUE,
  SHUFFLE_QUEUE,
  LOOP_TOGGLE,
  PLAYBACK_SPEED,
  SUBTITLES_TOGGLE,
  CUBE_MOVE,
  A,
  B,
  X,
  Y);
```

**Transport Mapping (set in `socket.js`):**

| Action Constant                  | Socket Emit Event | Payload                                     |
| -------------------------------- | ----------------- | ------------------------------------------- |
| `CUBE_MOVE`                      | `input:event`     | `{ analog: { x, y } }`                      |
| `A` / `B` / `X` / `Y`            | `input:event`     | `{ buttons: { a/b/x/y: true } }`            |
| `NAV_*`                          | `input:event`     | `{ buttons: { up/down/left/right: true } }` |
| `CONFIRM`                        | `input:event`     | `{ buttons: { a: true } }`                  |
| `HOME`                           | `input:event`     | `{ buttons: { start: true } }`              |
| `MENU`                           | `action`          | `{ type: "menu" }`                          |
| `POWER`                          | `action`          | `{ type: "power" }`                         |
| `START`                          | `action`          | `{ type: "start" }`                         |
| `MEDIA_PLAY_PAUSE`               | `media_playpause` | –                                           |
| `MEDIA_NEXT`                     | `media_next`      | –                                           |
| `MEDIA_PREV`                     | `media_prev`      | –                                           |
| `MEDIA_VOLUME`                   | `media_volume`    | `{ volume: number }`                        |
| `MEDIA_MUTE`                     | `media_mute`      | –                                           |
| `MEDIA_SEEK`                     | `media_seek`      | `{ progress: number }`                      |
| `ADD_TO_QUEUE`                   | `queue_add`       | `payload.url` (string)                      |
| `REMOVE_FROM_QUEUE`              | `queue_remove`    | `payload.index`                             |
| `LOOP_TOGGLE`                    | `loop_toggle`     | –                                           |
| `SHUFFLE_QUEUE`                  | `shuffle_queue`   | –                                           |
| `FULLSCREEN`, `MOUSE_MOVE`, etc. | _not implemented_ | (unhandled)                                 |

**Note:** The transport calls `console.log` before sending, so you see `sendAction` logs in the browser console.

---

### Console State Hook (`useConsoleState.js`)

- Provides a normalised state object derived from socket events.
- **Default state:** `{ playing: false, queue: [], volume: 72, muted: true, progress: 0, loop: false, shuffle: false, currentApp: "Home", currentItem: null }`.
- On each incoming event:
  - If `type === "queue_updated"`: extracts `playback` and `queue`, updates cached state with `playing`, `queue`, `volume`, `muted`, `progress`, `loop`, `shuffle`, `currentItem` (first item in queue).
  - For other events: exposes the raw event as `lastEvent` alongside the previous state.
- Cached state is shared across all component instances via a module-level `cachedState` and a `Set` of subscribers.

---

### UI Components

#### LoginScreen

- Allows name input (max 20 chars), color selection from 5 presets + custom color picker.
- Shows a live preview of the avatar.
- On submit, calls `onJoin(name, color)`. “Continue as Guest” skips name/color.

#### Header

- Displays user avatar, name, connection indicator (green pulsing dot or “Disconnected”), current app name (from `useConsoleState`), and a fake ping.
- Connection status derived from whether `useConsoleState` returns a truthy state.

#### RemoteTab

- **System bar:** Home, Back, Start, Menu, Power buttons (all using `sendAction`).
- **Face plate:**
  - D‑pad (Up, Down, Left, Right) with an analog **Joystick** in the center.
  - ABXY diamond (colored, circular buttons).
- **Bottom controls:** Fullscreen, volume slider, mute toggle, keyboard/touchpad buttons.
- The **Joystick** uses pointer events; normalised `{ x, y }` from -1 to 1 are sent as `CUBE_MOVE` continuously.
- Volume slider sends `MEDIA_VOLUME` on change; mute toggles local state and emits `MEDIA_MUTE`.

#### TouchpadTab

- A touch area that interprets gestures:
  - Single finger drag → `MOUSE_MOVE` with `{ dx, dy }`.
  - Tap → `MOUSE_CLICK`.
  - Two‑finger drag → `SCROLL` with `{ dy }`.
  - Two‑finger tap → `MOUSE_RIGHT_CLICK`.
- Quick‑action buttons: ESC, ALT+TAB, WIN, Enter (all emit `KEY_PRESS` with the key name).
- Text input field with a send button – emits `TEXT_INPUT` with `{ text }`.

#### MediaTab

- **Now Playing card:** Shows thumbnail placeholder (with first letter of title), title, “channel” (placeholder), playing/paused indicator (animated bars), duration.
- **Seek bar:** Local `progress` state, emits `MEDIA_SEEK` on change.
- **Playback controls:** Previous, Play/Pause, Next (emits `MEDIA_PLAY_PAUSE`, `MEDIA_PREV`, `MEDIA_NEXT`).
- **Volume:** Slider + mute button, emits `MEDIA_VOLUME` / `MEDIA_MUTE`.
- **Toggle row:** Loop, Shuffle, Speed, Subs buttons (emit corresponding actions). Speed/Subs are stubbed.
- **Queue list:** Derived from `useConsoleState` queue, displayed with thumbnail, title, duration, move up/down, and delete buttons. Each item has a color field (from mock or fallback).
  - Move up/down: local optimistic reorder + emits `MOVE_QUEUE_ITEM` with `{ index, direction: -1/1 }`.
  - Delete: removes from local queue + emits `REMOVE_FROM_QUEUE` with `{ index }`.
- **Add URL input:** Emits `ADD_TO_QUEUE` with the URL string.

**Important:** The MediaTab duplicates the queue in local state (`useState(media.queue)`). It does not use `pendingItems` from the TV frontend – it shows items optimistically but relies on server `queue_updated` to replace them. There is no pending shimmer UI in the phone app.

---

### How It Connects to the Backend

- **Join:** `socket.emit("join", { name, color, deviceType: "phone" })` → server adds player, broadcasts `player_joined`, and sends `lobby_state`.
- **Remote input:** D‑pad / ABXY → `input:event` with `buttons` → server processes via `InputService`, emits `action` events → TV dashboard receives and navigates/moves.
- **Analog joystick:** `input:event` with `analog` → server translates to `action` (type `move`) → TV receives and moves the remote player’s cube.
- **Media controls:** Directly emit `media_*` and `queue_*` events → server updates `VideoQueueService` → broadcasts `queue_updated` to all clients (including the phone itself, updating the UI).
- **State sync:** `queue_updated`, `lobby_state`, `player_joined`, `player_left` are listened to and update the cached state via `useConsoleState`.

### Missing / Future

- Many actions (`FULLSCREEN`, `MOUSE_MOVE`, `SCROLL`, `KEY_PRESS`, `TEXT_INPUT`, `PLAYBACK_SPEED`, `SUBTITLES_TOGGLE`) are defined but the transport switch does not handle them. They will warn “unhandled action”.
- The MediaTab duplicates queue state locally and doesn’t integrate with the TV’s pending/retry system. Adding an item appears immediately in the local list but may be replaced by the server response.
- No ownership claim/release UI – all inputs are sent without enforcing exclusive control.
- TouchpadTab uses `mouse`/`keyboard` actions that are not processed by the backend yet.
