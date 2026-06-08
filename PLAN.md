# JDrakoon3 Feature Connection Plan (Revised)

This plan assumes you have the codebase exactly as provided. The goal is to get all core features working end‑to‑end. **Work through each step sequentially** — do not skip ahead until the current step’s tests pass.

---

## Prerequisites

- [x] Build both frontends and copy them into the backend's static folder
  - `couch-console/`: `npm install && npm run build`
  - `couch-remote/`: `npm install && npm run build`
  - Copy `couch-console/dist/` → `backend/frontend-build/`
  - Copy `couch-remote/dist/` → `backend/frontend-build/phone/`
- [x] Install backend dependencies: `backend/`: `npm install`
- [x] Start backend: `backend/`: `npm run dev`
- [x] Verify TV UI at `http://localhost:3001`
- [x] Verify Phone UI at `http://localhost:3001/phone`
- [x] Run `node test_socketio_client.js` and `node test_ws_client.js` to confirm server is reachable

---

## Step 0 – Fix Production Authentication & Initial State

- [ ] **Make clients send an authentication token** (or disable auth in production for now).  
       The backend currently requires a valid token or `SOCKET_SECRET` in production, but neither the TV nor phone app sends one.  
       _Fix:_ For immediate progress, modify `verifyToken()` in `socketio_server.ts` to always return `true` in non‑production, and optionally add a static token in production.

- [ ] **Send initial `queue_updated` on new connections** so the queue is not empty.  
       In `socketio_server.ts`, inside the `join` handler, re‑add `socket.emit("queue_updated", videoQueue.getState())`.

- [ ] **Remove double `queue_updated` emissions.**  
       Every media action now manually emits `queue_updated`, while the `videoQueue.subscribe()` already does it. Remove the manual emissions from all `media_*` and `queue_*` handlers.

---

## Step 1 – TV Lobby Sync (Server → TV)

**Goal:** Remote players appear as 3D cubes on the TV.

**Status:** Mostly working, but confirm behavior after auth fix.

- [x] In `couch-console/src/App.tsx`, connect to Socket.IO, subscribe to `lobby_state`, `player_joined`, `player_left`. Store remote players in state.
- [x] Pass remote players to `useLobbyRenderer` to sync entities.

**Testing:**

- [x] Start backend, TV, and test client (`node test_socketio_client.js`).
- [x] A cube appears for the test client.
- [x] When the test client disconnects, the cube disappears.

---

## Step 2 – TV Input → Backend (Keyboard/Gamepad)

**Goal:** Local keyboard/gamepad movement on TV updates the lobby state.

**Status:** Local input is processed directly in the TV’s physics loop and does **not** go through the server. This is intentional for responsiveness. Remote cubes (from phones) are moved via server actions. This step originally aimed to send TV input to the server – we will **skip** it because the current architecture keeps local input local.

- [x] _Skipped_ – TV local input stays local.

---

## Step 3 – Phone Remote Basic Controls (Navigation & Ownership)

**Goal:** Phone can navigate the TV menu and move its own cube.

**Status:** Partially working – D‑pad and joystick already emit the correct events, but some button mappings are missing. Also, the transport is only set on first socket creation, causing issues after reconnection.

**Required fixes:**

1. **Complete the transport mapping in `couch-remote/src/services/socket.js`.**  
   Add cases for `CLEAR_QUEUE`, `SHUFFLE_QUEUE`, `LOOP_TOGGLE`, `MOVE_QUEUE_ITEM`, etc. (All actions currently used by `MediaTab`).
2. **Fix the “Back” button** – either map it to an `action` that the TV understands, or remove the button if not needed.
3. **Re‑set transport on socket reconnect** (or ensure the transport function always uses the latest `socket`).

**Testing:**

- [ ] Open TV and phone (or `pair.html`).
- [ ] On phone Remote tab, press D‑pad arrows → TV dashboard selection moves.
- [ ] Move the analog joystick → a cube appears (if not already) and moves.
- [ ] Press A → selects/launches an app.
- [ ] Use `pair.html` "Claim Menu" button and verify ownership in log.

---

## Step 4 – Media Queue Sync (Phone ↔ Backend ↔ TV)

**Goal:** Add a YouTube URL from phone, see it on TV, control playback.

**Critical issues to resolve first:**

- The backend no longer supports optimistic pending items – it does **not** emit `queue_add_failed` or track `pendingId`.
- The TV frontend still expects these events and shows shimmer placeholders with retry logic.
- The phone MediaTab expects `item.color` and `item.channel` which the server does not provide.

**Therefore, this step must be split:**

### 4a – Simplify queue add (remove optimistic UI)

- Strip the pending/retry logic from the TV’s `useMediaPlayer` hook.
- When a URL is added, just emit `queue_add` and let the server broadcast `queue_updated` when ready.
- The TV queue UI will only show confirmed items (no shimmer cards).

### 4b – Fix phone MediaTab

- Remove the fake `color`/`channel` assumptions. Use the actual `QueueItem` fields: `thumbnail`, `title`, `duration`, `requestedBy`.
- Wire up all media actions that are currently missing (shuffle, loop, move, clear, etc.).
- The phone’s queue should be read‑only from `useConsoleState` (no local optimistic changes) until we can trust server echoes.

### 4c – Ensure volume/seek work correctly

- Volume and seek already emit the correct events on the phone; double‑check that the TV responds without restarting the video (the current `suppressSyncUntil` logic is good).

**Testing:**

- [ ] Open TV and phone.
- [ ] On phone Media tab, paste a YouTube URL and tap Add.
- [ ] After a moment, the TV queue shows the new item with title and thumbnail.
- [ ] Tap play → TV player starts. Seek bar updates.
- [ ] Use all media controls (next, prev, shuffle, loop, move, clear) – each works on the TV.
- [ ] Volume slider on phone changes TV volume without restarting the video.

---

## Step 5 – App Launching (TV → Backend Process Spawning)

**Goal:** Selecting an app on TV launches it via backend, and the TV state changes to `APP_RUNNING`.

**Status:** The frontend currently uses a mock `launchApp` that only toggles state. The backend already has the `launch_app` handler and an `AppLauncher` service.

**Required changes:**

- In `AppLauncher.tsx`, when confirming a selection, emit `launch_app` with the app’s `id` instead of calling the mock.
- Listen for `app_launched` and `app_closed` events to change the state machine to/from `APP_RUNNING`.
- The backend already handles these, so no server changes needed.

**Testing:**

- [ ] Add a dummy app to `library.json` (e.g., Notepad).
- [ ] On TV, select Notepad and confirm → Notepad launches.
- [ ] On phone, press close app (or simulate `close_app` event) → TV returns to home.

---

## Step 6 – Dynamic Game Library (Scanning & Display)

**Goal:** TV shows real apps from backend scan instead of the hardcoded `MOCK_APPS`.

**Required changes:**

- In `App.tsx`, on mount (or after joining), emit `scan_library` and listen for `library_updated`. Store the `AppEntry[]`.
- Replace `MOCK_APPS` with this dynamic list in `AppLauncher.tsx`.
- The backend already has the scanner; it will return Steam and local .exe entries.

**Testing:**

- [ ] Add a folder with `.exe` files to `settings.json` (or use existing scan).
- [ ] Trigger a library scan (e.g., add a button or auto‑scan on backend start).
- [ ] TV shows those games with correct names; selecting one launches it.

---

## Step 7 – Settings Sync (Volume, CRT Effect, etc.)

**Goal:** Change a setting on phone/TV and see it applied immediately on TV.

**Status:** The backend already supports `settings_get`/`settings_update`/`settings_updated`. The TV needs a basic UI.

**Required changes:**

- Add a simple settings panel (e.g., a modal) on the TV to toggle CRT effect and adjust default volume.
- Fetch current settings on mount via HTTP or Socket.IO (`settings_get`).
- When settings change, emit `settings_update` and also listen for `settings_updated` to reflect changes from other clients.

**Testing:**

- [ ] Toggle CRT effect from TV settings → shader enables/disables immediately.
- [ ] Change volume → TV media volume updates.
- [ ] Settings persist after backend restart (they are saved to `settings.json`).

---

## Step 8 – Full Ownership & Input Focus (Multi‑player Control)

**Goal:** Only one client can control the menu at a time; launching an app shifts focus to `fullscreen`.

**Status:** The ownership system exists and the phone already has claim/release buttons (in `pair.html`). The TV does not use ownership for local input (it always controls the menu locally). For remote‑only control, this step is about phone clients respecting ownership.

**Required changes:**

- In the phone’s input handling, **before** sending navigation/confirm events, check ownership by claiming `menu` (or use `input:heartbeat`). This prevents multiple phones fighting.
- On app launch, the focus changes to `fullscreen` – only the phone that owns `fullscreen` can send game inputs to the running app.
- The TV need not enforce ownership for its own keyboard/gamepad (it’s trusted).

**Testing:**

- [ ] Connect two phones; phone 1 claims `menu` – phone 2’s d‑pad does nothing.
- [ ] Launch an app → phone 1 claims `fullscreen`, sends button presses; phone 2 cannot interfere.
- [ ] Close app → focus returns to `menu`.

---

## Step 9 – End‑to‑End Integration Test

**Goal:** Run a complete multi‑device scenario.

**Scenario (updated):**

1. Start backend, TV, two phone clients.
2. Both join → cubes appear.
3. Phone 1 claims menu, navigates to a real app.
4. TV launches app; phone 1 claims fullscreen, sends inputs.
5. Phone 2 adds a YouTube video; TV queue updates and playback can be controlled by any phone.
6. Phone 1 closes app → TV returns home.
7. Both phones see queue update and can play/pause.
8. Toggle CRT effect from TV settings → shader changes.

**Testing:**

- [ ] Perform the scenario manually with real devices or test scripts.

---

## Immediate Priorities (Before Step 4)

1. **Re‑enable pending/optimistic system OR remove it entirely.** (Right now it’s broken and blocks media queue testing.)
2. **Fix phone transport for all media actions.**
3. **Send initial `queue_updated` on join.**
4. **Eliminate double `queue_updated` emissions.**

Once these are done, the media queue will work reliably, and we can proceed through the remaining steps.
