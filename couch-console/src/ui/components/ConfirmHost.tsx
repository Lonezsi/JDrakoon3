import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  subscribeConfirm,
  settleConfirm,
  type ConfirmOptions,
} from "../../services/confirmService";
import { useModalLayer, Focusable } from "../../navigation/Focusable";

// Renders the styled confirm/alert dialog driven by confirmService. Mount once
// at app root. Esc cancels, Enter confirms.
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmOptions | null>(null);

  // Trap gamepad/keyboard nav in the dialog while it's open; back = cancel.
  useModalLayer("confirm", !!req, () => settleConfirm(false));

  useEffect(() => subscribeConfirm((r) => setReq(r)), []);

  useEffect(() => {
    if (!req) return;
    // Only Escape is a global shortcut (always cancel). Enter is intentionally
    // NOT handled here — it's routed through the focus engine's "select" so it
    // activates the FOCUSED button (Cancel cancels, Confirm confirms). Handling
    // Enter here too would override that and always confirm.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settleConfirm(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [req]);

  if (!req) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "#00000088", backdropFilter: "blur(8px)" }}
      onClick={() => settleConfirm(false)}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "rgba(12,12,18,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 30px 70px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-start gap-3">
            {req.danger && (
              <span className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-xl bg-red-500/15 border border-red-400/30 flex items-center justify-center text-red-400">
                <AlertTriangle size={16} />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-black italic uppercase tracking-tight text-white leading-tight">
                {req.title}
              </h2>
              {req.message && (
                <p className="text-sm text-slate-400 mt-1.5 leading-snug">
                  {req.message}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 pb-6">
          {!req.alert && (
            <Focusable
              id="confirm-cancel"
              layer="confirm"
              focusOnHover
              onSelect={() => settleConfirm(false)}
              className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-white cursor-pointer"
            >
              {req.cancelText || "Cancel"}
            </Focusable>
          )}
          <Focusable
            id="confirm-ok"
            layer="confirm"
            initial
            focusOnHover
            onSelect={() => settleConfirm(true)}
            className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest text-white cursor-pointer ${
              req.danger
                ? "bg-red-600 hover:bg-red-500"
                : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {req.confirmText || "Confirm"}
          </Focusable>
        </div>
      </div>
    </div>
  );
}
