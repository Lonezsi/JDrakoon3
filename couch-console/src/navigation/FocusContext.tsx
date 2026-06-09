import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { appState } from "../core/stateMachine";

// ---------------------------------------------------------------
// Geometry-based focus registry.
//
// Any element becomes keyboard/gamepad targetable by calling
// useFocusable(id). Navigation finds the nearest focusable in the
// pressed direction using on-screen position — no coordinates or
// transition tables to maintain.
//
// Layers form a stack. Only focusables on the top layer are
// navigable, which traps focus inside modals automatically.
// ---------------------------------------------------------------

type Direction = "left" | "right" | "up" | "down";

interface FocusEntry {
  id: string;
  layer: string;
  ref: React.MutableRefObject<HTMLElement | null>;
  onSelectRef: React.MutableRefObject<(() => void) | undefined>;
  initial: boolean;
  order: number;
}

interface FocusContextValue {
  focusedId: string | null;
  move: (dir: Direction) => void;
  select: () => void;
  goBack: () => void;
  resetToRoot: () => void;
  focusId: (id: string) => void;
  pushLayer: (name: string, onBack?: () => void) => void;
  popLayer: (name?: string) => void;
  register: (entry: FocusEntry) => () => void;
}

const FocusContext = createContext<FocusContextValue | null>(null);

const NAV_COOLDOWN = 180;
const SELECT_COOLDOWN = 300;
const CROSS_PENALTY = 2; // how much perpendicular misalignment is penalized

export function FocusProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<string, FocusEntry>());
  const orderCounter = useRef(0);
  const layerBack = useRef<Record<string, (() => void) | undefined>>({});

  const [layerStack, setLayerStack] = useState<string[]>(["root"]);
  const [focusByLayer, setFocusByLayer] = useState<
    Record<string, string | null>
  >({ root: null });

  const activeLayer = layerStack[layerStack.length - 1];
  const focusedId = focusByLayer[activeLayer] ?? null;

  // Mirror state into refs so the input handler closures stay current
  // without needing to be torn down and rebuilt on every focus change.
  const activeLayerRef = useRef(activeLayer);
  activeLayerRef.current = activeLayer;
  const focusRef = useRef(focusByLayer);
  focusRef.current = focusByLayer;

  const lastNav = useRef(0);
  const lastSelect = useRef(0);

  const setFocus = useCallback((layer: string, id: string | null) => {
    setFocusByLayer((prev) => (prev[layer] === id ? prev : { ...prev, [layer]: id }));
  }, []);

  const register = useCallback(
    (entry: FocusEntry) => {
      entry.order = orderCounter.current++;
      registry.current.set(entry.id, entry);

      setFocusByLayer((prev) => {
        if (entry.initial) return { ...prev, [entry.layer]: entry.id };
        if (prev[entry.layer] == null) return { ...prev, [entry.layer]: entry.id };
        return prev;
      });

      return () => {
        const wasFocused = focusRef.current[entry.layer] === entry.id;
        registry.current.delete(entry.id);
        if (wasFocused) {
          const next = [...registry.current.values()]
            .filter((e) => e.layer === entry.layer)
            .sort((a, b) => a.order - b.order)[0];
          setFocus(entry.layer, next?.id ?? null);
        }
      };
    },
    [setFocus],
  );

  const move = useCallback((dir: Direction) => {
    if (appState.current !== "HOME") return;
    if (Date.now() - lastNav.current < NAV_COOLDOWN) return;

    const layer = activeLayerRef.current;
    const entries = [...registry.current.values()].filter(
      (e) => e.layer === layer && e.ref.current,
    );
    if (entries.length === 0) return;

    const curId = focusRef.current[layer];
    const cur = curId ? registry.current.get(curId) : null;

    lastNav.current = Date.now();

    // No valid current focus → land on the first registered element.
    if (!cur?.ref.current) {
      const first = entries.sort((a, b) => a.order - b.order)[0];
      setFocus(layer, first.id);
      first.ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }

    const cr = cur.ref.current.getBoundingClientRect();
    const ccx = cr.left + cr.width / 2;
    const ccy = cr.top + cr.height / 2;

    let best: FocusEntry | null = null;
    let bestScore = Infinity;

    for (const e of entries) {
      if (e.id === cur.id) continue;
      const r = e.ref.current!.getBoundingClientRect();
      const dx = r.left + r.width / 2 - ccx;
      const dy = r.top + r.height / 2 - ccy;

      let primary: number;
      let cross: number;
      if (dir === "left") {
        primary = -dx;
        cross = Math.abs(dy);
      } else if (dir === "right") {
        primary = dx;
        cross = Math.abs(dy);
      } else if (dir === "up") {
        primary = -dy;
        cross = Math.abs(dx);
      } else {
        primary = dy;
        cross = Math.abs(dx);
      }

      if (primary <= 1) continue; // not in the pressed direction
      const score = primary + cross * CROSS_PENALTY;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }

    if (best) {
      setFocus(layer, best.id);
      best.ref.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      });
    }
  }, [setFocus]);

  const select = useCallback(() => {
    if (appState.current !== "HOME") return;
    if (Date.now() - lastSelect.current < SELECT_COOLDOWN) return;
    lastSelect.current = Date.now();

    const layer = activeLayerRef.current;
    const id = focusRef.current[layer];
    const entry = id ? registry.current.get(id) : null;
    entry?.onSelectRef.current?.();
  }, []);

  const focusId = useCallback(
    (id: string) => {
      const e = registry.current.get(id);
      if (e) setFocus(e.layer, id);
    },
    [setFocus],
  );

  const pushLayer = useCallback((name: string, onBack?: () => void) => {
    layerBack.current[name] = onBack;
    setLayerStack((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setFocusByLayer((prev) => (name in prev ? prev : { ...prev, [name]: null }));
  }, []);

  const popLayer = useCallback((name?: string) => {
    setLayerStack((prev) => {
      if (prev.length <= 1) return prev;
      if (name) {
        delete layerBack.current[name];
        return prev.filter((l) => l !== name);
      }
      delete layerBack.current[prev[prev.length - 1]];
      return prev.slice(0, -1);
    });
  }, []);

  const goBack = useCallback(() => {
    const l = activeLayerRef.current;
    if (l !== "root") layerBack.current[l]?.();
  }, []);

  const resetToRoot = useCallback(() => {
    setLayerStack(["root"]);
  }, []);

  return (
    <FocusContext.Provider
      value={{
        focusedId,
        move,
        select,
        goBack,
        resetToRoot,
        focusId,
        pushLayer,
        popLayer,
        register,
      }}
    >
      {children}
    </FocusContext.Provider>
  );
}

export function useFocus(): FocusContextValue {
  const ctx = useContext(FocusContext);
  if (!ctx) throw new Error("useFocus must be used within FocusProvider");
  return ctx;
}

interface UseFocusableOptions {
  layer?: string;
  onSelect?: () => void;
  initial?: boolean;
}

// Marks an element as a navigation target. Returns a ref to attach and
// whether it is currently focused (for styling).
export function useFocusable<T extends HTMLElement = HTMLElement>(
  id: string,
  options: UseFocusableOptions = {},
) {
  const { layer = "root", onSelect, initial = false } = options;
  const ctx = useFocus();

  const ref = useRef<T | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect; // keep latest closure each render

  useEffect(() => {
    const entry: FocusEntry = {
      id,
      layer,
      ref: ref as React.MutableRefObject<HTMLElement | null>,
      onSelectRef,
      initial,
      order: 0,
    };
    return ctx.register(entry);
    // ctx methods are stable; re-register only on id/layer change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, layer]);

  return { ref, focused: ctx.focusedId === id };
}
