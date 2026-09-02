import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { useFocus, useFocusable } from "./FocusContext";

// ---------------------------------------------------------------
// Helpers for making modals keyboard/gamepad-navigable like Settings.
//
//  useModalLayer(name, active, onBack) — trap navigation in a focus layer while
//  the modal is open; `back` (B / Esc) runs onBack (usually onClose).
//
//  <Focusable> — a div that registers as a nav target in a layer and shows a
//  ring when focused. Works inside .map() (it's a component, so the hook is
//  called once per item). Mouse click and gamepad "select" both fire onSelect.
// ---------------------------------------------------------------

export function useModalLayer(
  name: string,
  active: boolean,
  onBack?: () => void,
) {
  const { pushLayer, popLayer } = useFocus();
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  useEffect(() => {
    if (!active) return;
    pushLayer(name, () => onBackRef.current?.());
    return () => popLayer(name);
  }, [name, active, pushLayer, popLayer]);
}

export function Focusable({
  id,
  layer = "root",
  enabled = true,
  initial = false,
  onSelect,
  onMove,
  className = "",
  focusedClassName = "ring-2 ring-indigo-400",
  style,
  title,
  children,
  stopPropagation = true,
  focusOnHover = false,
}: {
  id: string;
  layer?: string;
  enabled?: boolean;
  initial?: boolean;
  onSelect?: () => void;
  onMove?: (dir: "left" | "right" | "up" | "down") => boolean;
  className?: string;
  /** Extra classes applied while focused (the focus ring). */
  focusedClassName?: string;
  style?: CSSProperties;
  title?: string;
  children?: ReactNode;
  stopPropagation?: boolean;
  /** Mouse hover moves focus here — so the focus ring + Enter target follow the
   *  pointer (mouse/gamepad parity). */
  focusOnHover?: boolean;
}) {
  const { focusId } = useFocus();
  const { ref, focused } = useFocusable<HTMLDivElement>(id, {
    layer,
    enabled,
    initial,
    onSelect,
    onMove,
  });
  return (
    <div
      ref={ref}
      data-tip={title}
      style={style}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        onSelect?.();
      }}
      onMouseEnter={focusOnHover && enabled ? () => focusId(id) : undefined}
      className={`${className} ${focused ? focusedClassName : ""}`}
    >
      {children}
    </div>
  );
}
