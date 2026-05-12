import { BOUNDS, COLLISION_RADIUS } from '../../shared/constants'
import type { Player, DeviceAction } from '../../shared/types'

const ACC = 0.025
const FRIC = 0.94

export function physicsTick(players: Player[], actions: DeviceAction[]): Player[] {
  const actionMap = new Map<string, { x: number; y: number }>()
  for (const a of actions) {
    if (a.type === 'move' && a.playerId && typeof a.value === 'object' && 'x' in a.value) {
      actionMap.set(a.playerId, { x: a.value.x, y: a.value.y })
    }
  }

  // apply forces
  let ns = players.map(p => {
    const force = actionMap.get(p.id) ?? { x: 0, y: 0 }
    const ax = force.x * ACC
    const az = force.y * ACC
    return {
      ...p,
      vel: { x: (p.vel.x + ax) * FRIC, z: (p.vel.z + az) * FRIC },
    }
  })

  // integrate
  ns = ns.map(p => ({
    ...p,
    pos: { x: p.pos.x + p.vel.x, z: p.pos.z + p.vel.z }
  }))

  // elastic collisions
  for (let i = 0; i < ns.length; i++) {
    for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i], b = ns[j]
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z
      const dist = Math.hypot(dx, dz), min = COLLISION_RADIUS * 2
      if (dist < min && dist > 0.001) {
        const ang = Math.atan2(dz, dx), ov = min - dist
        const cx = Math.cos(ang) * (ov / 2), cz = Math.sin(ang) * (ov / 2)
        a.pos.x -= cx; a.pos.z -= cz
        b.pos.x += cx; b.pos.z += cz
        const nx = dx / dist, nz = dz / dist, BNC = 0.78
        const imp = (a.vel.x * nx + a.vel.z * nz) - (b.vel.x * nx + b.vel.z * nz)
        a.vel.x -= imp * nx * BNC; a.vel.z -= imp * nz * BNC
        b.vel.x += imp * nx * BNC; b.vel.z += imp * nz * BNC
      }
    }
  }

  // boundary clamp
  ns = ns.map(p => {
    let { x: nx, z: nz } = p.pos, { x: vx, z: vz } = p.vel
    if (nx > BOUNDS.x) { nx = BOUNDS.x; vx *= -0.5 }
    if (nx < -BOUNDS.x) { nx = -BOUNDS.x; vx *= -0.5 }
    if (nz > BOUNDS.z) { nz = BOUNDS.z; vz *= -0.5 }
    if (nz < -BOUNDS.z) { nz = -BOUNDS.z; vz *= -0.5 }
    return { ...p, pos: { x: nx, z: nz }, vel: { x: vx, z: vz } }
  })

  return ns
}
