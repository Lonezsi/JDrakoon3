// ---------------------------------------------------------------
// Imperative confirm dialog — a drop-in replacement for window.confirm() /
// alert(), which render poorly (or not at all) in the WebView2 kiosk and clash
// with the dark theme. `confirm(opts)` returns a Promise<boolean>; a single
// <ConfirmHost/> rendered at app root shows the styled modal.
// ---------------------------------------------------------------

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /** When true, only an OK button is shown (alert-style). */
  alert?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (v: boolean) => void;
}

type Listener = (req: PendingConfirm | null) => void;

let current: PendingConfirm | null = null;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn(current));
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  // If one is already open, resolve it false first (last call wins).
  if (current) current.resolve(false);
  return new Promise<boolean>((resolve) => {
    current = { ...opts, resolve };
    notify();
  });
}

/** alert()-style: a single OK button; resolves when dismissed. */
export function notifyModal(title: string, message?: string): Promise<boolean> {
  return confirm({ title, message, alert: true, confirmText: "OK" });
}

export function settleConfirm(value: boolean) {
  if (!current) return;
  current.resolve(value);
  current = null;
  notify();
}

export function subscribeConfirm(fn: Listener): () => void {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}
