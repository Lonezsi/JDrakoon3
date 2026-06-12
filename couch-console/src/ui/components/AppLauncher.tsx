import { useEffect, useState, useCallback } from "react";
import {
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  icons as lucideIcons,
} from "lucide-react";
import { launchApp } from "../../services/launcherService";
import { notifService } from "../../services/notificationService";
import { subscribe } from "../../services/socket";
import { useFocusable } from "../../navigation/FocusContext";
import { IconPicker } from "./IconPicker";
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

function AppCard({
  app,
  initial,
  onEdit,
  onDelete,
}: {
  app: AppDefinition;
  initial: boolean;
  onEdit: (app: AppDefinition) => void;
  onDelete: (app: AppDefinition) => void;
}) {
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
      className={`group relative flex-shrink-0 transition-all duration-500 ${
        focused ? "w-60 h-60 scale-110 z-10" : "w-44 h-44"
      }`}
    >
      {/* Edit / delete — mouse-only, shown on hover or when focused. Not part
          of the gamepad focus graph (managing apps is a pointer task). */}
      <div
        className={`absolute -top-2 -right-2 z-30 flex gap-1 transition-opacity ${
          focused ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <button
          title="Edit"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(app);
          }}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-[#12121c] border border-white/15 text-gray-300 hover:text-white hover:border-indigo-400/60 shadow-lg"
        >
          <Pencil size={13} />
        </button>
        <button
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(app);
          }}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-[#12121c] border border-white/15 text-red-400 hover:text-red-300 hover:border-red-400/60 shadow-lg"
        >
          <Trash2 size={13} />
        </button>
      </div>

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

// Mouse-first editor for a single app tile. Patches settings.apps[id].
function AppEditor({
  app,
  onClose,
  onSaved,
}: {
  app: AppDefinition;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(app.name);
  const [launcher, setLauncher] = useState(app.launcher || "");
  const [hex, setHex] = useState(app.hex || "#6366f1");
  const [icon, setIcon] = useState(app.icon || "");
  const [pickingIcon, setPickingIcon] = useState(false);

  const isImageIcon =
    /^https?:\/\//i.test(icon) ||
    /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(icon) ||
    /[\\/]/.test(icon);
  const PreviewIcon: any = !isImageIcon
    ? lucideIcons[icon as keyof typeof lucideIcons] || lucideIcons.AppWindow
    : null;

  const save = () => {
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apps: { [app.id]: { name: name.trim() || app.id, launcher, hex, icon } },
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.ok) {
          notifService.push(`Saved ${name}`);
          onSaved();
          onClose();
        } else notifService.push("Failed to save app");
      })
      .catch(() => notifService.push("Failed to save app"));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "#00000088", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl overflow-hidden"
        style={{
          background: "rgba(12,12,18,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 30px 70px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/5">
          <h2 className="text-xl font-black italic uppercase tracking-tight text-white">
            Edit app
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/40"
            />
          </Field>

          <Field label="Launcher (exe path or steam:// …)">
            <input
              value={launcher}
              onChange={(e) => setLauncher(e.target.value)}
              placeholder="C:\\path\\to\\app.exe"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-indigo-500/40"
            />
          </Field>

          <Field label="Color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={hex}
                onChange={(e) => setHex(e.target.value)}
                className="w-9 h-9 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                style={{ padding: 0 }}
              />
              <input
                value={hex}
                onChange={(e) => setHex(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-indigo-500/40"
              />
            </div>
          </Field>

          <Field label="Icon (lucide name or image path/URL)">
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white overflow-hidden flex-shrink-0"
                style={{ background: isImageIcon ? "rgba(255,255,255,0.06)" : hex }}
              >
                {isImageIcon ? (
                  <img
                    src={
                      /^https?:\/\//i.test(icon)
                        ? icon
                        : `/api/app-icon?path=${encodeURIComponent(icon)}`
                    }
                    alt=""
                    className="w-full h-full object-contain p-0.5"
                  />
                ) : (
                  <PreviewIcon size={18} />
                )}
              </div>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="Gamepad2  ·  or  C:\\icon.png"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-indigo-500/40"
              />
              <button
                onClick={() => setPickingIcon(true)}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:text-white hover:bg-white/10"
              >
                Browse
              </button>
            </div>
          </Field>
        </div>

        <div className="flex justify-end gap-2 px-6 pb-6">
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

      {pickingIcon && (
        <IconPicker
          current={icon}
          onPick={(n) => setIcon(n)}
          onClose={() => setPickingIcon(false)}
        />
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

// "Add System" picker: lists installed apps (Start Menu + Steam) from the
// backend, searchable, plus a manual path field. Mouse-first.
function InstalledAppsPicker({
  onAdd,
  onClose,
}: {
  onAdd: (launcher: string) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<{ name: string; launcher: string }[] | null>(
    null,
  );
  const [q, setQ] = useState("");
  const [manual, setManual] = useState("");

  const load = useCallback((refresh = false) => {
    setList(null);
    fetch(`/api/installed-apps${refresh ? "?refresh=1" : ""}`)
      .then((r) => r.json())
      .then((d) => setList(d.apps || []))
      .catch(() => setList([]));
  }, []);

  useEffect(() => load(false), [load]);

  const matches = (list || []).filter((a) =>
    a.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "#00000088", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-3xl overflow-hidden"
        style={{
          background: "rgba(12,12,18,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 30px 70px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-white/5">
          <h2 className="text-xl font-black italic uppercase tracking-tight text-white">
            Add a system
          </h2>
          <button
            onClick={() => load(true)}
            className="ml-auto px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:text-white hover:bg-white/10"
          >
            Rescan
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-white/5">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search installed apps…"
            className="w-full bg-white/5 border border-white/8 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none focus:border-indigo-500/40"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 custom-scroll">
          {list === null && (
            <p className="text-center text-[11px] font-black uppercase tracking-widest text-gray-600 py-10">
              Scanning…
            </p>
          )}
          {list !== null && matches.length === 0 && (
            <p className="text-center text-[11px] font-black uppercase tracking-widest text-gray-600 py-10">
              {list.length === 0 ? "No apps found" : `No match for “${q}”`}
            </p>
          )}
          {matches.map((a) => (
            <button
              key={a.launcher}
              onClick={() => {
                onAdd(a.launcher);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/10 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-xs font-black flex-shrink-0">
                {a.name[0]?.toUpperCase() || "?"}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{a.name}</p>
                <p className="text-[10px] text-gray-600 font-mono truncate">
                  {a.launcher}
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-white/5">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manual.trim()) {
                onAdd(manual.trim());
                onClose();
              }
            }}
            placeholder="…or paste a path / steam:// URI"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-indigo-500/40"
          />
          <button
            onClick={() => {
              if (manual.trim()) {
                onAdd(manual.trim());
                onClose();
              }
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[11px] font-black uppercase tracking-widest text-white"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppLauncher() {
  const [apps, setApps] = useState<AppDefinition[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const [editing, setEditing] = useState<AppDefinition | null>(null);
  const [picking, setPicking] = useState(false);

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

  const deleteApp = useCallback(
    (app: AppDefinition) => {
      if (!window.confirm(`Remove "${app.name}" from the library?`)) return;
      fetch(`/api/apps/${encodeURIComponent(app.id)}`, { method: "DELETE" })
        .then((r) => r.json())
        .then((res) => {
          if (res?.ok) {
            notifService.push(`Removed ${app.name}`);
            loadApps();
          } else notifService.push("Failed to remove app");
        })
        .catch(() => notifService.push("Failed to remove app"));
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
          <AppCard
            key={app.id}
            app={app}
            initial={idx === 0}
            onEdit={setEditing}
            onDelete={deleteApp}
          />
        ))}
        <div
          className={`flex-shrink-0 w-44 h-44 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${
            dropActive
              ? "border-indigo-400 text-indigo-300 bg-indigo-500/10"
              : "border-white/10 text-gray-700 hover:text-gray-500 hover:border-white/20"
          }`}
          onClick={() => setPicking(true)}
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

      {editing && (
        <AppEditor
          app={editing}
          onClose={() => setEditing(null)}
          onSaved={loadApps}
        />
      )}

      {picking && (
        <InstalledAppsPicker onAdd={addApp} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}
