import { useEffect, useState, useCallback } from "react";
import { ChevronRight, Plus, icons as lucideIcons } from "lucide-react";
import { launchApp } from "../../services/launcherService";
import { notifService } from "../../services/notificationService";
import { subscribe } from "../../services/socket";
import { useFocusable } from "../../navigation/FocusContext";
import type { AppDefinition } from "../../shared/types";

const ADD_PALETTE = [
  "#6366f1",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#f97316",
];

function AppCard({ app, initial }: { app: AppDefinition; initial: boolean }) {
  const { ref, focused } = useFocusable<HTMLDivElement>(`app-${app.id}`, {
    onSelect: () => launchApp(app),
    initial,
  });

  // Icon resolution (set per-app in Settings):
  //  1. an image path/URL  -> <img> (local paths stream via /api/app-icon)
  //  2. a lucide icon name  -> that icon
  //  3. empty / unknown     -> default lucide AppWindow
  const iconStr = (app.icon || "").trim();
  const isImage =
    /^https?:\/\//i.test(iconStr) ||
    /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(iconStr) ||
    /[\\/]/.test(iconStr);
  const imgSrc = isImage
    ? /^https?:\/\//i.test(iconStr)
      ? iconStr
      : `/api/app-icon?path=${encodeURIComponent(iconStr)}`
    : null;
  const Icon: any = !isImage
    ? lucideIcons[iconStr as keyof typeof lucideIcons] || lucideIcons.AppWindow
    : undefined;

  return (
    <div
      ref={ref}
      className={`relative flex-shrink-0 transition-all duration-500 ${
        focused ? "w-60 h-60 scale-110 z-10" : "w-44 h-44"
      }`}
    >
      {/* Layer 1: Colored glow */}
      <div
        className={`absolute inset-0 blur-3xl rounded-3xl transition-opacity duration-700 ease-in-out ${
          focused ? "opacity-25" : "opacity-0"
        }`}
        style={{ background: app.hex }}
      />

      {/* Layer 2: Frosted glass */}
      <div
        className={`absolute inset-0 rounded-3xl backdrop-blur-sm transition-opacity duration-700 ease-in-out ${
          focused ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Card */}
      <div
        className={`relative z-10 w-full h-full rounded-3xl p-5 flex flex-col justify-between border cursor-pointer
            ${
              focused
                ? "bg-white/10 border-white/35 shadow-2xl"
                : "bg-white/5 border-white/8 grayscale hover:border-white/20 hover:grayscale-0 transition-all duration-300"
            }`}
        onClick={() => launchApp(app)}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg text-xl font-black text-white overflow-hidden"
          style={{ background: imgSrc ? "rgba(255,255,255,0.06)" : app.hex }}
        >
          {imgSrc ? (
            <img
              src={imgSrc}
              alt=""
              className="w-full h-full object-contain p-1"
              draggable={false}
            />
          ) : Icon ? (
            <Icon size={26} />
          ) : (
            app.name[0]?.toUpperCase() || "?"
          )}
        </div>
        <div>
          <h3 className="text-xl font-black tracking-tight italic uppercase leading-none">
            {app.name}
          </h3>
          <p className="text-[10px] text-gray-500 mt-1 uppercase font-black">
            {focused
              ? "Press Enter / Click / A"
              : app.launcher
                ? "Local App"
                : "No launcher set"}
          </p>
        </div>
        {focused && (
          <div className="absolute -bottom-3 right-5 bg-indigo-500 p-1.5 rounded-full shadow-lg shadow-indigo-500/50">
            <ChevronRight size={16} />
          </div>
        )}
      </div>
    </div>
  );
}

export function AppLauncher() {
  const [apps, setApps] = useState<AppDefinition[]>([]);
  const [dropActive, setDropActive] = useState(false);

  // Apps live in settings (settings.apps) so they're editable from the
  // Settings modal; reload whenever any client changes settings.
  const loadApps = useCallback(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        const list = Object.entries(s.apps || {}).map(
          ([id, a]: [string, any]) => ({
            id,
            name: a?.name || id,
            launcher: a?.launcher || undefined,
            hex: a?.hex || "#6366f1",
            icon: a?.icon || undefined,
          }),
        );
        setApps(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadApps();
    const unsub = subscribe((msg) => {
      if (msg.type === "settings_updated") loadApps();
    });
    return unsub;
  }, [loadApps]);

  // Persist a new app into settings; PATCH deep-merges, so this only adds.
  const addApp = useCallback(
    (launcher: string) => {
      const clean = launcher.trim().replace(/^"+|"+$/g, "");
      if (!clean) return;
      const base =
        clean
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.exe$/i, "")
          ?.replace(/:.*$/, "") || "app";
      const id = base.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "app";
      const name = base.charAt(0).toUpperCase() + base.slice(1);
      const hex = ADD_PALETTE[Math.floor(Math.random() * ADD_PALETTE.length)];
      fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apps: { [id]: { name, launcher: clean, hex, icon: "AppWindow" } },
        }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (res?.ok) {
            notifService.push(`Added ${name} to the library`);
            loadApps();
          } else {
            notifService.push("Failed to add app");
          }
        })
        .catch(() => notifService.push("Failed to add app"));
    },
    [loadApps],
  );

  // Drop an .exe (or a path / steam:// text) anywhere on the row to add it.
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDropActive(false);

      const text =
        e.dataTransfer.getData("text/plain")?.trim() ||
        e.dataTransfer.getData("text/uri-list")?.trim();
      if (text) {
        addApp(text.replace(/^file:\/\/\//i, "").replace(/\//g, "\\"));
        return;
      }

      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".exe")) {
        notifService.push("Only .exe files (or path text) can be dropped");
        return;
      }
      // The browser hides the file's real path — ask the backend to find it.
      notifService.push(`Locating ${file.name}…`);
      try {
        const res = await fetch("/api/apps/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name }),
        });
        const data = await res.json();
        if (data?.ok && data.path) addApp(data.path);
        else
          notifService.push(
            `Couldn't locate ${file.name} — drop its full path as text instead`,
          );
      } catch {
        notifService.push("Resolve failed — is the backend running?");
      }
    },
    [addApp],
  );

  return (
    <div
      className="flex-1 flex flex-col mt-10 gap-6"
      onDragOver={(e) => {
        e.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-3 px-2">
        <span className="px-2.5 py-1 bg-indigo-500 rounded text-[10px] font-black uppercase tracking-wider">
          Library
        </span>
        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
          {apps.length} Apps
        </span>
      </div>

      <div className="flex gap-5 items-center h-64 overflow-visible px-2">
        {apps.map((app, idx) => (
          <AppCard key={app.id} app={app} initial={idx === 0} />
        ))}
        <div
          className={`flex-shrink-0 w-44 h-44 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${
            dropActive
              ? "border-indigo-400 text-indigo-300 bg-indigo-500/10"
              : "border-white/10 text-gray-700 hover:text-gray-500 hover:border-white/20"
          }`}
          onClick={() => {
            const typed = window.prompt(
              "Path to .exe or protocol URI (steam://…):",
            );
            if (typed) addApp(typed);
          }}
        >
          <Plus size={20} />
          <span className="text-[10px] font-bold mt-2 uppercase tracking-widest">
            {dropActive ? "Drop to add" : "Add System"}
          </span>
          <span className="text-[8px] mt-1 uppercase tracking-widest opacity-70">
            drag an .exe here
          </span>
        </div>
      </div>
    </div>
  );
}
