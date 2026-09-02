import { User, WifiOff } from "lucide-react";
import type { Player } from "../../shared/types";
import { useEffect, useRef, useState } from "react";
import { useFocusable } from "../../navigation/FocusContext";
import { AccountsPanel } from "./AccountsPanel";
import { subscribeStatus } from "../../services/systemStatus";
import { notifyModal } from "../../services/confirmService";

interface TopBarProps {
  clock: Date;
  players: Player[];
}

export function TopBar({ clock, players }: TopBarProps) {
  const [openUsersPanel, setOpenUsersPanel] = useState(false);
  // When a lobby cube is clicked, App dispatches "open-accounts" with that
  // player's id → open the panel and focus that device's row.
  const [focusDeviceId, setFocusDeviceId] = useState<string | null>(null);
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent).detail?.playerId ?? null;
      setFocusDeviceId(id);
      setOpenUsersPanel(true);
    };
    window.addEventListener("open-accounts", onOpen);
    return () => window.removeEventListener("open-accounts", onOpen);
  }, []);
  const profileFocus = useFocusable<HTMLDivElement>("topbar-profile", {
    onSelect: setOpenUsersPanel.bind(null, (open) => !open),
  });
  const timeStr = clock.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const [appVersion, setAppVersion] = useState("0.0.0");

  useEffect(() => {
    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => setAppVersion(data.version))
      .catch(() => setAppVersion("0.0.0"));
  }, []);

  const envName = (globalThis as any).process?.env?.NODE_ENV ?? "development";

  const [wifiName, setWifiName] = useState("Loading...");
  const [userName, setUserName] = useState("Loading...");
  // Live connectivity + update state from the backend (polled every 1s).
  const [online, setOnline] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState("");
  const [applying, setApplying] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // ── Apply the update (download Setup.exe + run silently, backend-side) ──
  const triggerUpdate = () => {
    setApplying(true);
    fetch("/api/update/apply", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          // The installer will replace files and relaunch; the backend goes
          // away mid-update. The status poller already shows "offline" then;
          // the relaunched app loads fresh, so no manual reload needed.
          return;
        }
        setApplying(false);
        if (data.error === "manual_update_required") {
          notifyModal(
            "Update available",
            `A new version (v${latestVersion}) is available. On macOS/Linux, update by re-running the latest build.`,
          );
        } else {
          notifyModal("Update failed", data.error || "unknown error");
        }
      })
      .catch(() => {
        setApplying(false);
        notifyModal("Update failed", "Couldn't reach the update service.");
      });
  };

  // ── Live status: offline pill, update badge, and auto-apply policy ──────
  const autoHandled = useRef(false);
  useEffect(() => {
    return subscribeStatus((s) => {
      setOnline(s.online);
      setUpdateAvailable(s.updateAvailable);
      setApplying(s.applying);
      if (s.latestVersion) setLatestVersion(s.latestVersion);

      // First time we learn an update is available, consult the user's policy.
      if (s.updateAvailable && !autoHandled.current && !s.applying) {
        autoHandled.current = true;
        fetch("/api/settings")
          .then((res) => res.json())
          .then((settings) => {
            const { autoupdate, remindMeAboutUpdate, updateSilently } =
              settings.autoupdate || {};
            if (autoupdate || updateSilently) {
              triggerUpdate();
            } else if (
              remindMeAboutUpdate &&
              !localStorage.getItem("hide_update_modal")
            ) {
              setShowModal(true);
            }
          })
          .catch(() => {});
      }
    });
  }, []);

  function formatSSID(ssid: string): string {
    //remove number at the end of the ssid if it exists (e.g. "MyWiFi 5" -> "MyWiFi")
    return ssid.replace(/\s+\d+$/, "");
  }

  // ── Network info & user name ──────────────────────────────────
  useEffect(() => {
    fetch("/api/network-info")
      .then((res) => res.json())
      .then((data) => setWifiName(formatSSID(data.ssid)))
      .catch(() => setWifiName("Unknown WiFi"));
  }, []);

  useEffect(() => {
    fetch("/api/users/me")
      .then((res) => res.json())
      .then((data) => setUserName(data.name))
      .catch(() => setUserName("Not Signed In"));
  }, []);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="flex justify-between items-start mb-2">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/40 flex-shrink-0">
          <img src="drakoon.svg" alt="Drakoon" />
        </div>
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight italic leading-none flex items-center gap-2">
            JDrakoon
            <span className="px-2.5 py-1 bg-gray-700 rounded text-[10px] font-black uppercase tracking-wider">
              {appVersion === "0.0.0" ? "dev" : "v" + appVersion}
            </span>
            <span className="px-2.5 py-1 bg-red-500 rounded text-[10px] font-black uppercase tracking-wider">
              Alpha!
            </span>
            {applying ? (
              <span className="px-2.5 py-1 bg-indigo-600 rounded text-[10px] font-black uppercase tracking-wider animate-pulse">
                Updating…
              </span>
            ) : (
              updateAvailable && (
                <span className="px-2.5 py-1 bg-yellow-600 rounded text-[10px] font-black uppercase tracking-wider animate-pulse">
                  Update Available{latestVersion ? ` (${latestVersion})` : ""}
                </span>
              )
            )}
            {!online && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/10 border border-amber-400/30 rounded text-[10px] font-black uppercase tracking-wider text-amber-300">
                <WifiOff size={11} /> Offline
              </span>
            )}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {online ?? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">
                  {players.length} Active ·&nbsp;
                  <span className="text-gray-500">WIFI: {wifiName}</span>
                </p>
              </>
            )}
          </div>
          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-1">
            {envName} - {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <div className="text-right">
          <span className="text-3xl font-mono leading-none block tabular-nums">
            {timeStr}
          </span>
          <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-1 block">
            [{userName}]
          </span>
        </div>
        <div
          ref={profileFocus.ref}
          className={`p-3 rounded-2xl border cursor-pointer transition-all
            ${
              profileFocus.focused
                ? "bg-white/10 border-indigo-400/60 text-indigo-400 ring-2 ring-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.6)]"
                : "bg-white/5 border-white/10 text-indigo-400 hover:bg-white/10 hover:scale-105"
            }
          `}
          onClick={setOpenUsersPanel.bind(null, (open) => !open)}
        >
          <User size={20} />
        </div>
      </div>
      {/* Full-height accounts panel */}
      <AccountsPanel
        open={openUsersPanel}
        onClose={() => {
          setOpenUsersPanel(false);
          setFocusDeviceId(null);
        }}
        players={players}
        focusDeviceId={focusDeviceId}
      />

      {/* Update reminder modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-[#0f0f14] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h2 className="text-lg font-black text-white mb-2">
              Update Available
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              A new version (v{latestVersion}) is ready. Would you like to
              update now?
            </p>
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                id="dontShowAgain"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="accent-indigo-500"
              />
              <label htmlFor="dontShowAgain" className="text-xs text-slate-500">
                Don't show again
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  if (dontShowAgain) {
                    localStorage.setItem("hide_update_modal", "true");
                  }
                  setShowModal(false);
                }}
                className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white"
              >
                Later
              </button>
              <button
                onClick={() => {
                  if (dontShowAgain) {
                    localStorage.setItem("hide_update_modal", "true");
                  }
                  setShowModal(false);
                  triggerUpdate();
                }}
                className="px-4 py-2 bg-indigo-600 rounded-xl text-sm font-bold text-white hover:bg-indigo-500"
              >
                Update Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
