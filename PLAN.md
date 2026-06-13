# JDrakoon3 — Alpha Feature Backlog (prioritized)

Ordered by **impact ÷ effort/risk**. Each item notes the **model** I'd use:
**Fable** (default — I can do it well) or **Opus** (genuinely architectural / cross-cutting / high-ambiguity).

Legend: ☐ todo · ◐ in progress · ☑ done

---

## TIER 1 — Quick wins, high visible payoff (build first) · Fable

### 1. Touchpad immediacy + "waiting" visual ☐ Fable

**Why:** First gesture feels laggy because `InputControlService` spawns its PowerShell driver lazily on the _first_ command (`ensureProc`, ~hundreds of ms). Also no feedback that a tap registered.
**How:**

- Backend: add `inputControl.warm()` (just calls `ensureProc()`); call it in `socketio_server.ts` on `join` (and on first `control` packet) so the OS driver is hot before the user touches anything.
- Phone `TouchpadTab.jsx`: on `pointerdown` render a quick expanding ripple at the touch point (pure CSS, local) for instant "input received" feedback; show a subtle "connecting…" dot until the first `control` ack returns.

### 2. App icons: lucide fallback + custom image-path icons ☐ Fable

**Why:** Empty icon field shows a bare letter; users want real icons, and a path to a `.png/.ico` should show that image.
**How:**

- `AppCard` in `AppLauncher.tsx`: if `app.icon` looks like an image (`http(s)://`, `file:`, contains `/` or `\`, or ends `.png/.jpg/.ico/.svg/.webp`) → render `<img src=...>` (local paths go through a new backend `GET /api/app-icon?path=` that validates + streams the file). Else if it's a valid lucide name → render that. Else (empty/unknown) → default lucide `AppWindow` (not a letter).
- Backend: `GET /api/app-icon` in `index.ts` — validate the path is an existing image file, stream with correct content-type.

### 3. `.`-prefixed text → key-combo commands (e.g. `.ctrl c`) ☐ Fable

**Why:** Power users want to send Ctrl+C etc. from the phone.
**How:**

- `InputControlService.ts`: add PowerShell `X <mods> <key>` command (mods like `ctrl+shift`, key like `c`/`enter`/`f4`) → maps names→VK, holds modifiers, taps key, releases. Add TS `combo(spec)`.
- `socketio_server.ts` control handler: `case "combo": inputControl.combo(pkt.combo)`.
- Phone: `inputActions` add `KEY_COMBO`; `socket.js` `case "KEY_COMBO" → control {kind:"combo", combo}`. `TouchpadTab.sendText`: if input starts with `.`, strip it and send the rest as a combo; else send as text.

### 4. Right stick rotates the cube ☐ Fable

**Why:** Fun, and the right stick is currently redundant with the touchpad for mouse.
**How:**

- Phone `RemoteTab.jsx`: right stick → `CUBE_SPIN {x,y}` (drop its mouse-move role; the Touchpad tab owns the mouse).
- `inputActions` add `CUBE_SPIN`; `socket.js` → `input:event { spin:{x,y} }`.
- Backend `InputService.processInput`: read `packet.spin`, always emit `{type:"spin", playerId, x, y}` (cube exists in any focus).
- `App.tsx`: `case "spin"` → `ensurePlayerExists` + `sceneRef.applySpin(playerId, x, y)`.
- `LobbyScene.applySpin`: `body.setAngvel({ x: y*SPIN, y: 0, z: -x*SPIN }, true)` (SPIN≈7); released stick damps out naturally.

---

## TIER 2 — App management overhaul · Fable (sizable)

### 5. Settings deletion support (foundation for everything below) ☐ Fable

**Why:** `deepMerge` can't remove keys, so apps/accounts can't be deleted.
**How:** Backend: support a sentinel — when a PATCH leaf value is the string `"__delete__"` (or `null` for app entries), delete that key instead of merging. Implement in `SettingsService.update` (post-merge prune pass) or a dedicated `DELETE /api/settings/app/:id`. Prefer a small `deleteApp(id)` + `DELETE /api/apps/:id` endpoint — explicit and safe.

### 6. Per-app editing UI + delete (mouse-first) ☐ Fable

**Why:** Editing apps by hunting flattened `apps.steam.hex` rows is clumsy; users want a card with edit/delete.
**How:**

- `AppLauncher.tsx`: on the focused/hovered card show a small **edit** (pencil) and **delete** (trash) button, **mouse-clickable** (not in the keyboard focus graph). Edit opens an **App Editor** modal (name, launcher, color picker, icon picker). Delete calls `DELETE /api/apps/:id`.
- `SettingsModal.tsx`: render the `apps` group as **one sub-card per app** (name heading, its fields grouped, a Delete button) instead of flat `apps.x.y` rows. Keep keyboard nav working (each app card or field is focusable).
- Color autoset: when adding, already random; expose in editor.

### 7. "Add System" → list installed apps ☐ Fable

**Why:** Typing a path is unfriendly.
**How:** Backend `GET /api/installed-apps` — enumerate Start Menu `.lnk` shortcuts (`%ProgramData%\Microsoft\Windows\Start Menu`, `%APPDATA%\…\Start Menu`) resolving target + icon (PowerShell `WScript.Shell`), plus Steam manifests (reuse `GameScanner`). The + card opens a searchable picker; choosing one adds it to `settings.apps`.

### 8. Icon picker (all lucide icons) ☐ Fable

**How:** A modal grid listing `Object.keys(lucide.icons)` with a search box; selecting writes the name. Reused by the App Editor (#6) and accounts. Virtualize/paginate (lucide has ~1.5k icons) to keep it fast.

---

## TIER 3 — Accounts & input settings · Fable (Opus optional for accounts design)

### 9. Accounts (gamertag + color + stats/history) ☐ Fable / Opus-optional

**Why:** Identity + lightweight stats; not real auth.
**How:** Backend: new `config/accounts.json` via an `AccountsService` (id, gamertag, colorHex, icon, createdAt, stats:{appsLaunched, lobbyTime, …}, history:[{type, ts, detail}]). REST: `GET/POST/PATCH/DELETE /api/accounts`. Record events (app launched, joined) from the socket/launcher paths. New **Account tab** on the dashboard showing the active account, stats, and history.

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

### 12. Better + "legal" queue ☐ Fable

**Why:** Pending/retry logic is flaky; YouTube downloading via yt-dlp is legally fraught.
**How:**

- Robustness: dedupe by URL, fix the "stuck pending" (timeout if no ack), clearer error toasts, don't show a perma-spinner on 404 thumbnails.
- Legal: gate yt-dlp behind an explicit, default-OFF setting `media.allowExtraction` with an in-UI disclaimer ("only content you're authorized to use"); otherwise accept only direct media URLs (`.mp4/.mp3/...`) and local files. Document in LEGAL.md (#16).

---

## TIER 5 — Packaging / distribution

### 13. Autorun at Windows startup ☐ Fable

**How:** Installer `[Registry]` HKCU `…\Run` entry, gated by a `[Tasks]` checkbox ("Start JDrakoon3 when Windows starts"); mirror as a Settings toggle that writes/removes the same registry value at runtime.

### 14. "No Node.js prompt" ☐ Fable (needs a decision)

**Why:** Windows Firewall prompts when Node first listens on the LAN. The phone needs LAN access, so we can't just bind to localhost.
**How (options, pick one):** (a) Installer adds a firewall rule for `node.exe`/port 3001 via an elevated `netsh advfirewall` step (one UAC at install only); (b) ship a code-signed exe to kill SmartScreen (costs $). Recommend (a). If the prompt they mean is SmartScreen on the unsigned launcher, that's signing-only.

### 15. Branded window icon / WebView ☑ Opus (WebView2)

**Why:** Edge kiosk shows the Edge icon in Alt-Tab/taskbar.
**How:** Proper fix = replace Edge `--kiosk` with a **WebView2 host** (C#, our icon, no Edge chrome, full control of close → also fixes branding and gives reliable lifecycle). This is a meaningful rewrite of `launcher.cs`'s kiosk piece → **Opus**. Cheap partial: ensure the dashboard favicon is the Drakoon icon (Fable).

**Done:** `launcher.cs` now hosts a borderless, fullscreen WinForms window with WebView2 (`RunWebView2Kiosk`) — our `drakoon.ico` + "JDrakoon3" title in Alt-Tab/taskbar, no Edge chrome, default context menus / devtools / accelerator keys off, backend-death closes the window. If the WebView2 **runtime** is missing it falls back to the old Edge `--kiosk` (`RunEdgeKioskBlocking`) so nothing regresses. `build-release.ps1` fetches the WebView2 SDK from NuGet (`Ensure-WebView2`, cached in `webview2/`), compiles with the wrapper DLLs referenced, and ships `Microsoft.Web.WebView2.Core/WinForms.dll` + `WebView2Loader.dll` next to the exe. Compiled clean (111 KB exe).

### 16. Full license + LEGAL ☐ Fable

**How:** Add root `LICENSE` (recommend MIT for your code; confirm choice), set `license` in all three `package.json`, add `LEGAL.md` (yt-dlp usage = user's responsibility; ties to #12), link from README.

---

## TIER 6 — Visual polish · Fable

### 17. App row depth: side cards shrink + gradient edge mask ☑ Fable

**Why:** When apps overflow, edges should fade/shrink for depth.
**How:** Scale cards by horizontal distance from center (transform: scale + slight Y), and a CSS mask-image gradient on the row. **Caution:** `mask-image` + `backdrop-blur` can break the frosted glass on Chromium — test; if it kills the blur, fade with an overlaid gradient `::before/::after` instead of `mask-image`, and apply `scale` per-card rather than masking the container.

**Done:** Each `AppCard` gets a `depth` (distance in cards from the focused card, via `useFocus().focusedId`) driving per-card `scale` (−4.5%/card, cap 16%), `translateY` sink (5px/card, cap 18px) and opacity dim (cap 50%) through the existing 500ms transition; neutral when focus is outside the row. Edge fade uses **overlaid gradients** (left/right `from-[#04040a]`) — NOT `mask-image`, per the backdrop-blur caution — and only renders when the row actually overflows (`scrollWidth > clientWidth`, rechecked on resize/app-list changes).

---

## TIER 7 — Cross-platform · Opus (large)

### 18. macOS / Linux support ◐ Opus

**Why:** Every native layer is Windows-only (PowerShell input driver, `WindowedLauncher`, `launcher.cs`, Inno installer, Edge paths, yt-dlp `.exe`).
**How:** Introduce a platform abstraction for input simulation (Win: current PowerShell; mac: CGEvent via a helper; Linux: `xdotool`/`ydotool`) and app launching (`open`/`xdg-open`). Per-OS launcher + packaging (mac `.app`/dmg, Linux AppImage). yt-dlp per-platform binary. Large, multi-file, ambiguous → Opus.

**Done (core runtime):** Added `backend/src/platform/` (OS detection, `ytDlpBinaryName()`, `commandExists()`). Refactored input into `backend/src/services/input/` — `InputBackend` interface + Windows (existing PowerShell, behavior-preserving), Linux (`xdotool`/`ydotool`), macOS (`osascript` + `cliclick`) backends, selected at runtime; `InputControlService` keeps coalescing/normalization and its public API is unchanged (no caller edits). App launching now dispatches via `services/launcher.ts` → `WindowedLauncher` (Win) or new `PosixLauncher` (`open`/`xdg-open`/spawn + PID exit tracking). yt-dlp binary + `chmod +x` are platform-aware. Backend builds clean and Windows boot is unchanged (verified: 95 apps, input driver intact). **Still TODO:** native mac/Linux launcher + packaging (`.app`/dmg, AppImage) and `.desktop`/`/Applications` app discovery — documented in [CROSS-PLATFORM.md](CROSS-PLATFORM.md).

---

## TIER 8 - Additional things i tought of

- combos could have a text completion popup like code auto complete, so when . is pressed, all possible keys are shown, always limited by the keys pressed after
- fix .ctrl click (my own implementation) fix .tab
- fix app opening and closing functionality, track if my app is launched by a launcher (currently it becomes uncloseable) also pid feels unreliable
- support for soundcloud and possibly spotify links
- support for torrents maybe?
- machine name and port so i dont have to get a new link from each wifi
- switch to custom dropdowns
- switch to custom yes no modals instead of alerts
- accept inputs from mobile devices with phisical inputs.
- spoof actual controller inputs so that platforms like switch can detect it

## Build order I'll follow

Tier 1 (now) → 5 → 6/7/8 (app mgmt) → 16 (license, quick) → 13 (autorun) → 12 (queue) → 9/10/11 (accounts/input) → 17 (polish) → 14/15 → 18.

Verification per tier: `build-release.ps1 -SkipBuild` (compiles launcher + reassembles), backend `npm run build`, console/remote `npm run build`; for input/cube changes, run the exe and confirm via logs + a quick socket probe.
