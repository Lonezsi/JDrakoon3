import { useMemo, useState } from "react";
import { icons as lucideIcons, Search, X } from "lucide-react";
import { useModalLayer, Focusable } from "../../navigation/Focusable";

// All lucide icon names (PascalCase). ~1500 of them, so we only render the
// matches for the current search (capped) to stay fast.
const ALL_NAMES = Object.keys(lucideIcons).filter(
  // drop the alias/helper exports that aren't real icons
  (n) => /^[A-Z]/.test(n) && n !== "Icon" && n !== "createLucideIcon",
);

const CAP = 240;

// Navigable modal: the icon grid is a gamepad focus graph (and it's a real
// scroll container, so the engine's scrollIntoView keeps the focused icon in
// view). onPick(name) → caller stores the name.
export function IconPicker({
  current,
  onPick,
  onClose,
}: {
  current?: string;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  useModalLayer("iconpicker", true, onClose);
  const L = "iconpicker";

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? ALL_NAMES.filter((n) => n.toLowerCase().includes(needle))
      : ALL_NAMES;
    return list.slice(0, CAP);
  }, [q]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "#00000088", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[80vh] flex flex-col rounded-3xl overflow-hidden"
        style={{
          background: "rgba(12,12,18,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 30px 70px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-white/5">
          <h2 className="text-lg font-black italic uppercase tracking-tight text-white">
            Pick an icon
          </h2>
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">
            {matches.length === CAP ? `${CAP}+` : matches.length} shown
          </span>
          <Focusable
            id="iconpicker-close"
            layer={L}
            onSelect={onClose}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X size={14} />
          </Focusable>
        </div>

        <div className="px-5 py-3 border-b border-white/5">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search icons (e.g. gamepad, video, folder)…"
              className="w-full bg-white/5 border border-white/8 rounded-2xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none focus:border-indigo-500/40"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scroll">
          <div className="grid grid-cols-8 gap-2 sm:grid-cols-10">
            {matches.map((name, i) => {
              const Ico = lucideIcons[name as keyof typeof lucideIcons] as any;
              const active = name === current;
              return (
                <Focusable
                  key={name}
                  id={`icon-${name}`}
                  layer={L}
                  // Land on the current icon, else the first match.
                  initial={current ? active : i === 0}
                  title={name}
                  onSelect={() => {
                    onPick(name);
                    onClose();
                  }}
                  focusedClassName="ring-2 ring-indigo-400 text-white bg-white/10"
                  className={`aspect-square flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                    active
                      ? "bg-indigo-500/25 border-indigo-400/60 text-white"
                      : "bg-white/[0.03] border-white/8 text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20"
                  }`}
                >
                  <Ico size={20} />
                </Focusable>
              );
            })}
          </div>
          {matches.length === 0 && (
            <p className="text-center text-[11px] font-black uppercase tracking-widest text-gray-600 py-10">
              No icons match “{q}”.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
