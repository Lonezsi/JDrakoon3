import { useRef, useEffect, useState, useCallback } from "react";
import { LobbyScene } from "../scenes/lobby/LobbyScene";
import type { Player } from "../shared/types";

export function useLobbyRenderer(allPlayers: Player[]) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const sceneRef = useRef<LobbyScene | null>(null);

  const mountRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setContainer(node);
  }, []);

  useEffect(() => {
    if (!container) return;
    const scene = new LobbyScene();
    scene.init(container);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [container]);

  useEffect(() => {
    sceneRef.current?.syncEntities(allPlayers);
  }, [allPlayers]);

  return { mountRef, sceneRef };
}
