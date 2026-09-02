// ---------------------------------------------------------------
// Single shared poller for /api/status (connectivity + update state). One 1s
// timer feeds every subscriber (TopBar offline pill + update badge, PhoneQR
// visibility), instead of each component polling on its own.
// ---------------------------------------------------------------

export interface SystemStatus {
  version: string;
  lan: boolean;
  lanIp: string | null;
  online: boolean;
  updateAvailable: boolean;
  latestVersion: string | null;
  applying: boolean;
}

const OFFLINE: SystemStatus = {
  version: "0.0.0",
  lan: false,
  lanIp: null,
  online: false,
  updateAvailable: false,
  latestVersion: null,
  applying: false,
};

type Listener = (s: SystemStatus) => void;

let current: SystemStatus = OFFLINE;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

async function poll() {
  try {
    const res = await fetch("/api/status");
    if (res.ok) {
      current = (await res.json()) as SystemStatus;
    } else {
      // Endpoint missing (older backend) or a transient server error — the app
      // itself is still reachable, so DON'T flip to "offline" (that was the
      // broken offline-tag: an old backend 404'd /api/status → stuck offline).
      // Assume reachable; leave LAN/online optimistic so the QR stays visible.
      current = { ...current, lan: true, online: true };
    }
  } catch {
    // A real network failure reaching our LOCAL backend → genuinely offline.
    current = { ...OFFLINE, version: current.version };
  }
  listeners.forEach((fn) => fn(current));
}

export function subscribeStatus(fn: Listener): () => void {
  listeners.add(fn);
  fn(current); // hand over the last known value immediately
  if (!timer) {
    poll();
    timer = setInterval(poll, 1000); // "recheck every second"
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function getStatus(): SystemStatus {
  return current;
}
