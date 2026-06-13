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
| Launch apps | ✅ window-foreground + lifecycle | ✅ `open` (`-W` for `.app`) | ✅ spawn / `xdg-open` |
| yt-dlp (optional queue extraction) | ✅ `yt-dlp.exe` | ✅ `yt-dlp_macos` | ✅ `yt-dlp` |
| Installed-apps picker | ✅ Start Menu + Steam | Steam only | Steam only |
| Branded kiosk launcher | ✅ WebView2 (C#) | ❌ run backend + browser manually | ❌ run backend + browser manually |
| One-click installer | ✅ Inno Setup | ❌ (see below) | ❌ (see below) |

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

There's no native launcher/installer yet, so run it like a dev build:

```bash
# backend (serves the built UIs on :3001)
cd backend && npm install && npm run build && NODE_ENV=production node dist/index.js
# then open http://127.0.0.1:3001 in any browser (fullscreen / F11 for kiosk feel)
```

The phone UI works the same way: browse to `http://<this-machine-ip>:3001/phone`.

## Not yet done (future work)

- **macOS launcher/packaging** — a small Swift/Obj-C or Electron host showing the
  app fullscreen with our icon, packaged as `.app` + `.dmg`. The WebView2 host in
  `launcher.cs` is the Windows analogue; macOS would use `WKWebView`.
- **Linux launcher/packaging** — a WebKitGTK host (or Electron) packaged as an
  **AppImage**; autostart via a `.desktop` entry in `~/.config/autostart`.
- **App discovery** — enumerate `.desktop` entries (Linux) and `/Applications`
  (macOS) for the "Add System" picker, mirroring the Windows Start Menu scan.
