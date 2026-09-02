import { useRef, useEffect, useState, useCallback } from "react";
import { LobbyScene } from "../scenes/lobby/LobbyScene";
import type { Player } from "../shared/types";

export function useLobbyRenderer(
  allPlayers: Player[],
  crtEnabled = true,
  crtIntensity = 100,
) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const sceneRef = useRef<LobbyScene | null>(null);

  const mountRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setContainer(node);
  }, []);

  useEffect(() => {
    if (!container) return;
    const scene = new LobbyScene();
    scene.init(container);
    scene.setCrtEnabled(crtEnabled); // honor the settings at creation
    scene.setCrtIntensity(crtIntensity);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // crtEnabled/crtIntensity intentionally omitted — applied live by the
    // effects below so we don't rebuild the whole scene when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  // Live CRT toggle + intensity (settings.display.crtEffect / crtIntensity).
  useEffect(() => {
    sceneRef.current?.setCrtEnabled(crtEnabled);
  }, [crtEnabled]);

  useEffect(() => {
    sceneRef.current?.setCrtIntensity(crtIntensity);
  }, [crtIntensity]);

  useEffect(() => {
    sceneRef.current?.syncEntities(allPlayers);
  }, [allPlayers]);

  return { mountRef, sceneRef };
}
