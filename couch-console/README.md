# couch-console

The TV-side UI for [JDrakoon3](../README.md) — the dashboard you see on the big
screen. Boot screen, app launcher, video queue / mini-player, a shared 3D lobby
(Three.js), and a settings modal.

Built with React + Vite + Tailwind. Talks to the backend over Socket.IO (`:3001`).

## Develop

```sh
npm install
npm run dev        # Vite dev server on localhost:5173
```

Open it via the Vite dev server, **not** the backend's static build, or HMR won't
be injected (you'd see `$RefreshSig$ is not defined`). From the repo root you can
also run `make console`.

```sh
npm run build      # production build into dist/ (make build copies it to the backend)
```

## Layout

| Path                              | Purpose                                              |
| --------------------------------- | ---------------------------------------------------- |
| `src/App.tsx`                     | Root: boot → home, socket wiring, maps input → focus |
| `src/navigation/FocusContext.tsx` | Geometry-based focus registry (`useFocusable`, layers) |
| `src/systems/input/`              | Local keyboard / gamepad → `DeviceAction`s           |
| `src/ui/layouts/DashboardLayout`  | Top bar + app launcher + footer                      |
| `src/ui/components/`              | TopBar, AppLauncher, Footer, SettingsModal, …        |
| `src/services/socket.ts`          | Socket.IO client + subscribe/notify                  |
| `src/hooks/`                      | Clock, game loop, lobby renderer, media player       |

## Navigation

Menu focus is handled by `useFocusable` from
[`src/navigation/FocusContext.tsx`](src/navigation/FocusContext.tsx). To make
something targetable by arrow keys / gamepad / phone D-pad:

```tsx
const { ref, focused } = useFocusable("my-id", { onSelect: () => doThing() });
return <button ref={ref} className={focused ? "ring-2 ring-indigo-400" : ""} />;
```

`move(dir)` picks the nearest target by screen position, so there are no
coordinates or transition tables to maintain. Modals push a focus **layer**
(`pushLayer`/`popLayer`) which traps navigation until closed. See the
[root README](../README.md#input--navigation) for the full input pipeline,
including how phone input arrives as the same `move/select/goBack` calls.
