import { X } from "lucide-react";
import { sendAction } from "../../services/socket";
import { notifService } from "../../services/notificationService";

export function AppRunningOverlay({
  phase = "launching",
  appName,
}: {
  phase?: "launching" | "running";
  appName?: string;
}) {
  const closeApp = () => {
    sendAction({ type: "close_app" }, (res: any) => {
      if (!res?.ok) notifService.push("Close failed — is the backend up?");
    });
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-[#04040a]">
      <div className="text-center">
        {phase === "launching" ? (
          <>
            <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xs font-black tracking-[0.4em] uppercase text-indigo-300/60">
              Launching{appName ? ` ${appName}` : ""}…
            </p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center mx-auto mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <h1 className="text-2xl font-black tracking-tight italic uppercase mb-1">
              {appName || "App"} is running
            </h1>
            <p className="text-[11px] text-gray-500 font-bold uppercase tracking-widest mb-6">
              The dashboard is paused to free up the machine
            </p>
            <button
              onClick={closeApp}
              className="inline-flex items-center gap-2 px-6 py-3 bg-red-500/90 hover:bg-red-500 rounded-2xl text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-red-500/30 active:scale-95 transition-all"
            >
              <X size={16} /> Close App
            </button>
          </>
        )}
      </div>
    </div>
  );
}
