import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Gamepad2, Keyboard, X, Zap } from "lucide-react";
import { notifService } from "../../services/notificationService";
import { Dropdown } from "./Dropdown";
import {
  defaultProfileFor,
  deviceKind,
  type InputMapping,
} from "../../services/deviceSettings";
import {
  captureSource,
  isAxisSource,
  snapshot,
  sourceLabel,
  type Source,
  type CaptureBaseline,
} from "../../services/gamepadSource";

// ---------------------------------------------------------------
// Mouse-first editor for a device's control mapping (#11).
//
//   • pick / rename a mapping profile (saved to settings.input.mappings)
//   • bind each control one by one — dropdown (gamepad) or key capture
//   • REMAP wizard: walks every control in order and waits for real input;
//     joysticks are detected by rotating them ("rotate around joystick 1/2")
// ---------------------------------------------------------------

// Control ids in wizard order. "axes:" entries only exist for gamepads.
const BUTTON_CONTROLS_GAMEPAD = [
  ["navUp", "Pad Up"],
  ["navDown", "Pad Down"],
  ["navLeft", "Pad Left"],
  ["navRight", "Pad Right"],
  ["confirm", "Confirm"],
  ["back", "Back"],
  ["jump", "Jump"],
  ["slam", "Slam"],
] as const;

const KEY_CONTROLS_KEYBOARD = [
  ["moveUp", "Move Up"],
  ["moveDown", "Move Down"],
  ["moveLeft", "Move Left"],
  ["moveRight", "Move Right"],
  ["navUp", "Nav Up"],
  ["navDown", "Nav Down"],
  ["navLeft", "Nav Left"],
  ["navRight", "Nav Right"],
  ["confirm", "Confirm"],
  ["back", "Back"],
  ["jump", "Jump"],
  ["slam", "Slam"],
] as const;

const AXES_CONTROLS = [
  ["axes:move", "Joystick 1 — move", "Rotate joystick 1 around"],
  ["axes:spin", "Joystick 2 — spin", "Rotate joystick 2 around"],
] as const;

const MAX_BUTTONS = 17; // standard-mapping pads expose 17 buttons
const AXIS_PAIRS: [number, number][] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [8, 9],
];

function cloneMapping(m: InputMapping): InputMapping {
  return JSON.parse(JSON.stringify(m));
}

function emptyMapping(type: "gamepad" | "keyboard"): InputMapping {
  return {
    type,
    buttons: {},
    keys: {},
    axes: { move: [-1, -1], spin: [-1, -1] },
  };
}

export function MappingEditor({
  deviceId,
  label,
  onClose,
}: {
  deviceId: string;
  label: string;
  onClose: () => void;
}) {
  const type = deviceKind(deviceId);
  const gpIndex =
    type === "gamepad"
      ? parseInt(deviceId.replace("gamepad-", ""), 10) || 0
      : -1;

  const [profiles, setProfiles] = useState<Record<string, InputMapping>>({});
  const [profileName, setProfileName] = useState("");
  const [working, setWorking] = useState<InputMapping>(emptyMapping(type));

  // Capture queue: control ids being (re)bound. null = idle. The head entry
  // is the active one; binding it advances the queue (the remap wizard is
  // just a full queue, a single rebind a queue of one).
  const [queue, setQueue] = useState<string[]>([]);
  const active = queue[0] ?? null;
  const workingRef = useRef(working);
  workingRef.current = working;

  // Detect a non-standard pad (mapping !== "standard"): its D-pad is usually a
  // POV hat / axes and its button indices are raw, so the default profile won't
  // fit — nudge the user to Remap. Polled, since the pad may connect post-open.
  const [nonStandard, setNonStandard] = useState(false);
  useEffect(() => {
    if (type !== "gamepad") return;
    const id = setInterval(() => {
      const gp = navigator.getGamepads()[gpIndex];
      if (gp) setNonStandard(gp.mapping !== "standard");
    }, 600);
    return () => clearInterval(id);
  }, [type, gpIndex]);

  // ── Load profiles + the device's current selection ──────────────
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        const all: Record<string, InputMapping> = s?.input?.mappings || {};
        const mine = Object.fromEntries(
          Object.entries(all).filter(([, m]) => m.type === type),
        );
        setProfiles(mine);
        const assigned: string =
          s?.input?.devices?.[deviceId]?.mapping || defaultProfileFor(deviceId);
        const name = mine[assigned] ? assigned : Object.keys(mine)[0] || "";
        setProfileName(name);
        setWorking(mine[name] ? cloneMapping(mine[name]) : emptyMapping(type));
      })
      .catch(() => {});
  }, [deviceId, type]);

  const pickProfile = (name: string) => {
    setQueue([]);
    setProfileName(name);
    if (profiles[name]) setWorking(cloneMapping(profiles[name]));
  };

  // ── Binding helpers ──────────────────────────────────────────────
  const bind = useCallback(
    (control: string, value: Source | [number, number]) => {
      setWorking((w) => {
        const next = cloneMapping(w);
        if (control === "axes:move") next.axes.move = value as [number, number];
        else if (control === "axes:spin")
          next.axes.spin = value as [number, number];
        else if (next.type === "gamepad")
          next.buttons[control] = value as Source;
        else next.keys[control] = value as string;
        return next;
      });
      setQueue((q) => q.slice(1));
    },
    [],
  );

  // ── Keyboard capture ─────────────────────────────────────────────
  useEffect(() => {
    if (!active || type !== "keyboard") return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      bind(active, e.key.toLowerCase());
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, type, bind]);

  // ── Gamepad capture ──────────────────────────────────────────────
  //   • axes:move / axes:spin → detect a STICK by which two axes sweep the
  //     widest range while the user rotates it.
  //   • any other control → capture a single SOURCE (button, axis-half, or POV
  //     hat) the moment it crosses its threshold from the capture-start rest.
  useEffect(() => {
    if (!active || type !== "gamepad") return;
    let raf = 0;
    let base: CaptureBaseline | null = null;
    const extents = new Map<number, { min: number; max: number }>();

    const tick = () => {
      const gp = navigator.getGamepads()[gpIndex];
      if (!gp) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (!base) base = snapshot(gp); // rest state when capture began

      // Learn POV-hat neutrals: an axis sitting outside the stick range is a
      // released hat (rests ~3.28). Keep its baseline current so each press is
      // measured from rest — otherwise a direction still held from the previous
      // wizard step would make the next one bind the wrong axis-half.
      for (let a = 0; a < gp.axes.length; a++) {
        const v = gp.axes[a] ?? 0;
        if (Math.abs(v) > 1.2) base.axes[a] = v;
      }

      if (active.startsWith("axes:")) {
        // Rotation detection: track each axis' travelled range; a full stick
        // rotation swings its two axes across ~[-1, 1]. Pick the two widest.
        for (let a = 0; a < gp.axes.length; a++) {
          const v = gp.axes[a] ?? 0;
          const e = extents.get(a) || { min: v, max: v };
          e.min = Math.min(e.min, v);
          e.max = Math.max(e.max, v);
          extents.set(a, e);
        }
        const moved = [...extents.entries()]
          .map(([a, e]) => ({ a, range: e.max - e.min }))
          // When binding spin, the move pair is off the table.
          .filter(({ a }) =>
            active === "axes:spin"
              ? !workingRef.current.axes.move.includes(a)
              : true,
          )
          .filter(({ range }) => range > 1.2)
          .sort((p, q) => q.range - p.range);
        if (moved.length >= 2) {
          const pair = [moved[0].a, moved[1].a].sort((x, y) => x - y) as [
            number,
            number,
          ];
          bind(active, pair);
          return;
        }
      } else {
        const src = captureSource(gp, base);
        if (src !== null) {
          bind(active, src);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, type, gpIndex, bind]);

  // ── Wizard / save ────────────────────────────────────────────────
  const startRemap = () => {
    const controls =
      type === "gamepad"
        ? [
            ...BUTTON_CONTROLS_GAMEPAD.map(([id]) => id as string),
            ...AXES_CONTROLS.map(([id]) => id as string),
          ]
        : KEY_CONTROLS_KEYBOARD.map(([id]) => id as string);
    setQueue(controls);
  };

  const save = () => {
    const name = profileName.trim() || `Custom ${label}`;
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: {
          mappings: { [name]: working },
          devices: { [deviceId]: { mapping: name } },
        },
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.ok !== false) {
          notifService.push(`Saved mapping "${name}" for ${label}`);
          onClose();
        } else notifService.push("Failed to save mapping");
      })
      .catch(() => notifService.push("Failed to save mapping"));
  };

  // ── Row rendering ────────────────────────────────────────────────
  const bindingLabel = (control: string): string => {
    if (control === "axes:move" || control === "axes:spin") {
      const pair =
        control === "axes:move" ? working.axes.move : working.axes.spin;
      return pair[0] < 0 ? "—" : `Axes ${pair[0]} + ${pair[1]}`;
    }
    if (type === "gamepad") return sourceLabel(working.buttons[control]);
    const k = working.keys[control] || "";
    return k === "" ? "—" : k === " " ? "space" : k;
  };

  // Plain render helper (NOT a nested component — an inline component type
  // remounts on every state change, dropping <select> focus mid-interaction).
  const renderRow = (id: string, name: string, hint?: string) => {
    const isActive = active === id;
    const queued = !isActive && queue.includes(id);
    const isAxes = id.startsWith("axes:");
    // A button control bound to an axis/hat (non-standard pad) can't be picked
    // from the numeric button dropdown — show its captured label as a chip.
    const btnSrc = working.buttons[id];
    const showChip = type === "gamepad" && !isAxes && isAxisSource(btnSrc);
    return (
      <div
        key={id}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${
          isActive
            ? "border-indigo-400/70 bg-indigo-500/15 ring-1 ring-indigo-400/50"
            : queued
              ? "border-white/10 bg-white/[0.03] opacity-70"
              : "border-white/8 bg-white/[0.02]"
        }`}
      >
        <span className="text-[11px] font-black uppercase tracking-widest text-white/75 flex-1 min-w-0 truncate">
          {name}
        </span>

        {isActive ? (
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 animate-pulse">
            {isAxes ? hint || "rotate the stick…" : "waiting for input…"}
          </span>
        ) : (
          <>
            {/* dropdown choice */}
            {type === "gamepad" ? (
              isAxes ? (
                <Dropdown
                  value={
                    bindingLabel(id) === "—"
                      ? ""
                      : JSON.stringify(
                          id === "axes:move"
                            ? working.axes.move
                            : working.axes.spin,
                        )
                  }
                  onChange={(v) =>
                    bindNoAdvance(
                      id,
                      v
                        ? (JSON.parse(v) as [number, number])
                        : ([-1, -1] as [number, number]),
                    )
                  }
                  options={[
                    { value: "", label: "Unbound" },
                    ...AXIS_PAIRS.map((p) => ({
                      value: JSON.stringify(p),
                      label: `Axes ${p[0]} + ${p[1]}`,
                    })),
                  ]}
                />
              ) : showChip ? (
                // Bound to an axis-half / POV hat (non-standard pad) — not a
                // dropdown choice; show what was captured.
                <span className="px-2 py-1 rounded-lg bg-indigo-500/15 border border-indigo-400/30 text-[11px] font-bold text-indigo-200 min-w-[60px] text-center">
                  {bindingLabel(id)}
                </span>
              ) : (
                <Dropdown
                  value={String(
                    typeof working.buttons[id] === "number"
                      ? working.buttons[id]
                      : -1,
                  )}
                  onChange={(v) => bindNoAdvance(id, parseInt(v, 10))}
                  options={[
                    { value: "-1", label: "Unbound" },
                    ...Array.from({ length: MAX_BUTTONS }, (_, i) => ({
                      value: String(i),
                      label: `B${i}`,
                    })),
                  ]}
                />
              )
            ) : (
              <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] font-mono text-white min-w-[52px] text-center">
                {bindingLabel(id)}
              </span>
            )}

            {/* single capture */}
            <button
              onClick={() => setQueue([id])}
              title={
                type === "keyboard"
                  ? "Press a key to bind"
                  : isAxes
                    ? "Detect by rotating"
                    : "Press a button to bind"
              }
              className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10"
            >
              Set
            </button>
          </>
        )}
      </div>
    );
  };

  // Dropdown changes shouldn't touch the capture queue.
  const bindNoAdvance = (
    control: string,
    value: number | string | [number, number],
  ) => {
    setWorking((w) => {
      const next = cloneMapping(w);
      if (control === "axes:move") next.axes.move = value as [number, number];
      else if (control === "axes:spin")
        next.axes.spin = value as [number, number];
      else if (next.type === "gamepad") next.buttons[control] = value as number;
      else next.keys[control] = value as string;
      return next;
    });
  };

  const controls =
    type === "gamepad" ? BUTTON_CONTROLS_GAMEPAD : KEY_CONTROLS_KEYBOARD;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "#00000088", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-3xl overflow-hidden"
        style={{
          background: "rgba(12,12,18,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 30px 70px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-white/5">
          {type === "gamepad" ? (
            <Gamepad2 size={18} className="text-indigo-400" />
          ) : (
            <Keyboard size={18} className="text-indigo-400" />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black italic uppercase tracking-tight text-white leading-none truncate">
              {label}
            </h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-600 mt-1">
              Control mapping
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X size={14} />
          </button>
        </div>

        {/* profile picker + name */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-white/5">
          <Dropdown
            value={profiles[profileName] ? profileName : ""}
            onChange={(v) => v && pickProfile(v)}
            placeholder="(new)"
            options={[
              ...(!profiles[profileName] ? [{ value: "", label: "(new)" }] : []),
              ...Object.keys(profiles).map((n) => ({ value: n, label: n })),
            ]}
          />
          <input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Profile name"
            className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white outline-none focus:border-indigo-500/40"
          />
          <button
            onClick={startRemap}
            disabled={queue.length > 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-[10px] font-black uppercase tracking-widest text-white"
          >
            <Zap size={11} /> Remap
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1.5 custom-scroll">
          {nonStandard && queue.length === 0 && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300/90 leading-snug">
                Non-standard controller — its D-pad / sticks aren't where the
                default profile expects. Hit <span className="text-amber-200">Remap</span> and
                follow the prompts (the D-pad is detected by pressing it; sticks
                by rotating them).
              </p>
            </div>
          )}
          {queue.length > 0 && (
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300 px-1 pb-1">
              {queue.length} to go — press the highlighted control
              <button
                onClick={() => setQueue([])}
                className="ml-2 text-gray-500 hover:text-white underline"
              >
                cancel
              </button>
            </p>
          )}
          {controls.map(([id, name]) => renderRow(id, name))}
          {type === "gamepad" &&
            AXES_CONTROLS.map(([id, name, hint]) => renderRow(id, name, hint))}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[11px] font-black uppercase tracking-widest text-white"
          >
            <Check size={13} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
