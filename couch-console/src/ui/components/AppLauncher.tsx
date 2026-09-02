import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  useLayoutEffect,
} from "react";
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
import { confirm } from "../../services/confirmService";
import { subscribe } from "../../services/socket";
import { useFocus, useFocusable } from "../../navigation/FocusContext";
import { useModalLayer, Focusable } from "../../navigation/Focusable";
import { IconPicker } from "./IconPicker";
import { FocusInput } from "./FocusInput";
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

// Card design size (w-44). The whole card is authored at this size and scaled
// with a single transform so the text + icon scale together (no overflow), while
// the outer box carries the SCALED width/margin so neighbours pack tighter as
// they shrink (the gap scales with the card).
const CARD_BASE = 200;
const CARD_GAP = 22;

// Strip a trailing extension from a launcher-derived name (e.g. "Notepad.exe").
function formatAppName(name: string): string {
  return (name || "").replace(/\.(exe|lnk|app|url|bat|cmd)$/i, "");
}

function AppCard({
  app,
  initial,
  scale,
  onEdit,
  onDelete,
}: {
  app: AppDefinition;
  initial: boolean;
  /** Layout+visual scale for this card (focused biggest, farther smaller). */
  scale: number;
  onEdit: (app: AppDefinition) => void;
  onDelete: (app: AppDefinition) => void;
}) {
  const { ref, focused } = useFocusable<HTMLDivElement>(`app-${app.id}`, {
    onSelect: () => launchApp(app),
    initial,
    noScroll: true, // the carousel self-positions via translateX
  });
  // Edit / delete are selectable (gamepad-reachable), but ONLY for the focused
  // card — otherwise every off-screen card's hidden buttons would clutter the
  // nav graph. They stay registered while focus is on the card or either button.
  const { focusedId } = useFocus();
  const editId = `app-${app.id}-edit`;
  const delId = `app-${app.id}-del`;
  const actionsActive = focused || focusedId === editId || focusedId === delId;
  const editFocus = useFocusable<HTMLButtonElement>(editId, {
    onSelect: () => onEdit(app),
    enabled: actionsActive,
    noScroll: true,
  });
  const delFocus = useFocusable<HTMLButtonElement>(delId, {
    onSelect: () => onDelete(app),
    enabled: actionsActive,
    noScroll: true,
  });
  const showActions = actionsActive;

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
  const Icon: any =
    lucideIcons[iconStr as keyof typeof lucideIcons] || lucideIcons.AppWindow;
  // If a streamed icon fails (extraction miss / file gone), fall back to lucide.
  const [imgFailed, setImgFailed] = useState(false);
  const useImg = isImage && !!imgSrc && !imgFailed;

  return (
    <div
      ref={ref}
      data-app-card
      className="group relative flex-shrink-0 transition-all duration-[600ms] ease-out"
      style={{
        width: CARD_BASE * scale,
        height: CARD_BASE * scale,
        marginRight: CARD_GAP * scale,
        zIndex: focused ? 10 : 1,
      }}
    >
      {/* Inner is authored at CARD_BASE and scaled as one unit — text/icon scale
          with it (no overflow), and transform (unlike opacity/filter) doesn't
          break the frosted-glass backdrop-blur below. */}
      <div
        className="absolute top-0 left-0 transition-transform duration-[600ms] ease-out"
        style={{
          width: CARD_BASE,
          height: CARD_BASE,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {/* Edit / delete — selectable (focusable) + mouse; shown when the card
            or either button is focused, or on hover. */}
        <div
          className={`absolute -top-2 -right-2 z-30 flex gap-1 transition-opacity ${
            showActions ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <button
            ref={editFocus.ref}
            data-tip="Edit app"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(app);
            }}
            className={`w-8 h-8 flex items-center justify-center rounded-full bg-[#12121c] border shadow-lg ${
              editFocus.focused
                ? "border-indigo-400 text-white ring-2 ring-indigo-400"
                : "border-white/15 text-gray-300 hover:text-white hover:border-indigo-400/60"
            }`}
          >
            <Pencil size={13} />
          </button>
          <button
            ref={delFocus.ref}
            data-tip="Delete app"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(app);
            }}
            className={`w-8 h-8 flex items-center justify-center rounded-full bg-[#12121c] border shadow-lg ${
              delFocus.focused
                ? "border-red-400 text-red-200 ring-2 ring-red-400"
                : "border-white/15 text-red-400 hover:text-red-300 hover:border-red-400/60"
            }`}
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Layer 1: Colored glow (bleeds out — the viewport lets it overflow) */}
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
          className={`relative z-10 w-full h-full rounded-3xl p-5 flex flex-col justify-between border cursor-pointer overflow-hidden
            ${
              focused
                ? "bg-white/10 border-white/35 shadow-2xl"
                : "bg-white/5 border-white/8 grayscale hover:border-white/20 hover:grayscale-0 transition-all duration-300"
            }`}
          onClick={() => launchApp(app)}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg text-xl font-black text-white overflow-hidden flex-shrink-0"
            style={{ background: useImg ? "rgba(255,255,255,0.06)" : app.hex }}
          >
            {useImg ? (
              <img
                src={imgSrc!}
                alt=""
                className="w-full h-full object-contain p-1"
                draggable={false}
                onError={() => setImgFailed(true)}
              />
            ) : (
              <Icon size={26} />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-black tracking-tight italic uppercase leading-none truncate">
              {formatAppName(app.name)}
            </h3>
            <p className="text-[10px] text-gray-500 mt-1 uppercase font-black truncate">
              {focused
                ? "Press Enter / Click / A"
                : app.launcher
                  ? "Local App"
                  : "No launcher set"}
            </p>
          </div>
          {focused && (
            <div className="absolute bottom-3 right-3 bg-indigo-500 p-1.5 rounded-full shadow-lg shadow-indigo-500/50">
              <ChevronRight size={16} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// The "Add System" tile — focusable (selectable), scales like the app cards.
function AddCard({
  scale,
  dropActive,
  onPick,
}: {
  scale: number;
  dropActive: boolean;
  onPick: () => void;
}) {
  const { ref, focused } = useFocusable<HTMLDivElement>("app-add", {
    onSelect: onPick,
    noScroll: true,
  });
  return (
    <div
      ref={ref}
      data-app-card
      className="relative flex-shrink-0 transition-all duration-[600ms] ease-out"
      style={{ width: CARD_BASE * scale, height: CARD_BASE * scale }}
    >
      <div
        className="absolute top-0 left-0 transition-transform duration-[600ms] ease-out"
        style={{
          width: CARD_BASE,
          height: CARD_BASE,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div
          onClick={onPick}
          className={`w-full h-full rounded-3xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${
            focused
              ? "border-indigo-400 text-indigo-300 bg-indigo-500/10 ring-2 ring-indigo-400"
              : dropActive
                ? "border-indigo-400 text-indigo-300 bg-indigo-500/10"
                : "border-white/10 text-gray-700 hover:text-gray-500 hover:border-white/20"
          }`}
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

  // Navigable like Settings: trap focus while open, back = close. The IconPicker
  // (when open) pushes its own layer on top, so we suspend ours meanwhile.
  useModalLayer("appeditor", !pickingIcon, onClose);
  const L = "appeditor";

  const isImageIcon =
    /^https?:\/\//i.test(icon) ||
    /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(icon) ||
    /[\\/]/.test(icon);
  const PreviewIcon: any = !isImageIcon
    ? lucideIcons[icon as keyof typeof lucideIcons] || lucideIcons.AppWindow
    : null;
  // A colour not in the preset palette → the custom-picker swatch lights up.
  const isCustomColor = !ADD_PALETTE.some(
    (c) => c.toLowerCase() === hex.toLowerCase(),
  );

  const save = () => {
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apps: {
          [app.id]: { name: name.trim() || app.id, launcher, hex, icon },
        },
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
          <Focusable
            id="appedit-close"
            layer={L}
            onSelect={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X size={14} />
          </Focusable>
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
            <div className="flex items-center gap-2 flex-wrap">
              {ADD_PALETTE.map((c) => {
                const sel = hex.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    onClick={() => setHex(c)}
                    title={c}
                    className="w-8 h-8 rounded-[11px] transition-transform"
                    style={{
                      background: c,
                      outline: sel ? "2px solid white" : "none",
                      outlineOffset: 2,
                      transform: sel ? "scale(1.12)" : "none",
                    }}
                  />
                );
              })}

              {/* Custom colour — squircle with a hidden native picker, mirrors
                  the swatch shape; glows + shows a check when a custom colour
                  (not in the palette) is active. */}
              <div className="relative w-8 h-8 flex-shrink-0">
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                <div
                  className="w-8 h-8 rounded-[11px] border-2 border-dashed border-slate-500 flex items-center justify-center transition-all pointer-events-none"
                  style={{
                    backgroundColor: isCustomColor ? hex : "transparent",
                    boxShadow: isCustomColor
                      ? `0 0 0 3px #06060c, 0 0 0 5.5px ${hex}`
                      : "none",
                    transform: isCustomColor ? "scale(1.12)" : "scale(1)",
                  }}
                >
                  {isCustomColor ? (
                    <Check size={15} className="text-white" strokeWidth={3} />
                  ) : (
                    <span className="text-white text-xs font-black">+</span>
                  )}
                </div>
              </div>
            </div>
          </Field>

          <Field label="Icon (lucide name or image path/URL)">
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white overflow-hidden flex-shrink-0"
                style={{
                  background: isImageIcon ? "rgba(255,255,255,0.06)" : hex,
                }}
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
              <Focusable
                id="appedit-browse"
                layer={L}
                onSelect={() => setPickingIcon(true)}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                Browse
              </Focusable>
            </div>
          </Field>
        </div>

        <div className="flex justify-end gap-2 px-6 pb-6">
          <Focusable
            id="appedit-cancel"
            layer={L}
            onSelect={onClose}
            className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-white cursor-pointer"
          >
            Cancel
          </Focusable>
          <Focusable
            id="appedit-save"
            layer={L}
            initial
            onSelect={save}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[11px] font-black uppercase tracking-widest text-white cursor-pointer"
          >
            <Check size={13} /> Save
          </Focusable>
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

function AppItemIcon({ launcher, name }: { launcher: string; name: string }) {
  const isImage =
    /\.(exe|lnk)$/i.test(launcher) || /^[a-zA-Z]:[\\/]/.test(launcher);

  if (!isImage) {
    // Protocol URI (steam://) – just show letter
    return (
      <span className="text-xs font-black text-indigo-300">
        {name[0]?.toUpperCase() || "?"}
      </span>
    );
  }

  // Local file – load icon via backend
  return (
    <img
      src={`/api/app-icon?path=${encodeURIComponent(launcher)}`}
      alt=""
      className="w-full h-full object-contain p-0.5"
      onError={(e) => {
        // On error, hide the image and show a letter (inline style fallback)
        e.currentTarget.style.display = "none";
        const parent = e.currentTarget.parentElement;
        if (parent) {
          const span = document.createElement("span");
          span.className = "text-xs font-black text-indigo-300";
          span.textContent = name[0]?.toUpperCase() || "?";
          parent.appendChild(span);
        }
      }}
    />
  );
}

// ---- NEW: usePreloadedIcons with content-type validation ----
function usePreloadedIcons(apps: { name: string; launcher: string }[] | null) {
  const [iconMap, setIconMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!apps || apps.length === 0) {
      setIconMap(new Map());
      return;
    }

    let cancelled = false;
    const newMap = new Map<string, string>();

    const loadIcons = async () => {
      const promises = apps.map(async (app) => {
        const isImage =
          /\.(exe|lnk)$/i.test(app.launcher) ||
          /^[a-zA-Z]:[\\/]/.test(app.launcher);
        if (!isImage) return null;

        try {
          const resp = await fetch(
            `/api/app-icon?path=${encodeURIComponent(app.launcher)}`,
          );
          if (!resp.ok) throw new Error("bad status");

          // Validate it's actually an image
          const contentType = resp.headers.get("Content-Type") || "";
          if (!contentType.startsWith("image/")) {
            throw new Error("not an image");
          }

          const blob = await resp.blob();
          const objectUrl = URL.createObjectURL(blob);
          return { launcher: app.launcher, url: objectUrl };
        } catch {
          // Any error → store null to trigger letter fallback
          return { launcher: app.launcher, url: null };
        }
      });

      const results = await Promise.all(promises);
      if (cancelled) {
        results.forEach((r) => {
          if (r && r.url) URL.revokeObjectURL(r.url);
        });
        return;
      }
      results.forEach((r) => {
        if (r && typeof r.url === "string") newMap.set(r.launcher, r.url);
      });
    };

    loadIcons();

    return () => {
      cancelled = true;
    };
  }, [apps]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      iconMap.forEach((url) => url && URL.revokeObjectURL(url));
    };
  }, [iconMap]);

  return iconMap;
}

// "Add System" picker: lists installed apps (Start Menu + Steam) from the
// backend, searchable, plus a manual path field.
function InstalledAppsPicker({
  onAdd,
  onClose,
}: {
  onAdd: (launcher: string) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<
    { name: string; launcher: string; game?: boolean }[] | null
  >(null);
  const [q, setQ] = useState("");
  const [manual, setManual] = useState("");

  useModalLayer("installedpicker", true, onClose);
  const L = "installedpicker";

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
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-white/5">
          <h2 className="text-xl font-black italic uppercase tracking-tight text-white">
            Add a system
          </h2>
          <Focusable
            id="pick-rescan"
            layer={L}
            onSelect={() => load(true)}
            className="ml-auto px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:text-white hover:bg-white/10"
          >
            Rescan
          </Focusable>
          <Focusable
            id="pick-close"
            layer={L}
            onSelect={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X size={14} />
          </Focusable>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-white/5">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search installed apps…"
            className="w-full bg-white/5 border border-white/8 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none focus:border-indigo-500/40"
          />
        </div>

        {/* List */}
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
          {matches.map((a, idx) => (
            <Focusable
              key={a.launcher}
              id={`pick-item-${idx}`}
              layer={L}
              initial={idx === 0}
              onSelect={() => {
                onAdd(a.launcher);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/10 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                <AppItemIcon launcher={a.launcher} name={a.name} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">
                  {formatAppName(a.name)}
                </p>
                <p className="text-[10px] text-gray-600 font-mono truncate">
                  {a.launcher}
                </p>
              </div>
              {a.game && (
                <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-indigo-500/20 text-[8px] font-black uppercase tracking-widest text-indigo-300">
                  Game
                </span>
              )}
            </Focusable>
          ))}
        </div>

        {/* Manual input */}
        <div className="flex gap-2 px-6 py-4 border-t border-white/5">
          <FocusInput
            id="pick-manual"
            layer={L}
            wrapperClassName="flex-1"
            value={manual}
            onChange={setManual}
            onEnter={() => {
              if (manual.trim()) {
                onAdd(manual.trim());
                onClose();
              }
            }}
            placeholder="…or paste a path / steam:// URI"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-indigo-500/40"
          />
          <Focusable
            id="pick-manualadd"
            layer={L}
            onSelect={() => {
              if (manual.trim()) {
                onAdd(manual.trim());
                onClose();
              }
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[11px] font-black uppercase tracking-widest text-white"
          >
            Add
          </Focusable>
          <Focusable
            id="pick-cancel"
            layer={L}
            onSelect={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-[11px] font-black uppercase tracking-widest text-gray-300 hover:text-white"
          >
            Cancel
          </Focusable>
        </div>
      </div>
    </div>
  );
}

export function AppLauncher() {
  const [apps, setApps] = useState<AppDefinition[]>([]);
  const [loaded, setLoaded] = useState(false); // first apps fetch finished?
  const [dropActive, setDropActive] = useState(false);
  const [editing, setEditing] = useState<AppDefinition | null>(null);
  const [picking, setPicking] = useState(false);

  const { focusedId, focusId } = useFocus();
  // Row "slots": app cards 0..n-1, then the Add card at index n. (Focus on an
  // edit/delete button leaves this -1, so the row holds its position.)
  const focusedIdx =
    focusedId === "app-add"
      ? apps.length
      : apps.findIndex((a) => `app-${a.id}` === focusedId);

  // Keep the last in-row index so the layout doesn't snap when focus leaves the
  // row (e.g. into the footer) — cards keep their sizes and the row stays put.
  const lastIdxRef = useRef(0);
  if (focusedIdx >= 0) lastIdxRef.current = focusedIdx;
  const displayIdx = focusedIdx >= 0 ? focusedIdx : lastIdxRef.current;

  // Per-card scale by distance from the focused card: focused biggest, farther
  // smaller. Drives both the visual size AND the layout box (so the gap scales).
  const scaleForDepth = (d: number) =>
    d === 0 ? 1.35 : Math.max(0.55, 1.05 - (d - 1) * 0.13);

  // Carousel: the row is positioned with translateX (not native scroll), so
  // there's no scroll-anchor "jump back" and the colour glow can bleed out of a
  // viewport that clips x but leaves y visible. The offset is computed from the
  // scale MODEL (final geometry), so a single smooth transition lands exactly —
  // no measuring of mid-transition layout.
  const FOCUS_LEFT_FRACTION = 0.18; // focused card sits ~18% from the left
  const rowRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  // Seed from the window so the FIRST paint positions correctly (a 1280 default
  // then a measured value caused a one-time jump on load); refine with the real
  // viewport width before paint via useLayoutEffect.
  const [vw, setVw] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  useLayoutEffect(() => {
    const measure = () =>
      setVw(viewportRef.current?.clientWidth || window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const offset = useMemo(() => {
    let edge = 0;
    for (let j = 0; j < displayIdx; j++) {
      const s = scaleForDepth(Math.abs(j - displayIdx));
      edge += (CARD_BASE + CARD_GAP) * s;
    }
    const focusedCenter = edge + (CARD_BASE * scaleForDepth(0)) / 2;
    return vw * FOCUS_LEFT_FRACTION - focusedCenter;
  }, [displayIdx, vw, apps.length]);

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
      .catch(() => {})
      .finally(() => setLoaded(true));
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
          ?.replace(/\.(exe|lnk)$/i, "")
          ?.replace(/:.*$/, "") || "app";
      const id = base.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "app";
      const fallbackName = base.charAt(0).toUpperCase() + base.slice(1);
      // A real local file (exe/lnk or drive path) gets its actual icon (the card
      // requests /api/app-icon?path=<launcher>) + the icon's average colour +
      // a tidy name. Protocol URIs (steam://) keep a lucide icon + random hue.
      const isFile =
        /\.(exe|lnk)$/i.test(clean) || /^[a-zA-Z]:[\\/]/.test(clean);

      const save = (name: string, hex: string, icon: string) =>
        fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apps: { [id]: { name, launcher: clean, hex, icon } },
          }),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res?.ok) {
              notifService.push(`Added ${name} to the library`);
              loadApps();
            } else notifService.push("Failed to add app");
          })
          .catch(() => notifService.push("Failed to add app"));

      const randomHue =
        ADD_PALETTE[Math.floor(Math.random() * ADD_PALETTE.length)];

      if (isFile) {
        fetch(`/api/app-meta?path=${encodeURIComponent(clean)}`)
          .then((r) => r.json())
          .then((m) =>
            save(m.name || fallbackName, m.color || randomHue, clean),
          )
          .catch(() => save(fallbackName, randomHue, "AppWindow"));
      } else {
        save(fallbackName, randomHue, "AppWindow");
      }
    },
    [loadApps],
  );

  const deleteApp = useCallback(
    (app: AppDefinition) => {
      confirm({
        title: `Remove "${app.name}"?`,
        message: "This removes it from your library.",
        confirmText: "Remove",
        danger: true,
      }).then((ok) => {
        if (!ok) {
          // Cancelled — reselect the app card (not the tiny delete button).
          focusId(`app-${app.id}`);
          return;
        }
        // Move focus to the NEXT app (or the previous if it was last, else the
        // Add card) BEFORE the deleted card unmounts — otherwise the focus
        // engine falls back to the first card.
        const idx = apps.findIndex((a) => a.id === app.id);
        const nextId = apps[idx + 1]?.id ?? apps[idx - 1]?.id ?? null;
        focusId(nextId ? `app-${nextId}` : "app-add");
        fetch(`/api/apps/${encodeURIComponent(app.id)}`, { method: "DELETE" })
          .then((r) => r.json())
          .then((res) => {
            if (res?.ok) {
              notifService.push(`Removed ${app.name}`);
              loadApps();
            } else notifService.push("Failed to remove app");
          })
          .catch(() => notifService.push("Failed to remove app"));
      });
    },
    [loadApps, apps, focusId],
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

      {/* Carousel viewport: clips horizontally, but leaves the vertical axis
          visible so the focused card's colour glow bleeds out (no top/bottom
          clip, no dark scrim). The row is positioned with translateX (computed
          analytically) so there's no scroll "jump back". */}
      <div
        ref={viewportRef}
        className="relative"
        style={{ overflowX: "clip", overflowY: "visible", height: 300 }}
      >
        <div
          ref={rowRef}
          className="flex items-center h-full w-max"
          style={{
            transform: `translateX(${offset}px)`,
            transition: "transform 600ms ease-out",
            willChange: "transform",
          }}
        >
          {!loaded ? (
            // Skeleton placeholders mirroring the carousel geometry while the
            // first apps fetch is in flight.
            Array.from({ length: 5 }).map((_, i) => {
              const s = scaleForDepth(i);
              return (
                <div
                  key={`sk-${i}`}
                  className="relative flex-shrink-0"
                  style={{
                    width: CARD_BASE * s,
                    height: CARD_BASE * s,
                    marginRight: CARD_GAP * s,
                  }}
                >
                  <div
                    className="absolute top-0 left-0"
                    style={{
                      width: CARD_BASE,
                      height: CARD_BASE,
                      transform: `scale(${s})`,
                      transformOrigin: "top left",
                    }}
                  >
                    <div className="w-full h-full rounded-3xl bg-white/5 border border-white/8 animate-pulse" />
                  </div>
                </div>
              );
            })
          ) : (
            <>
              {apps.map((app, idx) => (
                <AppCard
                  key={app.id}
                  app={app}
                  initial={idx === 0}
                  scale={scaleForDepth(Math.abs(idx - displayIdx))}
                  onEdit={setEditing}
                  onDelete={deleteApp}
                />
              ))}
              {/* Add card — scales with distance, selectable like the apps. */}
              <AddCard
                scale={scaleForDepth(Math.abs(apps.length - displayIdx))}
                dropActive={dropActive}
                onPick={() => setPicking(true)}
              />
            </>
          )}
        </div>
      </div>

      {editing && (
        <AppEditor
          app={editing}
          onClose={() => {
            const id = editing.id;
            setEditing(null);
            // Return focus to the app's card after editing/closing.
            focusId(`app-${id}`);
          }}
          onSaved={loadApps}
        />
      )}

      {picking && (
        <InstalledAppsPicker onAdd={addApp} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}
