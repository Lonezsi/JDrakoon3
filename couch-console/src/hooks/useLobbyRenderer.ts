import { useRef, useEffect, useState, useCallback } from 'react'
import { LobbyScene } from '../scenes/lobby/LobbyScene'

export function useLobbyRenderer() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const sceneRef = useRef<LobbyScene | null>(null)

  // Callback ref: sets state when the element mounts
  const mountRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setContainer(node)
  }, [])

  useEffect(() => {
    if (!container) return
    const scene = new LobbyScene()
    scene.init(container)
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [container])

  return { mountRef, sceneRef }
}