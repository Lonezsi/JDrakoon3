// ---------------------------------------------------------------
// Gamepad "source" model — what a logical control (navUp, confirm, jump…) is
// bound to on a physical pad. Cheap / third-party controllers often report
// MAPPING: "n/a" (non-standard), where the D-pad isn't buttons 12-15 but a POV
// hat on a single axis, or two half-axes, and triggers are axes. A plain button
// index can't express those, so a source is one of:
//
//   number   → button index (standard pads, and the historical default)
//   "aN+"    → axis N positive half  (stick pushed +, or D-pad-as-axis, trigger)
//   "aN-"    → axis N negative half
//   "hN:V"   → POV hat: axis N sitting near value V (±tolerance)
//
// sourceActive() reads one at runtime; captureSource() detects one during a
// remap by diffing against a baseline taken when capture started.
// ---------------------------------------------------------------

export type Source = number | string;

const HALF = 0.5; // half-axis activation threshold
const HAT_TOL = 0.15; // hat value match tolerance (8 hat values are ~0.286 apart)
const CAPTURE_DELTA = 0.6; // how far an axis must move from rest to count as "pressed"
const STICK_RANGE = 1.2; // |rest value| above this ⇒ it's a hat (rests ~3.28), not a stick

const AXIS_RE = /^a(\d+)([+-])$/;
const HAT_RE = /^h(\d+):(-?\d*\.?\d+)$/;

/** Is a bound source currently active on this gamepad? */
export function sourceActive(gp: Gamepad, src: Source | undefined): boolean {
  if (src === undefined || src === "" || src === -1) return false;

  if (typeof src === "number") {
    if (src < 0) return false;
    const b = gp.buttons[src];
    return !!b && (b.pressed || b.value > HALF);
  }

  const a = AXIS_RE.exec(src);
  if (a) {
    const v = gp.axes[+a[1]] ?? 0;
    return a[2] === "+" ? v > HALF : v < -HALF;
  }

  const h = HAT_RE.exec(src);
  if (h) {
    const v = gp.axes[+h[1]] ?? 0;
    return Math.abs(v - parseFloat(h[2])) < HAT_TOL;
  }

  return false;
}

export interface CaptureBaseline {
  axes: number[];
  buttons: boolean[];
}

export function snapshot(gp: Gamepad): CaptureBaseline {
  return {
    axes: [...gp.axes],
    buttons: gp.buttons.map((b) => !!b?.pressed),
  };
}

/** During a remap, return the first newly-active source (button beats axis), or
 *  null if nothing crossed the threshold yet. Handles plain buttons, analog
 *  triggers / sticks pushed as a "button", D-pad-as-two-axes, and POV hats. */
export function captureSource(gp: Gamepad, base: CaptureBaseline): Source | null {
  // Buttons first — a freshly-pressed button that wasn't down at baseline.
  for (let i = 0; i < gp.buttons.length; i++) {
    const b = gp.buttons[i];
    const pressed = !!b && (b.pressed || b.value > HALF);
    if (pressed && !base.buttons[i]) return i;
  }

  // Then axes — significant movement from where the axis rested at capture start.
  for (let a = 0; a < gp.axes.length; a++) {
    const cur = gp.axes[a] ?? 0;
    const rest = base.axes[a] ?? 0;
    const delta = cur - rest;
    if (Math.abs(delta) < CAPTURE_DELTA) continue;

    // An axis that rests far outside the stick range (e.g. a hat's 3.2857
    // neutral) is a POV hat → bind the exact value it snapped to. Otherwise
    // it's a stick/trigger/axis-dpad → bind the half it moved toward.
    if (Math.abs(rest) > STICK_RANGE) {
      if (Math.abs(cur) <= STICK_RANGE) return `h${a}:${cur.toFixed(3)}`;
    } else {
      return `a${a}${delta > 0 ? "+" : "-"}`;
    }
  }

  return null;
}

/** Human-readable label for a binding (shown in the editor). */
export function sourceLabel(src: Source | undefined): string {
  if (src === undefined || src === "" || src === -1) return "—";
  if (typeof src === "number") return `B${src}`;
  const a = AXIS_RE.exec(src);
  if (a) return `Axis ${a[1]}${a[2] === "+" ? "+" : "−"}`;
  const h = HAT_RE.exec(src);
  if (h) return `Hat ${h[1]} (${parseFloat(h[2]).toFixed(2)})`;
  return String(src);
}

/** A binding that isn't a plain button index needs capture, not the dropdown. */
export function isAxisSource(src: Source | undefined): boolean {
  return typeof src === "string" && (AXIS_RE.test(src) || HAT_RE.test(src));
}
