## 🛋️ JDrakoon3 – Couch Console Project

A smart‑TV media hub and multiplayer lobby for your living room. Control your PC from the couch with phones, gamepads, or a keyboard. Watch videos together, launch games, and see your friends as bouncing cubes on the big screen.

---

### Architecture

```
[Phone App] ── Socket.IO ──┐
                            ├── [Backend (Express + Socket.IO + WS)]
                            │    Port 3001
[TV Dashboard] ── Socket.IO ──┘
```

- **Backend**: Node.js server that manages the lobby, video queue, input ownership, and real‑time state sync.
- **TV Frontend**: React + Three.js app running on the main screen. Shows the dashboard, 3D lobby, and media player.
- **Phone App**: Mobile React companion. Connects via QR code, provides a gamepad, touchpad, and media controls.

All three parts communicate exclusively through **Socket.IO** (with a legacy WebSocket fallback on the `/ws` path).

---

### Features

- **Multiplayer Lobby** – Each player (keyboard, gamepad, or phone) appears as a glowing cube in a physics‑driven 3D scene.
- **Phone Remote** – Scan a QR code to turn any phone into a controller (d‑pad, analog stick, ABXY, touchpad, keyboard).
- **Shared Media Queue** – Add YouTube or direct video links from the TV or your phone. The queue syncs in real time with thumbnail, title, and duration.
- **Optimistic UI** – Pending items show shimmer placeholders, with automatic retry and error notifications.
- **CRT Post‑Processing** – The lobby has a retro CRT effect (vignette, scanlines, chroma shift, VHS tearing).
- **App Launcher** – (Simulated) launch Steam, YouTube, Plex, RetroArch, or add your own.
- **Ownership System** – Claim input focus for the menu to avoid conflicts between multiple devices.

---

### Quick Start (Development)

1. **Clone the repository** and navigate to the `backend/` folder.
2. Install backend dependencies:
   ```bash
   cd backend && npm install
   ```
3. Start the entire stack with a single command:

   ```bash
   npm run dev
   ```

   This runs:
   - Backend on port `3001` (Express + Socket.IO)
   - TV frontend (Vite) on port `5173` (or `5174`, auto‑detected)
   - Phone frontend (Vite) on the other port, proxied under `/phone/`

4. Open the TV UI: `http://localhost:3001`  
   Open the phone UI: `http://localhost:3001/phone` (or scan the QR code on the TV)

---

### Project Structure

```
JDrakoon3/
├── backend/               # Express server, services, Socket.IO, WebSocket
│   └── src/
│       ├── index.ts        # Server bootstrap, REST endpoints, proxy setup
│       ├── socketio_server.ts
│       ├── websocket/      # Legacy raw WS (/ws)
│       └── services/       # LobbySync, VideoQueue, Input, Auth, etc.
├── couch-console/          # TV React app (TypeScript)
│   └── src/
│       ├── App.tsx         # Main component, state machine, input handling
│       ├── hooks/          # useMediaPlayer, useGameLoop, useLobbyRenderer
│       ├── scenes/lobby/   # Three.js + Rapier physics
│       ├── systems/        # InputManager, PlayerManager
│       └── ui/             # Components (TopBar, Footer, AppLauncher, etc.)
└── couch-remote/           # Phone React app (JavaScript)
    └── src/
        ├── App.jsx         # Login → tabs
        ├── services/       # Socket connection, input actions
        ├── hooks/          # useConsoleState
        └── components/     # RemoteTab, TouchpadTab, MediaTab, etc.
```

---

### How It Works

#### 1. Joining the Lobby

- **TV** automatically joins as `deviceType: "console"`.
- **Phones** join after the user enters a name and color. They emit `join` via Socket.IO.
- The server adds the player to the lobby, broadcasts `player_joined`, and sends the full `lobby_state` to all clients.

#### 2. Moving the Cubes

- **Keyboard / Gamepad** (TV): `InputManager` reads keys and stick axes every frame, creates local `DeviceAction`s, and passes them directly to the Rapier physics scene. **Local cubes are not sent to the server** – they live only in the TV’s 3D scene.
- **Phone Joystick / D‑pad**: The phone sends `input:event` with `analog` or `buttons`. The server translates this into an `action` (type `move`, `navigate`, etc.) and broadcasts it. The TV receives the `action`, injects it into the same `InputManager`, and moves the remote cube accordingly.

#### 3. Navigating the TV Menu

- **Keyboard arrows / Enter**, **gamepad d‑pad / A**, and **phone d‑pad / A** all trigger `navigate` or `confirm` actions.
- On the TV, these are debounced and update the app launcher selection. The server involvement ensures that any device can control the menu (subject to the optional ownership system).

#### 4. Managing the Video Queue

- **Adding a URL** (from TV footer or phone Media tab) sends `queue_add`.
- The server extracts metadata (title, thumbnail, duration) via `yt‑dlp`, adds the item, and broadcasts `queue_updated` to **all** clients.
- **Optimistic UI**: The TV footer immediately shows a shimmer placeholder. If the server fails, it sends `queue_add_failed` back to the requesting socket, and the placeholder is removed with a notification.
- Playback controls (play/pause, seek, volume) are relayed through the server to keep all clients in sync. The TV’s `<video>` element applies careful thresholds to avoid seek‑echo loops.

---

### Key Data Flow Diagrams

#### Input Flow (Phone → Cube)

```
Phone: RemoteTab (joystick) → sendAction(CUBE_MOVE, {x,y})
  → socket.js transport → socket.emit("input:event", {analog:{x,y}})
  → Server: InputService.processInput → produces action {type:"move", dx, dy, playerId}
  → broadcast "action" to lobby
  → TV: subscribe handler → inputManager.injectActions({type:"move",...})
  → App.tsx → sceneRef.current.setPlayerInput(playerId, vx, vz)
  → LobbyScene.physicsStep() → sets Rapier body velocity
```

#### Queue Add Flow (Optimistic)

```
TV Footer: user pastes URL → handleQueueAdd(url, adder)
  → creates PendingItem (local state)
  → sendAction("queue_add", {url, requestedBy, pendingId})
  → Server: VideoQueueService.addToQueue() → yt-dlp → success → push item
  → broadcast "queue_updated"
  → TV: useMediaPlayer sees queue_updated → removes pending item, sets queue
  → UI shows real thumbnail
```

---

### Detailed Documentation

- **[Backend README](./backend/README.md)** – All REST endpoints, Socket.IO events, data types, services.
- **[TV Frontend README](./couch-console/README.md)** – App states, input handling, media player hook, 3D scene.
- **[Phone App README](./couch-remote/README.md)** – Socket transport mapping, UI tabs, state sync.

These files contain the exact inputs/outputs and can be used as a reference when working on each part.

---

### Future / Missing Pieces

- **Actual app launching** – Currently simulated; needs to hook into the `AppLauncher` service.
- **Touchpad / mouse / keyboard forwarding** – Actions are defined in the phone app but not processed by the backend yet.
- **Persistent player identities** – No accounts, just ephemeral names.
- **Queue persistence** – Queue clears on server restart.
- **Multi‑room support** – Only one global lobby.

---

### Development Prompts

Use these in a new chat to quickly bring an AI up to speed:

**General development:**

```
You are working on the JDrakoon3 project – a couch console / smart TV media & gaming hub.
The project has a Node.js backend (Express, Socket.IO, raw WebSocket), a React TV dashboard, and a mobile companion app.

Important rules:
- Before writing any code, explain what you're about to change and why.
- If you are unsure about a detail (e.g., variable name, server URL, data shape), ASK me instead of guessing.
- After making changes that affect the system's behavior, API, or architecture, propose an update to the relevant README (backend, frontend, or phone app). I'll decide whether to apply it.
- Keep everything simple – no over-engineering.

Current task: [describe your task here]
```

**Quick context:**

```
I'm working on JDrakoon3 – a couch console with a Node.js backend and React frontend.
Backend: Express on port 3001, serves TV UI (/) and phone UI (/phone). Socket.IO for real-time state, raw WebSocket for legacy input. Media playback via yt-dlp streaming.
Frontend: TV Dashboard (React) with app launcher, media player footer, lobby. Phone app (React) with remote, touchpad, media tabs.
Key files: src/index.ts (Express), src/socketio_server.ts (Socket.IO), src/websocket/ (raw WS), src/services/ (Lobby, Input, Media). Frontend in separate build folders or proxied in dev.
Goal: [explain your current task]
```

**Bug investigation:**

```
Project: JDrakoon3. I have a bug.
- What I did: [steps]
- What I expected: [expected]
- What actually happened: [error message, behavior]
- Relevant logs/screenshots: [attach if possible]
Please ask clarifying questions before proposing a fix. Do NOT assume code you haven't seen.
```
