import { useEffect, useRef, useMemo, useSyncExternalStore } from 'react'
import { inputManager } from '../systems/input/inputManager'
import { playerManager } from '../systems/player/playerManager'
import { physicsTick } from '../systems/physics/physicsSystem'
import { LobbyScene } from '../scenes/lobby/LobbyScene'
import type { Player } from '../shared/types'

// Minimal external store to push updates to React
let snapshot: { players: Player[]; count: number } = { players: [], count: 0 }
const listeners = new Set<() => void>()

function emitChange() {
  snapshot = { players: [...playerManager.players], count: playerManager.players.length }
  listeners.forEach(l => l())
}

export function useGameLoop(sceneRef: React.RefObject<LobbyScene | null>) {
  // Subscribe to input actions → physics → player manager
  useEffect(() => {
    const unsub = inputManager.onActions((actions) => {
      playerManager.handleActions(actions)
      const updated = physicsTick(playerManager.players, actions)
      playerManager.players = updated
      emitChange()
    })
    return unsub
  }, [])

  // Sync Three.js scene each frame
  useEffect(() => {
    let raf: number
    const loop = () => {
      sceneRef.current?.syncEntities(playerManager.players)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [sceneRef])

  // React state via useSyncExternalStore (React 18+)
  const subscribe = (callback: () => void) => {
    listeners.add(callback)
    return () => listeners.delete(callback)
  }
  const getSnapshot = () => snapshot
  return useSyncExternalStore(subscribe, getSnapshot)
}
