import type { Player, DeviceAction } from '../../shared/types'

const PLAYER_COLORS: Record<string, string> = {
  p1: '#6366f1',
  p2: '#ec4899',
  // future phone players
}

class PlayerManager {
  players: Player[] = []
  private subscribers: Set<(p: Player[]) => void> = new Set()

  handleActions(actions: DeviceAction[]) {
    actions.forEach(a => {
      if (a.type === 'move' && a.playerId) {
        this.ensurePlayer(a.playerId, a.deviceId, a.deviceType)
      }
    })
  }

  private ensurePlayer(id: string, deviceId: string, deviceType: string) {
    if (this.players.find(p => p.id === id)) return
    const newPlayer: Player = {
      id,
      name: 'Player ' + id.slice(-1).toUpperCase(),
      color: PLAYER_COLORS[id] ?? '#ffffff',
      pos: { x: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 5 },
      vel: { x: 0, z: 0 },
      deviceId
    }
    this.players = [...this.players, newPlayer]
    this.subscribers.forEach(fn => fn(this.players))
  }

  subscribe(fn: (p: Player[]) => void) {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }
}

export const playerManager = new PlayerManager()
