import { User } from "lucide-react";
import type { Player } from "../../shared/types";
import { useEffect, useState } from "react";
import { useFocusable } from "../../navigation/FocusContext";
import { AccountsPanel } from "./AccountsPanel";

interface TopBarProps {
  clock: Date;
  players: Player[];
}

const GITHUB_REPO = "Lonezsi/JDrakoon3";

export function TopBar({ clock, players }: TopBarProps) {
  const [openUsersPanel, setOpenUsersPanel] = useState(false);
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
  const [updateStatus, setUpdateStatus] = useState<"none" | "available">(
    "none",
  );
  const [latestVersion, setLatestVersion] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // ── Check for updates ─────────────────────────────────────────
  const checkForUpdate = async (): Promise<boolean> => {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      );
      const data = await res.json();
      const remote = data.tag_name?.replace(/^v/, "");
      if (appVersion === "0.0.0") return false;
      if (remote && remote !== appVersion) {
        setLatestVersion(remote);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // ── Trigger the update ────────────────────────────────────────
  const triggerUpdate = () => {
    let secret = (window as any).__UPDATE_SECRET__ || "";
    if (!secret) {
      secret = prompt("Enter update secret key:") || "";
    }
    if (!secret) return;

    fetch("/api/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: secret }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          window.location.reload();
        } else {
          alert("Update failed: " + (data.error || "unknown error"));
        }
      })
      .catch(() => alert("Update request failed."));
  };

  // ── Fetch settings and decide what to do ──────────────────────
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then(async (settings) => {
        const { autoupdate, remindMeAboutUpdate, updateSilently } =
          settings.autoupdate;

        const updateAvailable = await checkForUpdate();
        if (!updateAvailable) return;

        if (autoupdate) {
          setUpdateStatus("available");
          triggerUpdate();
        } else if (updateSilently) {
          triggerUpdate();
        } else if (
          remindMeAboutUpdate &&
          !localStorage.getItem("hide_update_modal")
        ) {
          setShowModal(true);
        }
      })
      .catch(() => {});
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
            {updateStatus === "available" && (
              <span className="px-2.5 py-1 bg-yellow-600 rounded text-[10px] font-black uppercase tracking-wider animate-pulse">
                Update Available ({latestVersion})
              </span>
            )}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">
              {players.length} Active ·&nbsp;
              <span className="text-gray-500">WIFI: {wifiName}</span>
            </p>
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
        onClose={() => setOpenUsersPanel(false)}
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
