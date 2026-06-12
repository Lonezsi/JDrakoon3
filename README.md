# JDrakoon3

A couch-gaming console: a TV dashboard you drive with a gamepad, arrow keys, or
your phone as a wireless remote. Launch apps, queue videos, and mess around in a
shared 3D lobby.

> Status: **Alpha**. Things move around.

## Install (for players)

Grab the latest build from the
[**Releases page**](https://github.com/Lonezsi/JDrakoon3/releases/latest). Two options:

- **Installer (recommended):** download **`JDrakoon3-Setup.exe`** and run it. It's a
  per-user install — **no admin prompt** — into `%LOCALAPPDATA%\Programs\JDrakoon3`,
  with Start Menu (and optional desktop) shortcuts and a clean uninstaller.
- **Portable:** download **`JDrakoon3-portable.zip`**, unzip it anywhere **writable**
  (your user folder, Desktop, a USB stick — _not_ inside `Program Files`), and run
  `JDrakoon3.exe`.

Then just launch **JDrakoon3** — it starts everything and opens the dashboard
fullscreen. No console window, nothing to configure.

**Requirements:** 64-bit Windows 10/11 with **Microsoft Edge** (the fullscreen
kiosk; without it the dashboard opens in your default browser). .NET Framework 4
and everything else are already built into Windows — there's nothing else to install.

**Auto-update:** on launch the app checks the GitHub Releases page; if a newer
version is published it downloads the installer, updates silently, and relaunches
itself. Logs live at `%LOCALAPPDATA%\JDrakoon3\launcher.log`.

To quit: use the in-app **Shutdown** button, or press **Alt+F4** to exit the kiosk —
either way the background server is stopped cleanly.

## Packages

| Folder           | What it is                                            | Dev port | Stack                           |
| ---------------- | ----------------------------------------------------- | -------- | ------------------------------- |
| `backend/`       | Node server: HTTP API + Socket.IO relay + video queue | `3001`   | Express, Socket.IO, TypeScript  |
| `couch-console/` | The TV UI (the "console")                             | `5173`   | React, Vite, Three.js, Tailwind |
| `couch-remote/`  | The phone remote (gamepad webapp)                     | `5174`   | React, Vite, Tailwind           |

In a production build the two frontends are bundled into `backend/frontend-build`
and served by the backend: the console at `/` and the phone remote at `/phone`.

## Running it

Targets live in the [`makefile`](makefile) (GNU Make on Windows, `SHELL=cmd.exe`):

```sh
make dev       # backend in watch mode (ts-node-dev)
make console   # couch-console Vite dev server  (open localhost:5173)
make remote    # couch-remote  Vite dev server  (open localhost:5174)

make build     # build both frontends into backend/frontend-build, then the backend
make run       # start the built backend serving everything on :3001
make kill      # free ports 3000 3001 5173 5174
```

> During development the console must be opened through the **Vite dev server**
> (`localhost:5173`), not the backend's static build — otherwise Vite's HMR
> runtime isn't injected and you'll see errors like `$RefreshSig$ is not defined`.

The phone connects to the backend over Socket.IO on port `3001`. Scan the QR code
shown on the console (bottom-right) to open `http://<console-ip>:3001/phone`.

## Building a release (for maintainers)

The shippable app is a tiny C# launcher ([`launcher.cs`](launcher.cs)) compiled to a
GUI-subsystem `.exe` (no console, Drakoon icon embedded at compile time via the
built-in `csc.exe`). It bundles `node.exe` and the prebuilt backend + frontends, so
end users build/install **nothing** — the exe never compiles at startup.

```powershell
# Full portable build -> .\release\  (zip it as JDrakoon3-portable.zip)
powershell -ExecutionPolicy Bypass -File .\build-release.ps1

powershell -ExecutionPolicy Bypass -File .\build-release.ps1 -SkipBuild   # repackage only (skip npm builds)
powershell -ExecutionPolicy Bypass -File .\build-release.ps1 -Installer   # also build the installer
```

`-Installer` runs [Inno Setup](https://jrsoftware.org/isdl.php) on
[`installer.iss`](installer.iss) and produces `release\installer\JDrakoon3-Setup.exe`.

**Publishing an update:** bump the [`VERSION`](VERSION) file (and the matching
`MyAppVersion` in `installer.iss` / `AssemblyFileVersion` in `launcher.cs`), build,
then create a **GitHub release** whose tag is the new version (e.g. `v3.0.2`) and
attach **`JDrakoon3-Setup.exe`** as an asset. Installed clients pick it up
automatically on their next launch (the launcher matches an asset named `…Setup.exe`
against the local `VERSION`).

## Architecture at a glance

```
┌─────────────┐   input:event / action / media_*    ┌─────────────┐
│ couch-remote│ ─────────────────────────────────▶ │   backend   │
│   (phone)   │ ◀───────  lobby_state, etc. ───────│  Socket.IO  │
└─────────────┘                                     └──────┬──────┘
                                                           │ broadcast to "lobby" room
                                                           ▼
                                                    ┌─────────────┐
                                                    │couch-console│
                                                    │   (TV UI)   │
                                                    └─────────────┘
```

Every client (phone **and** console) calls `join`, which puts them in the
Socket.IO `"lobby"` room. The backend broadcasts state and relayed input to that
room, so the console receives actions the phone produced.

## Input & navigation

This is the part most worth understanding. There are two layers: **how raw input
turns into navigation actions**, and **how the console decides what those actions
focus**.

### 1. From device to action

Local input on the console (keyboard arrows / WASD / gamepad) is read by
[`couch-console/src/systems/input/inputManager.ts`](couch-console/src/systems/input/inputManager.ts)
and emitted as `DeviceAction`s.

Phone input takes a longer path:

1. The remote's D-pad / face buttons call `sendAction(Actions.NAV_UP)` etc.
   ([`couch-remote/src/services/inputActions.js`](couch-remote/src/services/inputActions.js)).
2. The transport ([`couch-remote/src/services/socket.js`](couch-remote/src/services/socket.js))
   turns each action into a gamepad-shaped `input:event`, e.g.
   `NAV_UP → { buttons: { up: true } }`, `A → { buttons: { a: true } }`,
   `BACK → { buttons: { b: true } }`.
3. The backend's [`InputService.processInput`](backend/src/services/InputService.ts)
   converts buttons into **semantic actions, gated by the current focus mode**:

   | Focus mode       | up/down/left/right  | A         | B      | start  |
   | ---------------- | ------------------- | --------- | ------ | ------ |
   | `menu` (default) | `navigate`          | `confirm` | `back` | `home` |
   | `lobby`          | (ignored)           | `jump`    | —      | —      |
   | `fullscreen`     | raw `gamepad_input` | —         | —      | —      |

4. The backend broadcasts each action to the `"lobby"` room as an `action` event.
5. The console receives it in [`App.tsx`](couch-console/src/App.tsx) and calls the
   focus manager: `navigate → move(dir)`, `confirm → select()`, `back → goBack()`,
   `home → resetToRoot()`.

So the **same** `move()/select()/goBack()` calls drive the UI whether the input
came from the local keyboard, a local gamepad, or the phone.

### 2. The focus system (geometry-based)

Menu navigation lives in
[`couch-console/src/navigation/FocusContext.tsx`](couch-console/src/navigation/FocusContext.tsx).
It does **not** use hard-coded coordinates or per-component transition tables.
Instead:

- Any element becomes targetable with one hook:

  ```tsx
  const { ref, focused } = useFocusable("settings", { onSelect: openSettings });
  // attach ref to the element; render a focus ring when `focused`
  ```

- `move(dir)` finds the nearest focusable in the pressed direction using the
  elements' on-screen rectangles (`getBoundingClientRect`). Add or remove a
  button and navigation adapts automatically — no wiring to update.
- `select()` invokes the focused element's `onSelect`.
- **Layers** form a stack. Focusables register to a layer; only the top layer is
  navigable. Opening a modal calls `pushLayer("modal", onClose)`, which traps
  focus inside it; `back` (`goBack()`) runs the layer's onClose and pops it.

Currently focusable: the app-launcher cards, the footer's Settings and Shutdown
buttons, the top-bar profile, and the settings modal's close/reset buttons. The
lobby, mini-player, and queue are mouse/phone controlled and intentionally not in
the focus graph.

## License

[MIT](LICENSE) © Lonezsi.

The optional video queue uses `yt-dlp` to fetch media. You are responsible for
only adding content you're authorized to play, and for complying with each
source platform's Terms of Service and applicable copyright law.
