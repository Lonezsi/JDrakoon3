# couch-remote

The phone remote for [JDrakoon3](../README.md) — a webapp that turns a phone into
a wireless gamepad for the console. D-pad, ABXY face buttons, an analog joystick
(for the 3D lobby), media controls, and a volume slider.

Built with React + Vite + Tailwind. Connects to the backend over Socket.IO
(`:3001`).

## Develop

```sh
npm install
npm run dev        # Vite dev server on localhost:5174  (or `make remote` from root)
npm run build      # production build into dist/ (served by the backend at /phone)
```

In normal use you don't run this directly — the backend serves the built app at
`http://<console-ip>:3001/phone`, reachable from the QR code on the console.

## How input reaches the console

1. A control calls `sendAction(Actions.NAV_UP)` etc.
   ([`src/services/inputActions.js`](src/services/inputActions.js)).
2. [`src/services/socket.js`](src/services/socket.js) maps each action to a
   gamepad-shaped Socket.IO `input:event`:

   | Control            | Emitted packet               |
   | ------------------ | ---------------------------- |
   | D-pad up/down/left/right | `{ buttons: { up/down/left/right: true } }` |
   | A / B / X / Y      | `{ buttons: { a/b/x/y: true } }` |
   | `CONFIRM`          | `{ buttons: { a: true } }`   |
   | `BACK`             | `{ buttons: { b: true } }`   |
   | `HOME`             | `{ buttons: { start: true } }` |
   | Joystick           | `{ analog: { x, y } }`       |

3. The backend interprets those buttons **based on the current focus mode**. On
   the home dashboard (focus `menu`) the D-pad becomes `navigate`, A becomes
   `confirm`, B becomes `back`. The console then moves its menu selection.

So the phone D-pad navigates the TV UI exactly like the local arrow keys. See the
[root README](../README.md#input--navigation) for the full pipeline.

## Layout

| Path                              | Purpose                                  |
| --------------------------------- | ---------------------------------------- |
| `src/components/tabs/RemoteTab.jsx` | The gamepad: D-pad, ABXY, joystick, system buttons |
| `src/services/inputActions.js`    | `Actions` enum + `sendAction` indirection |
| `src/services/socket.js`          | Socket.IO transport: action → `input:event` |
