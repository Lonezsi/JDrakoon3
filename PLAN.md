# JDrakoon3 Feature Connection Plan

This project connects a TV frontend (`couch-console`), a phone remote (`couch-remote`), and a backend server.  
Follow each step sequentially, marking the checkbox `[x]` after verifying the step works.

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

## Step 0 – Fix WebSocket Transport (Prerequisite)

- [x] Build frontends and backend.
- [x] Start backend.
- [x] Fix the 400 WebSocket handshake error by adjusting `ws` upgrade handling.
  - Modify `backend/src/websocket/server.ts` as described above.
  - Rebuild backend with `npm run build` and restart.
- [x] Verify WebSocket connection is successful (no 400 errors in browser console).
- [x] Run `node test_socketio_client.js` to confirm WebSocket-only connection works.

---

## Step 1 – TV Lobby Sync (Server → TV)

**Goal:** Display remote players from the backend lobby as 3D cubes on the TV.

**Modifications:**

- In `couch-console/src/App.tsx`, connect to Socket.IO, subscribe to `lobby_state`, `player_joined`, `player_left`. Store remote players in state.
- Pass remote players to `useLobbyRenderer` (or `LobbyScene.ts`) to sync entities.

**Testing:**

- [ ] Start backend, TV, and test client (`node test_socketio_client.js`).
- [ ] A cube appears for the test client.
- [ ] When the test client disconnects, the cube disappears.

---

## Step 2 – TV Input → Backend (Keyboard/Gamepad)

**Goal:** Keyboard/gamepad movement on TV updates the lobby state and is visible to other clients.

**Modifications:**

- In `App.tsx`, adjust the `inputManager` callback to emit `input:event` with `{ analog: { x, y }, buttons: {} }` for movement.
- In `socket.ts`, ensure `socket` is accessible to emit directly or provide a `sendInput` method.

**Testing:**

- [ ] Start TV and test client.
- [ ] Move with WASD → cube moves on TV and test client output.
- [ ] Gamepad movement also works.

---

## Step 3 – Phone Remote Basic Controls (Navigation & Ownership)

**Goal:** Phone can claim menu control, navigate, and see TV respond.

**Modifications:**

- In `couch-remote/src/services/socket.js`, complete action mappings:
  - `NAV_LEFT` → `socket.emit("action", { type: "navigate", value: { direction: "left" } })`.
  - `CONFIRM` → `socket.emit("action", { type: "confirm" })`.
  - Add `input:claim` and `input:release` calls.
- In `couch-remote/src/App.jsx`, after login, emit `join` and store player ID, claim `menu`.

**Testing:**

- [ ] Open TV and phone (or `pair.html`).
- [ ] On phone Remote tab, press D‑pad arrows → TV dashboard selection moves.
- [ ] Use `pair.html` "Claim Menu" button and verify ownership in log.

---

## Step 4 – Media Queue Sync (Phone ↔ Backend ↔ TV)

**Goal:** Add a YouTube URL from phone, see it on TV, control playback.

**Modifications:**

- In `couch-console/src/ui/components/Footer.tsx`, replace local `useMediaPlayer` with reactive state from `queue_updated` events. Emit media control events (`media_playpause`, `media_next`, etc.) on user actions.
- In `couch-console/src/services/socket.ts`, add methods to emit `queue_add`, `queue_remove`, etc.
- In `couch-remote/src/components/tabs/MediaTab.jsx`, ensure `MEDIA_VOLUME` sends `media_volume` and seek sends `media_seek`.

**Testing:**

- [ ] Open TV and phone.
- [ ] On phone Media tab, paste a YouTube URL and tap Add.
- [ ] TV queue shows the new item.
- [ ] Tap play → TV player starts. Seek bar updates.

---

## Step 5 – App Launching (TV → Backend Process Spawning)

**Goal:** Clicking an app on TV launches it via backend; input is forwarded to the app.

**Modifications:**

- In `AppLauncher.tsx`, emit `launch_app` with app `id` instead of mock `launchApp`.
- In `App.tsx`, replace mock launcher logic: listen for `app_launched`/`app_closed` to change state.

**Testing:**

- [ ] Add a dummy app to `library.json` (e.g., Notepad).
- [ ] On TV, select Notepad and confirm → Notepad launches.
- [ ] On phone, press close app → TV returns to home.

---

## Step 6 – Dynamic Game Library (Scanning & Display)

**Goal:** TV shows real apps from backend scan instead of mock list.

**Modifications:**

- In `App.tsx`, on mount emit `scan_library` and listen for `library_updated`. Store `AppEntry[]` and pass to `DashboardLayout` instead of `MOCK_APPS`.

**Testing:**

- [ ] Add a folder with `.exe` files to `settings.json` (or restart backend with existing ones).
- [ ] Trigger library scan (add a button or auto-scan on startup).
- [ ] App launcher shows those games with correct names.

---

## Step 7 – Settings Sync (Volume, CRT Effect, etc.)

**Goal:** Change a setting on phone/TV and see it applied immediately on TV.

**Modifications:**

- Add a basic settings UI on TV (e.g., toggle CRT).
- Fetch settings via `settings_get`, update via `settings_update`, listen for `settings_updated`.

**Testing:**

- [ ] Toggle CRT effect from TV settings → shader enables/disables.
- [ ] Change volume → TV media volume updates.
- [ ] Settings persist after backend restart.

---

## Step 8 – Full Ownership & Input Focus (Multi‑player Control)

**Goal:** Only one phone controls menu; app launch switches focus to "fullscreen" requiring ownership for game input.

**Modifications:**

- In `InputService`, when focus changes to `fullscreen`, ownership target changes accordingly.
- TV/Phone: on app launch, phone must claim `fullscreen` to send inputs.

**Testing:**

- [ ] Connect two phones; one claims `menu` – second cannot navigate.
- [ ] Launch an app → first phone claims `fullscreen`, sends game inputs.
- [ ] Close app → focus returns to `menu`.

---

## Step 9 – End‑to‑End Integration Test

**Goal:** Run a complete multi‑device scenario verifying all features.

**Scenario:**

1. Start backend, TV, two phone clients.
2. Both join → cubes appear.
3. Phone 1 claims menu, navigates to a game.
4. TV launches game; phone 1 claims fullscreen, sends inputs.
5. Phone 2 adds a YouTube video; TV queue updates.
6. Phone 1 closes game → TV returns home.
7. Both phones see queue update and can play/pause.
8. Toggle CRT effect from TV settings → shader changes.

**Testing:**

- [ ] Perform the scenario manually with real devices or test scripts.
- [ ] Check `settings.json` and `library.json` reflect changes.

---

## Final Notes

- **Backend**: always `npm run dev` from `backend/` folder.
- **TV frontend**: served as static via backend (after build).
- **Phone frontend**: served at `/phone` via backend.
- Work through each step **in order**; do not proceed unless all tests pass.
- Update checkboxes `[x]` as you complete each step.
