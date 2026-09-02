import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

// Themed, mouse-first dropdown replacing the native <select> (whose popup is an
// unstyled white box that clashes with the dark UI). The menu is portaled to
// <body> at a fixed position computed from the trigger, so it never clips
// inside scrolling/overflow-hidden containers (accounts panel, modals).

export interface DropdownOption {
  value: string;
  label: string;
}

export function Dropdown({
  value,
  options,
  onChange,
  title,
  placeholder = "—",
  className = "",
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  title?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    // Any scroll/resize invalidates the computed position → just close.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setRect(r);
    setOpen((o) => !o);
  };

  // Cap the menu so it stays on screen; flip above if there's no room below.
  const menuMaxH = 240;
  const below = rect ? window.innerHeight - rect.bottom : 0;
  const flipUp = rect ? below < menuMaxH && rect.top > below : false;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-tip={title}
        onClick={toggle}
        className={
          className ||
          "inline-flex items-center justify-between gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white outline-none hover:bg-white/10 focus:border-indigo-500/40 min-w-0"
        }
      >
        <span className="truncate">{current?.label ?? placeholder}</span>
        <ChevronDown
          size={12}
          className={`flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        rect &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[90]"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            />
            <div
              className="fixed z-[91] py-1 rounded-xl border border-white/10 shadow-2xl overflow-y-auto custom-scroll"
              style={{
                left: rect.left,
                minWidth: rect.width,
                maxWidth: Math.max(rect.width, 260),
                maxHeight: menuMaxH,
                background: "rgba(18,18,26,0.99)",
                ...(flipUp
                  ? { bottom: window.innerHeight - rect.top + 4 }
                  : { top: rect.bottom + 4 }),
              }}
            >
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-bold truncate ${
                    o.value === value
                      ? "bg-indigo-500/20 text-indigo-200"
                      : "text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
