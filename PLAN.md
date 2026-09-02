# JDrakoon3 — Alpha Feature Backlog (prioritized)

Ordered by **impact ÷ effort/risk**. Each item notes the **model** I'd use:
**Fable** (default — I can do it well) or **Opus** (genuinely architectural / cross-cutting / high-ambiguity).

Legend: ☐ todo · ◐ in progress · ☑ done

---

## TIER 1 — Quick wins, high visible payoff (build first) · Fable

### 1. Touchpad immediacy + "waiting" visual ☑ Fable

**Why:** First gesture feels laggy because `InputControlService` spawns its PowerShell driver lazily on the _first_ command (`ensureProc`, ~hundreds of ms). Also no feedback that a tap registered.
**How:**

- Backend: add `inputControl.warm()` (just calls `ensureProc()`); call it in `socketio_server.ts` on `join` (and on first `control` packet) so the OS driver is hot before the user touches anything.
- Phone `TouchpadTab.jsx`: on `pointerdown` render a quick expanding ripple at the touch point (pure CSS, local) for instant "input received" feedback; show a subtle "connecting…" dot until the first `control` ack returns.

**Done:** `inputControl.warm()` is called on `join` and on first `control` packet (`socketio_server.ts`); `TouchpadTab.jsx` spawns an expanding CSS ripple at the touch point on each tap (`spawnRipple`, `rv-ripple`). (The "connecting…" dot was dropped as redundant — the instant ripple already confirms input received.)

### 2. App icons: lucide fallback + custom image-path icons ☑ Fable

**Why:** Empty icon field shows a bare letter; users want real icons, and a path to a `.png/.ico` should show that image.
**How:**

- `AppCard` in `AppLauncher.tsx`: if `app.icon` looks like an image (`http(s)://`, `file:`, contains `/` or `\`, or ends `.png/.jpg/.ico/.svg/.webp`) → render `<img src=...>` (local paths go through a new backend `GET /api/app-icon?path=` that validates + streams the file). Else if it's a valid lucide name → render that. Else (empty/unknown) → default lucide `AppWindow` (not a letter).
- Backend: `GET /api/app-icon` in `index.ts` — validate the path is an existing image file, stream with correct content-type.

### 3. `.`-prefixed text → key-combo commands (e.g. `.ctrl c`) ☑ Fable

**Done:** `InputControlService.combo(spec)` parses combos (`ctrl+c`, `ctrl shift esc`, `alt+f4`); the phone strips a leading `.` and sends `control {kind:"combo"}`. Extended later (TIER 8) with combo autocomplete chips and a modifier+mouse-click primitive (`.ctrl click`).

**Why:** Power users want to send Ctrl+C etc. from the phone.
**How:**

- `InputControlService.ts`: add PowerShell `X <mods> <key>` command (mods like `ctrl+shift`, key like `c`/`enter`/`f4`) → maps names→VK, holds modifiers, taps key, releases. Add TS `combo(spec)`.
- `socketio_server.ts` control handler: `case "combo": inputControl.combo(pkt.combo)`.
- Phone: `inputActions` add `KEY_COMBO`; `socket.js` `case "KEY_COMBO" → control {kind:"combo", combo}`. `TouchpadTab.sendText`: if input starts with `.`, strip it and send the rest as a combo; else send as text.

### 4. Right stick rotates the cube ☑ Fable

**Done:** Phone right stick → `CUBE_SPIN` → `input:event {spin}`; `InputService.processInput` emits `{type:"spin"}` (focus-independent); `App.tsx` routes it to `LobbyScene.applySpin` (angular velocity, damps out on release). Also works for local gamepads via the mapping's spin axes.

**Why:** Fun, and the right stick is currently redundant with the touchpad for mouse.
**How:**

- Phone `RemoteTab.jsx`: right stick → `CUBE_SPIN {x,y}` (drop its mouse-move role; the Touchpad tab owns the mouse).
- `inputActions` add `CUBE_SPIN`; `socket.js` → `input:event { spin:{x,y} }`.
- Backend `InputService.processInput`: read `packet.spin`, always emit `{type:"spin", playerId, x, y}` (cube exists in any focus).
- `App.tsx`: `case "spin"` → `ensurePlayerExists` + `sceneRef.applySpin(playerId, x, y)`.
- `LobbyScene.applySpin`: `body.setAngvel({ x: y*SPIN, y: 0, z: -x*SPIN }, true)` (SPIN≈7); released stick damps out naturally.

---

## TIER 2 — App management overhaul · Fable (sizable)

### 5. Settings deletion support (foundation for everything below) ☑ Fable

**Why:** `deepMerge` can't remove keys, so apps/accounts can't be deleted.
**How:** Backend: support a sentinel — when a PATCH leaf value is the string `"__delete__"` (or `null` for app entries), delete that key instead of merging. Implement in `SettingsService.update` (post-merge prune pass) or a dedicated `DELETE /api/settings/app/:id`. Prefer a small `deleteApp(id)` + `DELETE /api/apps/:id` endpoint — explicit and safe.

**Done:** chose the explicit route — `SettingsService.removeApp(id)` + `DELETE /api/apps/:id`. Accounts use the dedicated `DELETE /api/accounts/:id`.

### 6. Per-app editing UI + delete (mouse-first) ☑ Fable

**Done:** `AppLauncher` cards show pencil/trash on the focused card → an **App Editor** modal (name, launcher, squircle colour picker, IconPicker) + delete via `DELETE /api/apps/:id`; `SettingsModal` renders the `apps` group as one sub-card per app with its own Delete. (Edit also re-focuses the app on close.)

**Why:** Editing apps by hunting flattened `apps.steam.hex` rows is clumsy; users want a card with edit/delete.
**How:**

- `AppLauncher.tsx`: on the focused/hovered card show a small **edit** (pencil) and **delete** (trash) button, **mouse-clickable** (not in the keyboard focus graph). Edit opens an **App Editor** modal (name, launcher, color picker, icon picker). Delete calls `DELETE /api/apps/:id`.
- `SettingsModal.tsx`: render the `apps` group as **one sub-card per app** (name heading, its fields grouped, a Delete button) instead of flat `apps.x.y` rows. Keep keyboard nav working (each app card or field is focusable).
- Color autoset: when adding, already random; expose in editor.

### 7. "Add System" → list installed apps ☑ Fable

**Why:** Typing a path is unfriendly.
**How:** Backend `GET /api/installed-apps` — enumerate Start Menu `.lnk` shortcuts (`%ProgramData%\Microsoft\Windows\Start Menu`, `%APPDATA%\…\Start Menu`) resolving target + icon (PowerShell `WScript.Shell`), plus Steam manifests (reuse `GameScanner`). The + card opens a searchable picker; choosing one adds it to `settings.apps`.

**Done:** `GET /api/installed-apps` (cached; Start Menu .lnk + Steam, plus macOS `.app` / Linux `.desktop` from the cross-platform work). `InstalledAppsPicker` in `AppLauncher` is the searchable modal the + card opens; picking one adds it (with real icon + avg colour via `/api/app-meta`).

### 8. Icon picker (all lucide icons) ☑ Fable

**How:** A modal grid listing `Object.keys(lucide.icons)` with a search box; selecting writes the name. Reused by the App Editor (#6) and accounts. Virtualize/paginate (lucide has ~1.5k icons) to keep it fast.

**Done:** `IconPicker.tsx` — searchable lucide grid, focus-navigable, reused by the App Editor and the Accounts panel.

---

## TIER 3 — Accounts & input settings · Fable (Opus optional for accounts design)

### 9. Accounts (gamertag + color + stats/history) ☑ Fable / Opus-optional

**Why:** Identity + lightweight stats; not real auth.
**How:** Backend: new `config/accounts.json` via an `AccountsService` (id, gamertag, colorHex, icon, createdAt, stats:{appsLaunched, lobbyTime, …}, history:[{type, ts, detail}]). REST: `GET/POST/PATCH/DELETE /api/accounts`. Record events (app launched, joined) from the socket/launcher paths. New **Account tab** on the dashboard showing the active account, stats, and history.

**Done:** `AccountsService` (+ `config/accounts.json`) with `stats:{appsLaunched, videosQueued, jumps, slams}` + history; full REST CRUD + active-account + device assignment; events recorded from the socket paths (app launch, queue, jump, slam). `AccountsPanel` shows accounts, stats, collapsible history, create/edit (gamertag/colour/icon), and the per-device "playing as" + disconnect controls (#10).

### 10. Per-device account dropdown + runtime color ☑ Fable

**How:** Each connected device (console keyboard slots, gamepads, phones) gets a dropdown on the Account tab to pick which account it's "playing as", and a color swatch editable at runtime (updates the cube color live via `playerManager` + lobby sync). Persist device→account in `accounts.json`.

**Done:** `AccountsService` gained a persisted `deviceMap` + `assignDevice()` and `POST /api/accounts/assign`. The Accounts panel shows a **Devices in lobby** section: each cube gets a dropdown of accounts. Picking one broadcasts `accounts_updated` (now carrying `deviceMap`); `App.tsx` recolors/relabels the live cube via the new `LobbyScene.setPlayerCosmetic()` and births future cubes with the assigned color (`cosmeticFor()`). Verified via API probe (assign → map set, null → cleared, account delete cascades).

### 11. Input device settings ☑ Fable

**How:** A Settings "input" sub-section already has deadzone/repeat; expand to per-device rows (detected keyboards/gamepads/phones) with deadzone + an enable toggle + which player-slot. Stored under `settings.input.devices`.

**Done (reworked to full input REMAPPING per user clarification):**

- **Profiles:** `settings.input.mappings.<name>` = `InputMapping { type, buttons, keys, axes:{move,spin} }`. Built-ins `Gamepad` / `WASD` / `UHJK` replicate the historical hardcoded bindings (plus new: gamepad **B1 = back**, **right stick = spin** locally, keyboard **Esc = back**). `settings.input.devices.<id>` = `{ enabled, deadzone, mapping }`.
- **Runtime:** `deviceSettings.mapping(deviceId)` resolves assigned profile → built-in fallback; `inputManager` is fully mapping-driven (keyboard keys, gamepad button indices, axes pairs; jump/back edge-triggered; spin stick emits a local `spin` action that `App.tsx` routes to `applySpin`). Disabled-device filter + per-device deadzone kept.
- **UI:** device rows in **both** the Accounts panel ("Devices in lobby") and the Settings modal show `device · kind · mapping-dropdown · edit`. Edit opens the new **`MappingEditor`** — profile picker/rename, one-by-one binding (dropdown per gamepad button/axes-pair, key-capture for keyboards, per-row "Set"), and a **Remap wizard** that walks every control in order waiting for real input ("Pad Up… waiting", then "Rotate joystick 1 around" / "Rotate joystick 2 around" — sticks detected by axis travel range, the move pair excluded when binding spin). Save writes the profile to storage and assigns it to the device. Raw `input.mappings.*` rows are hidden from the flat settings list.
- Verified by probe: built-ins deep-merge into existing settings; saving a custom profile + assignment round-trips. Phones show no mapping UI (virtual input).

**Follow-up — non-standard controllers (cheap USB pads, `mapping: "n/a"`):** A binding source is now `button index | axis-half ("a3+"/"a3-") | POV hat ("h9:-1.000")`, so D-pads on a hat axis, D-pads on two half-axes, and analog triggers all bind. New `services/gamepadSource.ts` (`sourceActive` runtime, `captureSource` remap detection, `sourceLabel`); `inputManager` reads gamepad controls through `sourceActive`; the editor's button capture diffs against a per-capture baseline (buttons beat axes), learns the hat's out-of-range neutral so sequential D-pad steps don't mis-bind, shows axis/hat bindings as a chip (not the numeric dropdown), and surfaces a "non-standard controller — use Remap" banner when `gamepad.mapping !== "standard"`. Also fixed the editor's inline `Row` component remounting (dropped `<select>` focus mid-edit). Verified hat/axis string sources round-trip through the settings PATCH.

---

## TIER 4 — Queue · Fable

### 12. Better + "legal" queue ☑ Fable

**Why:** Pending/retry logic is flaky; YouTube downloading via yt-dlp is legally fraught.
**How:**

- Robustness: dedupe by URL, fix the "stuck pending" (timeout if no ack), clearer error toasts, don't show a perma-spinner on 404 thumbnails.
- Legal: gate yt-dlp behind an explicit, default-OFF setting `media.allowExtraction` with an in-UI disclaimer ("only content you're authorized to use"); otherwise accept only direct media URLs (`.mp4/.mp3/...`) and local files. Document in LEGAL.md (#16).

**Done:**

- **Dedupe by URL** — `addToQueue` already rejects a URL already queued or in-flight ("Already in the queue").
- **Legal gate** — `media.allowExtraction` (default off) gates non-direct URLs; direct media files/locals always allowed; DRM hosts fast-rejected with a clear message. Disclaimer shown in both the console Footer and phone MediaTab; documented in LEGAL.md (#16).
- **Stuck pending** — root cause found: `downloadThumbnail` had **no timeout** (a hanging thumbnail host kept the item "pending" forever). Now bounded to 10s + treats non-OK as failure; the thumbnail is best-effort so it just proceeds without it. (`getVideoInfo` was already bounded to 60s.)
- **Clearer error toasts** — console already toasts `queue_add_failed`/`video_error` + clears the pending card; the **phone MediaTab now does too** — a transient red banner shows the backend's reason (DRM / extraction-off / dead URL) instead of failing silently.
- **No perma/broken thumbnail** — the console queue `<img>`s get a guarded `onError` → fall back to the default thumb when a cached jpg 404s (no broken-image icon, no loop).

(Separate, still open: **POLISH "make the remote media tab interact with the queue"** — the phone MediaTab keeps local seed state and renders the old mock item shape, so it doesn't yet reflect the live server queue. Tracked below.)

---

## TIER 5 — Packaging / distribution

### 13. Autorun at Windows startup ☑ Fable

**How:** Installer `[Registry]` HKCU `…\Run` entry, gated by a `[Tasks]` checkbox ("Start JDrakoon3 when Windows starts"); mirror as a Settings toggle that writes/removes the same registry value at runtime.

**Done (single-owner via the in-app toggle):** new `settings.system.autostart` (boolean, default off) is the single source of truth — it renders automatically as a toggle under a new **system** group in Settings (deep-merges into existing config). New `AutostartService` writes/removes `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\JDrakoon3` via PowerShell `-EncodedCommand` (no shell-quoting pitfalls; the value is stored wrapped in real quotes so a spaced install path still launches). `launcher.cs` hands the backend its own exe path via the `JD_EXE_PATH` env var so the Run entry points at the real launcher; `index.ts` reconciles on boot **and** subscribes to settings changes (toggle takes effect immediately). Windows-only / no-ops in dev when `JD_EXE_PATH` is unset. Verified the reg write/remove round-trips on Windows (spaced path stored as `"C:\Users\test user\...\JDrakoon3.exe"`, cleanly removed). **Deliberately skipped the installer `[Tasks]`/`[Registry]` opt-in:** it would fight the launcher's boot reconcile (default-off setting would delete an installer-set key on first run); controlling it from Settings is the clean, conflict-free design.

### 14. "No Node.js prompt" ☑ Fable

**Why:** Windows Firewall prompts when Node first listens on the LAN. The phone needs LAN access, so we can't just bind to localhost.
**How (options, pick one):** (a) Installer adds a firewall rule for `node.exe`/port 3001 via an elevated `netsh advfirewall` step (one UAC at install only); (b) ship a code-signed exe to kill SmartScreen (costs $). Recommend (a). If the prompt they mean is SmartScreen on the unsigned launcher, that's signing-only.

**Done (chosen: runtime one-time rule, keeps the no-admin installer):** `launcher.cs` → `EnsureFirewallRule()` runs on first launch (after `WipeKioskProfile`, before `StartBackend`). It checks for our inbound rule via `netsh advfirewall firewall show rule name="JDrakoon3"` (no admin needed); if missing, adds `dir=in action=allow protocol=TCP localport=3001` via an **elevated** `netsh` (`ShellExecute` + `runas` verb → a single UAC prompt, hidden window). A `firewall.applied` marker in `%LOCALAPPDATA%\JDrakoon3` means it never re-prompts — including if the user cancels the UAC (Win32 1223 caught), where Windows' own "Allow access" dialog is the fallback. Installer/`installer.iss` unchanged (still per-user, `PrivilegesRequired=lowest`). Launcher recompiles clean (112 KB).

### 15. Branded window icon / WebView ☑ Opus (WebView2)

**Why:** Edge kiosk shows the Edge icon in Alt-Tab/taskbar.
**How:** Proper fix = replace Edge `--kiosk` with a **WebView2 host** (C#, our icon, no Edge chrome, full control of close → also fixes branding and gives reliable lifecycle). This is a meaningful rewrite of `launcher.cs`'s kiosk piece → **Opus**. Cheap partial: ensure the dashboard favicon is the Drakoon icon (Fable).

**Done:** `launcher.cs` now hosts a borderless, fullscreen WinForms window with WebView2 (`RunWebView2Kiosk`) — our `drakoon.ico` + "JDrakoon3" title in Alt-Tab/taskbar, no Edge chrome, default context menus / devtools / accelerator keys off, backend-death closes the window. If the WebView2 **runtime** is missing it falls back to the old Edge `--kiosk` (`RunEdgeKioskBlocking`) so nothing regresses. `build-release.ps1` fetches the WebView2 SDK from NuGet (`Ensure-WebView2`, cached in `webview2/`), compiles with the wrapper DLLs referenced, and ships `Microsoft.Web.WebView2.Core/WinForms.dll` + `WebView2Loader.dll` next to the exe. Compiled clean (111 KB exe).

### 16. Full license + LEGAL ☑ Fable

**How:** Add root `LICENSE` (recommend MIT for your code; confirm choice), set `license` in all three `package.json`, add `LEGAL.md` (yt-dlp usage = user's responsibility; ties to #12), link from README.

**Done:** `LICENSE` (MIT) + `license` in the package.json's were already present; added **`LEGAL.md`** (media queue is off by default + gated, DRM services rejected, user responsibility, third-party components, no-warranty) and linked it from the README License section.

---

## TIER 6 — Visual polish · Fable

### 17. App row depth: side cards shrink + gradient edge mask ☑ Fable

**Why:** When apps overflow, edges should fade/shrink for depth.
**How:** Scale cards by horizontal distance from center (transform: scale + slight Y), and a CSS mask-image gradient on the row. **Caution:** `mask-image` + `backdrop-blur` can break the frosted glass on Chromium — test; if it kills the blur, fade with an overlaid gradient `::before/::after` instead of `mask-image`, and apply `scale` per-card rather than masking the container.

**Done:** Each `AppCard` gets a `depth` (distance in cards from the focused card, via `useFocus().focusedId`) driving per-card `scale` (−4.5%/card, cap 16%), `translateY` sink (5px/card, cap 18px) and opacity dim (cap 50%) through the existing 500ms transition; neutral when focus is outside the row. Edge fade uses **overlaid gradients** (left/right `from-[#04040a]`) — NOT `mask-image`, per the backdrop-blur caution — and only renders when the row actually overflows (`scrollWidth > clientWidth`, rechecked on resize/app-list changes).

---

## TIER 7 — Cross-platform · Opus (large)

### 18. macOS / Linux support ☑ Opus (native packaging is the only remainder)

**Why:** Every native layer is Windows-only (PowerShell input driver, `WindowedLauncher`, `launcher.cs`, Inno installer, Edge paths, yt-dlp `.exe`).
**How:** Introduce a platform abstraction for input simulation (Win: current PowerShell; mac: CGEvent via a helper; Linux: `xdotool`/`ydotool`) and app launching (`open`/`xdg-open`). Per-OS launcher + packaging (mac `.app`/dmg, Linux AppImage). yt-dlp per-platform binary. Large, multi-file, ambiguous → Opus.

**Done (core runtime):** Added `backend/src/platform/` (OS detection, `ytDlpBinaryName()`, `commandExists()`). Refactored input into `backend/src/services/input/` — `InputBackend` interface + Windows (existing PowerShell, behavior-preserving), Linux (`xdotool`/`ydotool`), macOS (`osascript` + `cliclick`) backends, selected at runtime; `InputControlService` keeps coalescing/normalization and its public API is unchanged (no caller edits). App launching now dispatches via `services/launcher.ts` → `WindowedLauncher` (Win) or new `PosixLauncher` (`open`/`xdg-open`/PATH-cmd/spawn + PID exit tracking). yt-dlp binary + `chmod +x` are platform-aware. Backend builds clean and Windows boot is unchanged (verified: 95 apps, input driver intact).

**Done (launcher + discovery):** New `launcher.mjs` — a pure-Node cross-platform launcher mirroring `launcher.cs`'s lifecycle (free port 3001 via `lsof` → start backend with the same node → poll `/api/version` → open Chrome/Chromium/Edge/Brave in `--kiosk` with its own profile → tear down when kiosk OR backend exits; default-browser fallback; logs to `~/.jdrakoon3/`). `scripts/`: `run-macos.command`, `run-linux.sh`, `jdrakoon3.desktop` (menu/autostart). `/api/installed-apps` now also enumerates macOS `/Applications/*.app` and Linux `.desktop` entries (Name/Exec, field codes stripped). Syntax-checked + backend builds clean.

**Still TODO (needs a Mac/Linux box to produce + test):** native single-file packaging — macOS `.app`+`.dmg` (and optionally a chrome-less `WKWebView` host) and a Linux **AppImage** bundling a per-OS Node runtime. Tracked in [CROSS-PLATFORM.md](CROSS-PLATFORM.md).

---

## TIER 8 - Additional things i tought of

- ☑ **combo autocomplete popup** — phone TouchpadTab: when the line starts with `.`, a chip row suggests the next token (modifiers → named keys → mouse actions), prefix-filtered by what's typed and excluding already-chosen tokens; tap to complete (keeps the keyboard up). `couch-remote/.../TouchpadTab.jsx` (`COMBO_TOKENS`, `comboSuggestions`).
- ☑ **fix `.ctrl click` / `.tab`** — `.tab` already worked (single-key combos tap fine). `.ctrl click` failed because the combo system is keyboard-only — it held Ctrl and tapped a nonexistent "click" key. Added a **modifier+mouse-click** primitive: `InputBackend.comboClick(mods, button)` (Windows PS `Y` command holds mod VKs → `mouse_event` click → release; Linux `xdotool keydown…click…keyup`; macOS `cliclick kd:/c:/ku:`). `InputControlService.combo()` routes a trailing `click`/`rightclick`/`rclick` token to `comboClick`. So `.ctrl click`, `.shift click`, `.ctrl rightclick` all work.
- ☑ **app open/close reliability (launcher-spawned tracking)** — root cause: `WindowedLauncher` tracked the PID **we spawned**, but launchers (Steam `steam://`, bootstrapper exes) run the real game as a _different_ process → spawned PID exits (false "closed") or no PID at all (uncloseable). Rewrote the PS script to snapshot windowed processes before launch, then watch for a NEW one to hold the foreground ~1s — that's the real app; emit `TRACK <pid>`, and track/kill (`/T` tree) that. New markers `TRACK`/`DETACHED` handled in the stdout parser; `app.pid` is overridden to the real pid (also rewrites the running-file). Handles steam:// + bootstrapper exes; `DETACHED` (no window) reports ready so the UI doesn't hang.
- ☑ **SoundCloud (+ Spotify clarified)** — SoundCloud already works via yt-dlp once extraction is on (non-direct URL → extraction path; no allowlist blocks it). Added a **DRM fast-reject** in `VideoQueueService.addToQueue` for Spotify / Apple Music / Tidal / Deezer / Netflix / Max / Disney+ / Prime (can't be extracted — yt-dlp can't fetch encrypted streams) with a clear message instead of a slow cryptic failure. YouTube/SoundCloud/Vimeo/Bandcamp are explicitly _not_ listed.
- ☑ **machine name + port (stable phone link)** — `/qr-code` now also returns `host`/`hostUrl`/`hostSvg` (`http://<machine-name>:3001/phone`). `PhoneQR` has a toggle: **This network** (IP, always connects on the current LAN — default) ⇄ **Any network** (machine-name link to bookmark once; resolves via NetBIOS/mDNS, not guaranteed on every network, hence not default).
- ☐ **torrents** — **declined for now.** Needs a torrent/streaming engine (e.g. WebTorrent) + piece-prioritized streaming, is heavy, and is legally fraught (same class as the yt-dlp concern but worse). Revisit only with a clear legal stance + an opt-in gate like `media.allowExtraction`.
- ☑ **auto-update actually fires + offline handling** — **root cause:** both the launcher and the app polled GitHub `/releases/latest`, which **404s when every release is a pre-release** (the Alpha's are) → no update was ever detected. Switched both to the `/releases` LIST and take the newest non-draft (pre-releases included): `launcher.cs` (startup) + new `SystemStatusService` (runtime). New `SystemStatusService` polls connectivity (lightweight 204 probe, ~2.5s offline / 10s online) and checks GitHub for a newer build (≤ every 15 min while online); `GET /api/status` ({version, lan, lanIp, online, updateAvailable, latestVersion, applying}); `POST /api/update/apply` downloads the newest Setup.exe and runs it silently (no git/secret — replaces the unusable git-based `/api/update`). Console: shared 1s poller `services/systemStatus.ts`; **TopBar** shows an Offline pill + an Update badge and auto-applies per `settings.autoupdate` (or shows the reminder modal); **PhoneQR** hides the QR and shows "Offline — no phone pairing" when there's no LAN, auto-recovering when the network returns. Verified: `/api/status` now reports `latestVersion: 3.0.2` (was null); the dev box stays `updateAvailable:false` only because it's already 3.0.4 > 3.0.2.
- ☑ switch to custom dropdowns — done (the portal `Dropdown`, see POLISH "custom dropdown instead of html dropdown").
- ☑ switch to custom yes/no modals instead of alerts — done (`confirm()`/`notifyModal()` + `ConfirmHost`, see POLISH "custom yes/no modals instead of alerts").
- ☐ accept inputs from mobile devices with physical inputs
- ☐ spoof actual controller inputs so platforms like Switch can detect it (virtual gamepad via ViGEm — Windows-only, driver install)

## TIER 9 — Lobby cube gameplay · Fable

### 19. Slam attack (air stomp + shockwave) ☑ Fable

**Why:** The lobby cube only had move/jump/spin — no way to interact with other cubes. A slam gives the lobby a playful combat-y verb.
**How / Done:**

- **Mechanic** (`LobbyScene.ts`): new logical action `slam`, air-only (gated by the same downward-raycast `isGrounded` helper that now also gates `jump`). It drives the cube straight down (`SLAM_DOWN_SPEED`, heavier gravity); the landing is detected in `physicsStep`, which fires `triggerSlamImpact` once — every other cube within a radius is launched radially outward (stronger near centre) + tumbled, with a particle ring (`spawnSlamBurst`) and a decaying camera shake.
- **Height-scaled power:** `slam()` records the start Y; the landing computes `fallDist → power` (`fallDist / SLAM_REF_HEIGHT`, clamped `0.4–2.4`). Radius, knockback, spin, shake, and particle count/speed/size all scale with `power`, so a dive off a stack hits far harder than a hop-and-slam.
- **Slam-cancel rebound:** landing arms a brief window (`SLAM_BOUNCE_WINDOW`); a jump inside it rebounds the cube back to ~`SLAM_BOUNCE_FRAC` of the slam height (`v=√(2·g·h)`, gravity scale forced to 1), capped at `SLAM_BOUNCE_MAX_H`. Both maps cleared on respawn so an edge-slam carries no stale state.
- **Bindings:** Gamepad **Y** (button 3), keyboard **WASD=c / UHJK=m** (added to `defaultSettings` mappings + the `MappingEditor` control lists + remap wizard; UHJK jump set to `n`). Plumbed through `inputManager` (edge-triggered), `DeviceAction` type, and `App.tsx` → `sceneRef.slam`.
- **Remote:** phone **X = jump, Y = slam** (matches the console gamepad). `InputService` menu focus maps `buttons.x→jump`, `buttons.y→slam`; `App.tsx`'s socket `action` handler routes `slam`; slams counted on the active account (`AccountStats.slams`, counter-only — no history spam) and shown in the Accounts panel.

### 20. Dead phone actions: lobby `emote` + `home` ☑ Fable

**Why:** `InputService` emits `{type:"emote", emote:"wave"/"hype"}` (phone X/Y in **lobby** focus) and `{type:"home"}` (phone START), but the console's socket `action` handler only processes navigate/confirm/back/jump/slam — so those actions are silently dropped (no emote visuals exist; START does nothing).
**Done:** **`home` now works** — `App.tsx`'s socket `action` handler routes `{type:"home"}` (phone START, emitted in menu focus) to `appState.transition("HOME") + resetToRoot()`, same as the existing `home` socket event. **`emote` removed** — the entire `"lobby"` focus branch in `InputService` was dead (`setFocus` is only ever `"menu"`/`"fullscreen"`, never `"lobby"`), so its unhandled `emote` emit was deleted (option b) rather than inventing emote UX/visuals for an unreachable path. Left a comment documenting that the dashboard runs in menu focus.

## Build order I'll follow

Tier 1 (now) → 5 → 6/7/8 (app mgmt) → 16 (license, quick) → 13 (autorun) → 12 (queue) → 9/10/11 (accounts/input) → 17 (polish) → 14/15 → 18.

Verification per tier: `build-release.ps1 -SkipBuild` (compiles launcher + reassembles), backend `npm run build`, console/remote `npm run build`; for input/cube changes, run the exe and confirm via logs + a quick socket probe.

# POLISH

- ☑ **custom dropdown instead of html dropdown** — new `Dropdown` (portal menu, never clips in scroll/modal containers, flips up near the bottom). Swapped the native `<select>`s in AccountsPanel (account + mapping), SettingsModal (mapping), MappingEditor (profile / axes / B0-B16).
- ☐ no port needed for the link. also this doesnt work on phone. is this even possible to do — **deferred for alpha** (per decision): keep the `:3001` link; revisit later (would need binding port 80 or mDNS `.local`, with phone-side caveats).
- ☑ **carousel rework** — dropped the dark gradient scrim (it was a fixed `#04040a` band that didn't match the animated 3D background). The row is now a real focus-following carousel: a horizontal scroller (`overflow-x-auto`, scrollbar hidden, `px-[50%]` so the first/last card can reach centre) that **clips its edges cleanly** (reveals the live background, no band) and `scrollIntoView({inline:"center", behavior:"smooth"})` keeps the focused card centred (+ a re-centre after the grow transition). No `mask-image`/`opacity` on the scroller, so the cards' `backdrop-blur` stays intact. (Focus-nav wrap last→first is unchanged — tell me if you want no-wrap so it doesn't smooth-scroll all the way back.)
- ☑ **remote login screen fits when rotated** — was a single centered column (`min-h-screen justify-center`, no scroll) that clipped in landscape. Wrapped header + form in a `.login-card` and added an `@media (orientation: landscape)` rule: header sits **beside** the form (row), logo/margins shrink, form spacing tightens, root padding reduces, and `overflow-y-auto` is a safety net for very short screens. Portrait is unchanged.
- ☑ **real windows icons + avg colour + clean name** — new `AppIconService` extracts an .exe/.lnk's icon to a cached PNG (PowerShell `System.Drawing.Icon.ExtractAssociatedIcon` via `-EncodedCommand`; resolves `.lnk` targets via WScript.Shell) and computes the icon's average non-transparent colour. `/api/app-icon` now streams that PNG for exe/lnk paths (images still stream directly); new `/api/app-meta?path=` returns `{ color, name, hasIcon }`. When adding a file app, `addApp` sets `hex = avg colour`, `name = clean name`, and `icon = the launcher path` (so the card shows the real icon); protocol URIs (steam://) keep a lucide icon + random hue. `AppCard` falls back to lucide on image load error. Windows-only (others fall back to lucide). Verified: notepad.exe → name "Notepad", colour #94bcc3, 2.6 KB PNG.
- ☑ **Wire the phone system buttons** — new backend `socket.on("system")` (home / settings / back / shutdown); the phone's `action`-type menu/power events were previously dropped entirely. HOME closes any running app + sends the console home; MENU opens the dashboard Settings (`open_settings` → existing `open-settings` window event); POWER opens a **phone-side confirm modal** then triggers an OS shutdown (`shutdown /s` / osascript / systemctl); BACK keeps the `b`-button path (→ goBack in menu, ESC in a running app — already context-aware).
- ☑ **HOME raises the dashboard to the foreground** — closing an app (HOME / Close App / app self-exit) now brings the JDrakoon3 kiosk window back to the front + focus. New backend `focusKiosk()` (PowerShell + user32 `SetForegroundWindow`, the same Alt-tap foreground-steal the launcher uses for launching) finds our window by `JD_EXE_PATH` (WebView2 host runs in the launcher process) → title "JDrakoon3" → `msedge` fallback; debounced, Windows-only, no-op in dev. Called from the `home`/`close_app`/`onExit` paths. Console-side, `app_closed` now also `resetToRoot()` so a tile is focused. (Windows doesn't reliably hand focus back to a borderless window when the foreground app dies.)
- ☑ **per-device disconnect button (accounts page)** — each row in "Devices in lobby" gets an Unplug button. New backend `kick_player` socket handler: phones are socket-backed → it `emit("kicked")` + `disconnect(true)` them (the phone's new `kicked` handler calls `socket.io.reconnection(false)` so it stays gone instead of silently rejoining ~1s later), and their own disconnect handler emits `player_left`; console-local keyboards/gamepads have no socket → it just broadcasts `player_left` so the console drops the cube. Button emits `kick_player {playerId}` via `getSocket()`.
- ☑ **in the lobby: click a player → Accounts focused on them** — `LobbyScene.pickPlayerId(x,y)` raycasts the cube meshes (maps hit → playerId; CRT curvature makes it approximate at the edges, exact for the central cubes). App listens for document clicks during HOME and, for "background" clicks only (ignores `button/a/input/[data-tip]/[data-app-card]/.queue-card/.rv-slider/.fixed` so UI + app cards + overlays still work), raycasts and dispatches `open-accounts {playerId}`. TopBar opens the Accounts panel and passes `focusDeviceId`; the panel scrolls that device's "Devices in lobby" row into view and flashes an indigo ring (~1.8s). Canvas stays `pointer-events-none` — clicks land on the transparent dashboard above the canvas and bubble to the document handler, which raycasts the 3D scene independently.
- ◐ webview icon still not custom — **icon pipeline verified correct**: launcher compiles with `/win32icon:drakoon.ico` (embedded EXE icon), sets `form.Icon` from `drakoon.ico` (copied into the release by `build-release.ps1`), and the WebView2 window title is a fixed `"JDrakoon3"` (never bound to the page). The one non-branded leak found + fixed: the dashboard/remote HTML `<title>` was `couch-console`/`couch-remote` (now `JDrakoon3` / `JDrakoon3 Remote`) and the console favicon now points at the explicit `drakoon.svg`. If the taskbar icon still looks generic in a packaged build, it's almost certainly the **Windows icon cache** (clears on reboot / `ie4uinit -show`), not the wiring — needs a visual confirm on a fresh install.
- ☑ **CRT intensity slider** — new `display.crtIntensity` (0–100, default 100). The CRT shader gained an `intensity` uniform that scales every effect (curvature blend, wobble, vignette, VHS tear, chroma, scanlines, flicker, noise) so 0 = clean passthrough, 100 = full look. `LobbyScene.setCrtIntensity` (accepts 0–100 or 0–1) drives the uniform; `useLobbyRenderer`/`App` apply it live (alongside the existing on/off `crtEffect` toggle, which keeps the perf fast-path). Renders automatically as a 0–100 slider in Settings via a new `intensity` path heuristic.
- ☑ implement or check implementation of each setting — **CRT + fullscreen fixed** (`setCrtEnabled` was defined but never called; now `useLobbyRenderer(allPlayers, crtEffect)` applies it at scene creation + live, and `App` applies `display.fullscreen` via the Fullscreen API on change). **`media.cacheLimitGB` / `preloadNext` removed** — they were dead (media is streamed, not cached); dropped from the type + defaults, with a load-time migration that prunes them from existing `settings.json` so they vanish from the Settings modal. `media.defaultVolume` + `allowExtraction` are wired.
- ☑ **fix the broken offline tag** — backend now probes 3 captivity endpoints (online = any reachable, so one blocked host ≠ offline); the console poller no longer flips to "offline" on a 404/non-OK (an older backend without `/api/status` was reading as permanently offline) — only a real local-backend failure does.
- ☑ **speed up youtube / stream it** — `/stream` no longer pipes yt-dlp's stdout through Node. It resolves the direct CDN url (`yt-dlp -g -f best[ext=mp4]/best`, cached 5 min) and **302-redirects** the `<video>` to it, so playback streams straight from the CDN (fast start). Direct media URLs redirect to themselves. Falls back to the old pipe only when the source has separate audio/video tracks.
- ☑ **fix seeking** — same change: because the browser now hits a real CDN url (with HTTP `Range` support) instead of an unseekable Node pipe, scrubbing works.
- ☑ **make the remote media tab interact with the queue** — root cause: the phone `socket.js` only forwarded 5 media actions (play/next/prev/add/remove) — volume/mute/seek/move/clear/shuffle/loop all hit `default` and were silently dropped; and `MediaTab` rendered stale local seed state in the old mock item shape (`color`/`channel`/`"5:18"`). Now `socket.js` maps every media action to its backend event with the correct payload (seek in **seconds**, move as **"up"/"down"**, volume `{volume}`, etc. — also fixes RemoteTab's volume slider). `MediaTab` is driven by live server state (`useConsoleState`): real queue list + now-playing + play/loop/shuffle reflect the dashboard; items map `requestedBy` → subtitle, `duration` seconds → `m:ss`, a stable derived accent colour per id; the seek bar works in seconds (with a short guard so server position doesn't fight an active drag); add-failures still surface as the red banner.
- ☑ **console seek bug + pending skeleton everywhere** — (1) the console (TV) seek did nothing: `handleSeek` only sent `media_seek` + set a 2s sync-suppress window but never moved the `<video>`, so the 1s position reporter re-sent the old `currentTime` and reverted it. Now it sets `video.currentTime` immediately (and aligns `lastSyncTime`). (2) phone-added items showed no loading skeleton on the TV — `useMediaPlayer`'s `queue_updated` handler ignored `msg.pendingItems`; now it mirrors the server pending list into `remotePending` and merges it with local optimistic pending (deduped by URL, excluding already-queued). (3) the phone itself showed no skeleton — `useConsoleState` now exposes `pendingItems` and `MediaTab` renders loading-skeleton rows. So a resolving add shows a skeleton on both surfaces regardless of which device added it.
- ☑ **make accounts history collapsable and collapse by default** — per-account "History (n) ▾" toggle, collapsed by default, expands to the last 12 events.
- ☑ **make more things explain themselves on hover** — covered by the branded hover plate below; wired explanatory tooltips onto the icon-only buttons across the dashboard (Footer system + media + queue controls, app edit/delete, account edit/delete/disconnect/mapping/icon, settings reset/delete, dropdowns, the PhoneQR network toggle, lobby player avatars → name, icon-picker icons → name).
- ☑ **make custom hover plate** — new `TooltipHost` (mounted once at the app root): a portal-rendered, branded tooltip (`bg-[#12121c]` / white-10 border / shadow) that shows on hover for any element with a `data-tip` attribute, positioned above the trigger (flips below near the top edge), ~280ms delay, never clips in scroll/modal containers, hides on scroll/wheel. Replaces native `title` tooltips: the `Focusable` wrapper and the `Dropdown` now emit `data-tip` (so all their call sites get it for free), and the remaining icon buttons were converted `title=`→`data-tip=`.
- ☑ make add app apps have their icon — covered by the real-icon extraction above (a dropped/picked file app's card shows its actual Windows icon + average-colour accent).
- ☑ **make the api users/me actually work and show up on topbar** — added `GET /api/users/me` → active account's gamertag, else the OS username (the endpoint simply didn't exist before, so TopBar always showed "Not Signed In").
- ☑ **custom yes/no modals instead of alerts** — imperative `confirm()` / `notifyModal()` service + `<ConfirmHost/>`; replaced every `window.confirm`/`alert` in the console (delete account/app, update errors).
- ☑ **hide the queue disclaimer (− button + setting)** — the "only add content you're authorized to play" note under the queue now has a dismiss (×) button on **both** the console Footer and phone MediaTab; dismissing persists `settings.media.hideQueueDisclaimer` so it stays hidden everywhere and across reloads. The flag also renders as a "Hide Queue Disclaimer" toggle in Settings (auto-hide when enabled). Both surfaces read it on mount and update live (`settings_updated`; added to the remote's forwarded events). Covers both the manual-hide and setting-driven-hide asks.
- ☑ auto join back on remote interaction — confirmed already working (socket.io reconnection + rejoin on connect).
- ☐ remote controller input actually spoof controller input inside applications.

# BIG FUCKIN TASK FOR LATER

- ◐ make it so 2 people can log into an online acc and sync
  (if they have the some of the same apps, those are selectable, others are low opacity and greyed out and unselectable)
  syncing makes inputs sync between consoles over the internet, for each an input history is sent and rechecked so that we know its synced

  **Done (direct-peer MVP):** new `PeerSyncService` — two consoles agree on a shared **sync code** (the stand-in for an "online account": there's no central server, so the code is the room) and one dials the other's address. `socketio_server` accepts peer sockets authenticated by the code (before the token gate); they exchange `peer_hello` (app library + active account) and forward lobby input both ways. **App intersection**: the `SyncPanel` (Footer "Link" button) shows the shared library — apps on both consoles are highlighted/selectable, the rest greyed + locked. **Input sync**: phone input (backend `action` stream) and console-local input (`lobby_input`, throttled) are forwarded to the peer and re-emitted with `peer:`-prefixed ids so each console shows the other's cubes; packets carry a **seq + md5 checksum**, out-of-order/replayed packets are dropped and a checksum mismatch triggers a resync (the "input history rechecked" requirement, basic form). Menu actions never cross the link.
  **Polish:** the sync code is persisted (`settings.sync.code`, restored on boot) so both consoles keep their room; the `SyncPanel` shows the host its own address (`/api/status` lanIp) to hand to a friend.
  **Still TODO / limitations:** real online accounts + NAT-traversal (needs a signalling/relay server — current link is direct, so LAN or a reachable/port-forwarded/VPN address); the input sync is forward-and-apply (presence), **not** deterministic lockstep with rollback; app "selectability" is visual only so far (doesn't yet gate co-launching). Untested live (needs two networked instances). **Gamepad text entry solved** via the new `FocusInput` (registers a text field in the focus graph; A focuses it + opens the on-screen keyboard, which edits it). Adopted across the dashboard: sync code/address, queue "Add URL", Add-System manual path, and account gamertag are all now gamepad-typable. (Settings search left as a plain input — it has an overlaid clear-button and the modal is navigable without it.)
  # other
  - ☑ **youtube list link pasted adds the current video** — `--no-playlist` on every yt-dlp call (info / -g resolve / pipe fallback), so a `&list=…` URL queues only the current video.
  - ☑ **connect accounts to remote** + ☑ **remote has dropdown of accounts** — the phone captures its `playerId` from the join ack; new `AccountPicker` in the phone Header lists accounts (`GET /api/accounts`) and assigns this device (`POST /api/accounts/assign`), showing the chosen account's colour/name.
  - ☑ **actual account name shows up for music added by** — `queue_add` now resolves `requestedBy` to the account gamertag the adding device is "playing as" (`AccountsService.gamertagForDevice(deviceMap[playerId])`), falling back to the typed name.
  - ☑ **smart detection for apps that dont use joystick input** — backend tags each launch `isGame` (shared `gameHeuristic`); a non-game app makes the console auto-enable gamepad **mouse mode** on `app_launched` (right stick → OS cursor, RB/LB click) so you can drive a cursor-only app, with a toast; cleared on `app_closed`. (True XInput-usage detection isn't feasible, so "not a game" is the proxy. The on-screen keyboard can't overlay a foreground app — the kiosk is behind it — so that half stays a dashboard tool.)
  - ☑ **right joystick controls mouse outside of apps, RB/LB click** — **decided: keep cube-spin, add a toggle.** On the dashboard, **Select** toggles mouse mode; while on, the right stick drives the OS cursor (throttled `control {move}` from the console socket) and **RB = left-click, LB = right-click**. Gated to the dashboard (`inputManager.setDashboardActive(state==="HOME")`, reset on app launch); a toast confirms on/off. Cube-spin is unchanged when mouse mode is off.
  - ☑ **start button → on-screen keyboard (gamepad)** — new `VirtualKeyboard`: **Start** toggles it on the dashboard; navigate the key grid with the d-pad/stick (focus engine, layer "vkb"), A presses, B closes, shift toggles case. If a dashboard text field was focused when it opened, keys **edit that field directly** (React-safe native-setter + `input` event; backspace/enter handled); otherwise they send real **OS keystrokes** via the `control` channel. Caveats: can't overlay a *foreground app* (kiosk renders behind it); and plain text inputs aren't in the gamepad focus graph yet, so pure-gamepad users still need to focus a field by mouse/touch first (follow-up: gamepad-focusable inputs).
  - ☑ **smartly detect which apps might be games, surface them first in Add System** — `/api/installed-apps` tags each app `game` and sorts games first; the picker shows a "GAME" badge. **Made more sophisticated:** expanded store/engine/launcher keyword set (Epic/GOG/Riot/Ubisoft/EA/Battle.net/Rockstar/Xbox/Unreal/Unity/Godot/…), a **non-game exclusion list** (Office/browsers/editors/utilities) to cut false positives, and a **"big app = game" size check** (a direct `.exe` launcher over ~80 MB is treated as a game).
  - ◐ **start.ps1 kiosk icon** — start.ps1 finds the kiosk window by a loose `*JDrakoon3*` title match (Edge appends to the title), broadened the process search + retry to 15s, and pushes `drakoon.ico` via `WM_SETICON` (ICON_BIG/SMALL/SMALL2). This fixes the Alt-Tab/title-bar icon; if the **taskbar** still shows Edge it's Edge's AppUserModelID window-grouping (a known Edge-kiosk limitation — the packaged WebView2 host shows the icon correctly). The real fix for dev parity is using the WebView2 host.
  - ☑ **right-stick rotation: global axes + gentler** — `applySpin` now rotates around **world** axes (horizontal = yaw/Y, vertical = pitch/X, no roll) at a lower force (SPIN 7→3.5) so direction is consistent regardless of how the cube is tumbled.
  - ☑ **one input can't move two cubes** — the two keyboard slots share one physical keyboard, so a key is now claimed by the first slot that uses it (continuous movement via a per-frame claimed-set; edge jump/slam/back via a break after the first match) — overlapping bindings no longer drive both cubes.
