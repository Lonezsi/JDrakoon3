import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** App-wide branded tooltip ("hover plate").
 *
 *  Mount once (near the app root). Any element with a `data-tip="…"` attribute
 *  shows a styled plate on hover — a portal so it never clips inside scroll
 *  containers/modals, positioned above the trigger (flips below near the top).
 *  Replaces native `title` tooltips, which look out of place on the dashboard. */
interface TipState {
  text: string;
  x: number;
  y: number;
  below: boolean;
}

export function TooltipHost() {
  const [tip, setTip] = useState<TipState | null>(null);
  const timer = useRef<number | null>(null);
  const current = useRef<Element | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
    const hide = () => {
      current.current = null;
      clearTimer();
      setTip(null);
    };
    const show = (el: Element) => {
      const text = el.getAttribute("data-tip");
      if (!text) return;
      const r = el.getBoundingClientRect();
      const below = r.top < 52; // not enough room above → show under the element
      setTip({
        text,
        x: Math.min(window.innerWidth - 12, Math.max(12, r.left + r.width / 2)),
        y: below ? r.bottom + 8 : r.top - 8,
        below,
      });
    };

    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element)?.closest?.("[data-tip]");
      if (!el || el === current.current) return;
      current.current = el;
      clearTimer();
      timer.current = window.setTimeout(() => show(el), 280);
    };
    const onOut = (e: MouseEvent) => {
      const el = (e.target as Element)?.closest?.("[data-tip]");
      if (!el || el !== current.current) return;
      const related = e.relatedTarget as Element | null;
      if (related && el.contains(related)) return; // moved within the same trigger
      hide();
    };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("wheel", hide, { passive: true });
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("wheel", hide);
      clearTimer();
    };
  }, []);

  if (!tip) return null;
  return createPortal(
    <div
      style={{
        position: "fixed",
        left: tip.x,
        top: tip.y,
        transform: `translateX(-50%)${tip.below ? "" : " translateY(-100%)"}`,
        zIndex: 70,
        pointerEvents: "none",
        maxWidth: 240,
      }}
      className="px-2.5 py-1 rounded-lg text-[11px] font-bold leading-snug text-gray-200 bg-[#12121c] border border-white/10 shadow-[0_6px_20px_rgba(0,0,0,0.5)] text-center"
    >
      {tip.text}
    </div>,
    document.body,
  );
}
