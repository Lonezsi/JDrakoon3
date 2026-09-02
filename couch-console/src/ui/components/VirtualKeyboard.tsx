import { useEffect, useRef, useState } from "react";
import { ArrowBigUp, Delete, CornerDownLeft, X, Space } from "lucide-react";
import { getSocket } from "../../services/socket";
import { useModalLayer, Focusable } from "../../navigation/Focusable";

// On-screen keyboard driven by the gamepad (opened with Start on the dashboard).
// Keys type real OS keystrokes via the same `control` channel the phone uses,
// so it types into whatever has OS focus (a dashboard field, or a foreground
// app). Navigate with the d-pad/stick, A to press a key, B to close.

type Key =
  | { ch: string } // a character (case follows shift)
  | { sp: "shift" | "back" | "enter" | "space" | "tab" | "close"; w?: number };

const ROWS: Key[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((ch) => ({ ch })),
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"].map((ch) => ({ ch })),
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"].map((ch) => ({ ch })),
  [
    { sp: "shift" } as Key,
    ...["z", "x", "c", "v", "b", "n", "m"].map((ch) => ({ ch }) as Key),
    { sp: "back" } as Key,
  ],
  [
    { sp: "tab" } as Key,
    { sp: "space", w: 5 } as Key,
    { sp: "enter" } as Key,
    { sp: "close" } as Key,
  ],
];

function send(kind: string, payload: Record<string, unknown> = {}) {
  getSocket()?.emit("control", { kind, ...payload });
}

type Field = HTMLInputElement | HTMLTextAreaElement;
// Set an input's value the React-friendly way (native setter + bubbling input
// event) so controlled components update.
function setValue(el: Field, value: string, caret: number) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  try {
    el.selectionStart = el.selectionEnd = caret;
  } catch {
    /* number/email inputs disallow selection — ignore */
  }
}
function insertInto(el: Field, text: string) {
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? el.value.length;
  setValue(el, el.value.slice(0, s) + text + el.value.slice(e), s + text.length);
}
function backspaceField(el: Field) {
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? el.value.length;
  if (s === e && s > 0) setValue(el, el.value.slice(0, s - 1) + el.value.slice(e), s - 1);
  else if (s !== e) setValue(el, el.value.slice(0, s) + el.value.slice(e), s);
}

export function VirtualKeyboard() {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(false);
  // The text field that was focused when the keyboard opened (if any). When set,
  // keys edit it directly (works for any focused dashboard input); otherwise we
  // fall back to sending real OS keystrokes.
  const target = useRef<Field | null>(null);

  useModalLayer("vkb", open, () => setOpen(false));
  const L = "vkb";

  useEffect(() => {
    const onOpen = () => setOpen((o) => !o); // Start toggles it
    window.addEventListener("open-vkb", onOpen);
    return () => window.removeEventListener("open-vkb", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = document.activeElement as Element | null;
    target.current =
      el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")
        ? (el as Field)
        : null;
  }, [open]);

  if (!open) return null;

  const field = () => target.current;
  const press = (k: Key) => {
    const el = field();
    if ("ch" in k) {
      const text = shift ? k.ch.toUpperCase() : k.ch;
      if (el) insertInto(el, text);
      else send("text", { text });
      return;
    }
    switch (k.sp) {
      case "shift":
        setShift((s) => !s);
        break;
      case "back":
        if (el) backspaceField(el);
        else send("key", { key: "BACKSPACE" });
        break;
      case "enter":
        if (el)
          el.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
          );
        else send("key", { key: "ENTER" });
        break;
      case "space":
        if (el) insertInto(el, " ");
        else send("text", { text: " " });
        break;
      case "tab":
        if (!el) send("key", { key: "TAB" });
        break;
      case "close":
        setOpen(false);
        break;
    }
  };

  const label = (k: Key) => {
    if ("ch" in k) return shift ? k.ch.toUpperCase() : k.ch;
    switch (k.sp) {
      case "shift":
        return <ArrowBigUp size={18} />;
      case "back":
        return <Delete size={18} />;
      case "enter":
        return <CornerDownLeft size={18} />;
      case "space":
        return <Space size={18} />;
      case "tab":
        return "tab";
      case "close":
        return <X size={18} />;
    }
  };
  const keyId = (r: number, c: number) => `vkb-${r}-${c}`;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
      style={{
        background: "linear-gradient(to top, rgba(4,4,10,0.97), transparent)",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-3xl rounded-2xl p-3 space-y-1.5"
        style={{
          background: "rgba(12,12,18,0.98)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
            Keyboard · types to the screen
          </span>
          {shift && (
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">
              Shift
            </span>
          )}
        </div>
        {ROWS.map((row, r) => (
          <div key={r} className="flex gap-1.5 justify-center">
            {row.map((k, c) => (
              <Focusable
                key={c}
                id={keyId(r, c)}
                layer={L}
                initial={r === 1 && c === 0}
                onSelect={() => press(k)}
                focusedClassName="ring-2 ring-indigo-400 bg-white/15"
                className="h-11 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white text-sm font-bold cursor-pointer select-none"
                style={{
                  flex: "sp" in k && k.w ? k.w : 1,
                  minWidth: 34,
                  background:
                    "sp" in k && k.sp === "shift" && shift
                      ? "rgba(99,102,241,0.3)"
                      : undefined,
                }}
              >
                {label(k)}
              </Focusable>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
