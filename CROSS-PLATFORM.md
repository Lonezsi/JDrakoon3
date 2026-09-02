# Cross-platform support

JDrakoon3 was built Windows-first. The backend (Node) and both frontends (web)
are inherently portable; the **native layers** (OS input, app launching, the
kiosk launcher, packaging) are what differ per OS. Those are now funnelled
through a platform abstraction so adding/maintaining an OS is a matter of one
branch, not a hunt across the codebase.

Everything dispatches off [`backend/src/platform/index.ts`](backend/src/platform/index.ts)
(`PLATFORM`, `isWindows/isMac/isLinux`, `ytDlpBinaryName()`, `commandExists()`).

## Status by concern

| Concern | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Backend + web UIs | ✅ | ✅ | ✅ |
| OS mouse/keyboard (phone control) | ✅ PowerShell + Win32 | ⚠️ osascript (keys/text); mouse needs `cliclick` | ⚠️ `xdotool` (X11) / `ydotool` (Wayland) |
| Launch apps | ✅ window-foreground + lifecycle | ✅ `open` (`-W` for `.app`) | ✅ spawn / PATH cmd / `xdg-open` |
| yt-dlp (optional queue extraction) | ✅ `yt-dlp.exe` | ✅ `yt-dlp_macos` | ✅ `yt-dlp` |
| Installed-apps picker | ✅ Start Menu + Steam | ✅ `/Applications/*.app` + Steam | ✅ `.desktop` entries + Steam |
| One-command launcher | ✅ WebView2 (C#) | ✅ `launcher.mjs` (Chromium `--kiosk`) | ✅ `launcher.mjs` (Chromium `--kiosk`) |
| Packaged installer | ✅ Inno Setup | ⚠️ run scripts (dmg TODO) | ⚠️ run scripts + `.desktop` (AppImage TODO) |

## Input backends

[`backend/src/services/input/`](backend/src/services/input/) — `InputControlService`
keeps the platform-agnostic logic (move coalescing, key-name normalization,
combo parsing) and delegates primitives to an `InputBackend`:

- **Windows** — the original long-lived PowerShell + Win32 P/Invoke driver (unchanged).
- **Linux** — `xdotool` (X11), falling back to `ydotool` (Wayland; needs the
  `ydotoold` daemon and uinput permissions). Install: `sudo apt install xdotool`.
- **macOS** — AppleScript via `osascript` for keys/text (needs **Accessibility**
  permission — macOS prompts on first use); mouse move/click via `cliclick`
  (`brew install cliclick`). Without cliclick, keys/text still work.
  Note: `.ctrl c` maps to ⌘C (the Mac convention); use `.control c` for literal ⌃.

If the required helper isn't installed, the backend reports `enabled = false`
and OS-control no-ops cleanly — the lobby/cube and the rest of the app still run.

## Running on macOS / Linux today

After a one-time build, it's a single command — [`launcher.mjs`](launcher.mjs)
does the whole lifecycle (free port → start backend → wait → open a Chromium
browser in `--kiosk` → tear down when either closes), mirroring `launcher.cs`:

```bash
# one-time build (root)
cd backend && npm install && npm run build && cd ..
cd couch-console && npm install && npm run build && cd ..
cd couch-remote  && npm install && npm run build && cd ..
# assemble backend/frontend-build the way build-release.ps1 does, then:

node launcher.mjs        # needs Node 18+ and Chrome/Chromium/Edge/Brave
```

Convenience wrappers live in [`scripts/`](scripts/): `run-macos.command`
(double-clickable), `run-linux.sh`, and `jdrakoon3.desktop` (menu/autostart
entry — the Linux analogue of the Windows Run-key autorun). Logs go to
`~/.jdrakoon3/`. The phone UI is `http://<this-machine-ip>:3001/phone`.

If no Chromium-family browser is found, the launcher opens the default browser
(no kiosk). Phone OS-control needs the per-OS helper (see Input backends above).

## Not yet done (future work)

- **Native packaging** — the launcher + run scripts make it one-command, but
  there's no single distributable yet:
  - **macOS** `.app` + `.dmg` (the run script is the stopgap). A fully branded
    chrome-less window would use `WKWebView` instead of a Chromium kiosk.
  - **Linux AppImage** bundling Node + the payload (the `.desktop` is the stopgap).
  Both need to bundle a per-OS Node runtime (the Windows release bundles
  `node.exe`); these must be produced/tested on the target OS.
