# couch-platform/setup.ps1
$ErrorActionPreference = "Stop"

Push-Location couch-console

Write-Host "Creating JDrakoon3 projects..." -ForegroundColor Cyan

# ------------------------------------------------------------
# 1. Create couch-console (TV)
# ------------------------------------------------------------
Write-Host "`n[1/2] Building couch-console..." -ForegroundColor Green

# Configure Tailwind
@"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
"@ | Out-File -FilePath vite.config.js -Encoding utf8

@"
@import "tailwindcss";
"@ | Out-File -FilePath src/index.css -Encoding utf8

# Create directories
mkdir src/shared, src/core, src/services, src/systems/input, src/systems/physics, src/systems/player, src/scenes/lobby, src/hooks, src/ui/components, src/ui/layouts -Force

# ------ FILE CONTENTS ------

# src/shared/types.ts
@"
export interface Vec2 { x: number; z: number }

export interface Player {
  id: string
  name: string
  color: string
  pos: Vec2
  vel: Vec2
  deviceId?: string
}

export interface DeviceAction {
  type: 'move' | 'navigate' | 'confirm' | 'back'
  playerId?: string
  deviceId: string
  deviceType: 'keyboard' | 'gamepad' | 'phone'
  value: { x: number; y: number } | { direction: 'left' | 'right' } | boolean
}

export type AppState = 'BOOT' | 'HOME' | 'SETTINGS' | 'APP_RUNNING'

export interface AppDefinition {
  id: string
  name: string
  icon: React.ReactNode
  color: string
  hex: string
}

export interface MediaItem {
  id: number
  title: string
  duration: string
  thumb: string
}
"@ | Out-File -FilePath src/shared/types.ts -Encoding utf8

# src/shared/constants.ts
@"
import { AppDefinition, MediaItem } from './types'
import { Gamepad2, Video, Tv, Gamepad } from 'lucide-react'

export const BOUNDS = { x: 12, z: 8 }
export const CUBE_SIZE = 1.2
export const COLLISION_RADIUS = 0.75

export const APP_STATES = {
  BOOT: 'BOOT',
  HOME: 'HOME',
  SETTINGS: 'SETTINGS',
  APP_RUNNING: 'APP_RUNNING',
} as const

export const MOCK_APPS: AppDefinition[] = [
  { id: 'steam', name: 'Steam', icon: React.createElement(Gamepad2), color: 'bg-blue-600', hex: '#2563eb' },
  { id: 'youtube', name: 'YouTube TV', icon: React.createElement(Video), color: 'bg-red-600', hex: '#dc2626' },
  { id: 'plex', name: 'Plex', icon: React.createElement(Tv), color: 'bg-yellow-500', hex: '#eab308' },
  { id: 'retroarch', name: 'RetroArch', icon: React.createElement(Gamepad), color: 'bg-slate-600', hex: '#475569' },
]

export const MOCK_QUEUE: MediaItem[] = [
  { id: 1, title: 'Lofi Hip Hop Radio', duration: 'LIVE', thumb: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=120&q=70' },
  { id: 2, title: 'Nature Documentary', duration: '12:45', thumb: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=120&q=70' },
]
"@ | Out-File -FilePath src/shared/constants.ts -Encoding utf8

# src/core/events.ts
@"
type Callback = (...args: any[]) => void

class EventBus {
  private listeners: Record<string, Callback[]> = {}

  on(event: string, cb: Callback) {
    (this.listeners[event] ||= []).push(cb)
    return () => this.off(event, cb)
  }

  off(event: string, cb: Callback) {
    this.listeners[event] = this.listeners[event]?.filter(l => l !== cb) ?? []
  }

  emit(event: string, ...args: any[]) {
    this.listeners[event]?.forEach(cb => cb(...args))
  }
}

export const events = new EventBus()
"@ | Out-File -FilePath src/core/events.ts -Encoding utf8

# src/core/stateMachine.ts
@"
import { events } from './events'
import type { AppState } from '../shared/types'

class StateMachine {
  private state: AppState = 'BOOT'

  get current() { return this.state }

  transition(newState: AppState) {
    const old = this.state
    this.state = newState
    events.emit('state:change', newState, old)
  }
}

export const appState = new StateMachine()
"@ | Out-File -FilePath src/core/stateMachine.ts -Encoding utf8

# src/services/notificationService.ts
@"
import { events } from '../core/events'

interface Notification {
  id: number
  text: string
}

class NotificationService {
  private notifications: Notification[] = []
  private subscribers: Set<(notifs: Notification[]) => void> = new Set()

  push(text: string) {
    const n: Notification = { id: Date.now() + Math.random(), text }
    this.notifications = [...this.notifications, n]
    this.subscribers.forEach(fn => fn(this.notifications))
    setTimeout(() => this.remove(n.id), 3200)
  }

  private remove(id: number) {
    this.notifications = this.notifications.filter(n => n.id !== id)
    this.subscribers.forEach(fn => fn(this.notifications))
  }

  subscribe(fn: (notifs: Notification[]) => void) {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }
}

export const notifService = new NotificationService()
"@ | Out-File -FilePath src/services/notificationService.ts -Encoding utf8

# src/services/launcherService.ts
@"
import { appState } from '../core/stateMachine'
import { notifService } from './notificationService'
import type { AppDefinition } from '../shared/types'

export function launchApp(app: AppDefinition) {
  notifService.push(`Starting ${app.name}…`)
  appState.transition('APP_RUNNING')
  setTimeout(() => appState.transition('HOME'), 3200)
}
"@ | Out-File -FilePath src/services/launcherService.ts -Encoding utf8

# src/systems/input/inputManager.ts
@"
import type { DeviceAction } from '../../shared/types'

type ActionCallback = (actions: DeviceAction[]) => void

class InputManager {
  private keys = new Map<string, boolean>()
  private listeners: ActionCallback[] = []
  private gpPrev = { lx: 0, rx: 0 }

  start() {
    const onKeyDown = (e: KeyboardEvent) => {
      this.keys.set(e.key.toLowerCase(), true)
      this.processInput()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.set(e.key.toLowerCase(), false)
      this.processInput()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    this.pollGamepad()
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      cancelAnimationFrame(this.poll!)
    }
  }

  private poll: number | null = null
  private pollGamepad() {
    this.poll = requestAnimationFrame(() => this.pollGamepad())
    // Gamepad disabled in sandbox, kept for future
    // const gp = navigator.getGamepads()[0]
    // if (gp) { ... }
    this.processInput()
  }

  private processInput() {
    const actions: DeviceAction[] = []
    // Keyboard → player1 move
    let x1 = 0, y1 = 0
    if (this.keys.get('w')) y1 -= 1
    if (this.keys.get('s')) y1 += 1
    if (this.keys.get('a')) x1 -= 1
    if (this.keys.get('d')) x1 += 1
    if (x1 !== 0 || y1 !== 0) {
      actions.push({
        type: 'move',
        playerId: 'p1',
        deviceId: 'keyboard1',
        deviceType: 'keyboard',
        value: { x: x1, y: y1 }
      })
    }
    // Keyboard → player2 move
    let x2 = 0, y2 = 0
    if (this.keys.get('u')) y2 -= 1
    if (this.keys.get('j')) y2 += 1
    if (this.keys.get('h')) x2 -= 1
    if (this.keys.get('k')) x2 += 1
    if (x2 !== 0 || y2 !== 0) {
      actions.push({
        type: 'move',
        playerId: 'p2',
        deviceId: 'keyboard2',
        deviceType: 'keyboard',
        value: { x: x2, y: y2 }
      })
    }
    // Keyboard → navigation
    if (this.keys.get('arrowright')) actions.push({ type: 'navigate', deviceId: 'keyboard1', deviceType: 'keyboard', value: { direction: 'right' } })
    if (this.keys.get('arrowleft'))  actions.push({ type: 'navigate', deviceId: 'keyboard1', deviceType: 'keyboard', value: { direction: 'left' } })
    if (this.keys.get('enter'))      actions.push({ type: 'confirm', deviceId: 'keyboard1', deviceType: 'keyboard', value: true })
    // Notify listeners
    this.listeners.forEach(cb => cb(actions))
  }

  onActions(cb: ActionCallback) {
    this.listeners.push(cb)
    return () => { this.listeners = this.listeners.filter(l => l !== cb) }
  }
}

export const inputManager = new InputManager()
"@ | Out-File -FilePath src/systems/input/inputManager.ts -Encoding utf8

# src/systems/player/playerManager.ts
@"
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
      name: `Player ${id}`,
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
"@ | Out-File -FilePath src/systems/player/playerManager.ts -Encoding utf8

# src/systems/physics/physicsSystem.ts
@"
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
"@ | Out-File -FilePath src/systems/physics/physicsSystem.ts -Encoding utf8

# src/scenes/lobby/shaders.ts
@"
export const CRT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`

export const CRT_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float time;
  varying vec2 vUv;
  vec2 curve(vec2 uv){
    uv=(uv-0.5)*2.0; uv*=1.07;
    uv.x*=1.0+pow(abs(uv.y)/5.0,2.0);
    uv.y*=1.0+pow(abs(uv.x)/4.5,2.0);
    return uv*0.5+0.5;
  }
  void main(){
    vec2 uv=curve(vUv);
    if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ gl_FragColor=vec4(0.0,0.0,0.0,1.0); return; }
    vec3 col;
    col.r=texture2D(tDiffuse,vec2(uv.x+0.0012,uv.y+0.0006)).r;
    col.g=texture2D(tDiffuse,vec2(uv.x        ,uv.y        )).g;
    col.b=texture2D(tDiffuse,vec2(uv.x-0.0012,uv.y-0.0006)).b;
    float scan=sin(uv.y*780.0)*0.035;
    col-=scan;
    col*=1.0+0.012*sin(120.0*time);
    float vig=16.0*uv.x*uv.y*(1.0-uv.x)*(1.0-uv.y);
    col*=pow(vig,0.12);
    gl_FragColor=vec4(col,1.0);
  }
`
"@ | Out-File -FilePath src/scenes/lobby/shaders.ts -Encoding utf8

# src/scenes/lobby/LobbyScene.ts
@"
import * as THREE from 'three'
import { CRT_VERT, CRT_FRAG } from './shaders'
import { BOUNDS, CUBE_SIZE } from '../../shared/constants'
import type { Player } from '../../shared/types'

export class LobbyScene {
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private renderer!: THREE.WebGLRenderer
  private rt!: THREE.WebGLRenderTarget
  private postScene!: THREE.Scene
  private postMat!: THREE.ShaderMaterial
  private keyLight!: THREE.PointLight
  private meshes = new Map<string, THREE.Mesh>()
  private animFrameId: number | null = null
  private container: HTMLElement | null = null

  init(container: HTMLElement) {
    this.container = container
    const W = window.innerWidth, H = window.innerHeight

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x04040a)
    this.scene.fog = new THREE.Fog(0x04040a, 12, 38)

    this.camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 200)
    this.camera.position.set(0, 13, 17)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(W, H)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    // CRT
    this.rt = new THREE.WebGLRenderTarget(W, H)
    this.postScene = new THREE.Scene()
    const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.postMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.rt.texture }, time: { value: 0 } },
      vertexShader: CRT_VERT,
      fragmentShader: CRT_FRAG,
    })
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat))

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45))
    this.keyLight = new THREE.PointLight(0x6366f1, 6, 22)
    this.scene.add(this.keyLight)
    const fillLight = new THREE.PointLight(0xec4899, 3, 16)
    fillLight.position.set(-6, 4, -4)
    this.scene.add(fillLight)

    // Grid
    const grid = new THREE.GridHelper(BOUNDS.x * 2, 22, 0x1e1a4e, 0x0f0d2a)
    grid.position.y = -0.62
    this.scene.add(grid)

    this.animate(0)

    window.addEventListener('resize', this.onResize)
  }

  private animate = (time: number) => {
    this.animFrameId = requestAnimationFrame(this.animate)
    const t = time * 0.001
    this.postMat.uniforms.time.value = t
    this.keyLight.position.set(Math.sin(t * 0.4) * 6, 6, Math.cos(t * 0.4) * 6)
    this.renderer.setRenderTarget(this.rt)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.postScene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1))
  }

  syncEntities(players: Player[]) {
    players.forEach(p => {
      if (!this.meshes.has(p.id)) {
        const geo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE)
        const mat = new THREE.MeshStandardMaterial({
          color: p.color, emissive: p.color,
          emissiveIntensity: 0.55, metalness: 0.92, roughness: 0.08
        })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(p.pos.x, 0, p.pos.z)
        this.scene.add(mesh)
        this.meshes.set(p.id, mesh)
      } else {
        const mesh = this.meshes.get(p.id)!
        mesh.position.lerp(new THREE.Vector3(p.pos.x, 0, p.pos.z), 0.28)
        const spd = Math.hypot(p.vel.x, p.vel.z)
        if (spd > 0.01) {
          mesh.rotation.x += p.vel.z * 0.42
          mesh.rotation.z -= p.vel.x * 0.42
          mesh.rotation.y += 0.012
        }
      }
    })
    this.meshes.forEach((mesh, id) => {
      if (!players.find(p => p.id === id)) {
        this.scene.remove(mesh)
        mesh.geometry.dispose()
        mesh.material.dispose()
        this.meshes.delete(id)
      }
    })
  }

  private onResize = () => {
    const w = innerWidth, h = innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.rt.setSize(w, h)
  }

  dispose() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId)
    window.removeEventListener('resize', this.onResize)
    if (this.container) this.container.innerHTML = ''
    this.renderer.dispose()
    this.rt.dispose()
  }
}
"@ | Out-File -FilePath src/scenes/lobby/LobbyScene.ts -Encoding utf8

# src/hooks/useLobbyRenderer.ts
@"
import { useRef, useEffect } from 'react'
import { LobbyScene } from '../scenes/lobby/LobbyScene'

export function useLobbyRenderer() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<LobbyScene | null>(null)

  useEffect(() => {
    const scene = new LobbyScene()
    scene.init(mountRef.current!)
    sceneRef.current = scene
    return () => scene.dispose()
  }, [])

  return { mountRef, sceneRef }
}
"@ | Out-File -FilePath src/hooks/useLobbyRenderer.ts -Encoding utf8

# src/hooks/useGameLoop.ts
@"
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
"@ | Out-File -FilePath src/hooks/useGameLoop.ts -Encoding utf8

# src/hooks/useClock.ts
@"
import { useState, useEffect } from 'react'

export function useClock() {
  const [clock, setClock] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return clock
}
"@ | Out-File -FilePath src/hooks/useClock.ts -Encoding utf8

# src/ui/components/BootScreen.tsx
@"
import { Tv } from 'lucide-react'

export function BootScreen() {
  return (
    <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-white">
      <div className="relative mb-8">
        <div className="w-24 h-24 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <Tv className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-400 w-10 h-10" />
      </div>
      <p className="text-[11px] font-black tracking-[0.55em] uppercase text-indigo-300/60 mb-1">System Core 2.1</p>
      <p className="text-[10px] text-gray-700 font-bold uppercase tracking-widest">Ready for Couch Play</p>
    </div>
  )
}
"@ | Out-File -FilePath src/ui/components/BootScreen.tsx -Encoding utf8

# src/ui/components/TopBar.tsx
@"
import { Gamepad2, Smartphone } from 'lucide-react'
import type { Player } from '../../shared/types'

interface TopBarProps {
  clock: Date
  players: Player[]
}

export function TopBar({ clock, players }: TopBarProps) {
  const timeStr = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="flex justify-between items-start mb-2">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/40 flex-shrink-0">
          <Gamepad2 className="w-7 h-7" />
        </div>
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight italic leading-none">Couch Console</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">
              {players.length} Active ·&nbsp;
              <span className="text-gray-500">WIFI: LIVING_ROOM_5G</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <div className="text-right">
          <span className="text-3xl font-mono leading-none block tabular-nums">{timeStr}</span>
          <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-1 block">
            CRT Active · Physics On
          </span>
        </div>
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-indigo-400">
          <Smartphone size={20} />
        </div>
      </div>
    </div>
  )
}
"@ | Out-File -FilePath src/ui/components/TopBar.tsx -Encoding utf8

# src/ui/components/AppLauncher.tsx
@"
import { ChevronRight, Plus } from 'lucide-react'
import { MOCK_APPS } from '../../shared/constants'
import { launchApp } from '../../services/launcherService'
import { notifService } from '../../services/notificationService'

interface AppLauncherProps {
  activeIndex: number
  setActiveIndex: (i: number | ((prev: number) => number)) => void
}

export function AppLauncher({ activeIndex, setActiveIndex }: AppLauncherProps) {
  return (
    <div className="flex-1 flex flex-col justify-center gap-6">
      <div className="flex items-center gap-3 px-2">
        <span className="px-2.5 py-1 bg-indigo-500 rounded text-[10px] font-black uppercase tracking-wider">Featured</span>
        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Application Library</span>
      </div>

      <div className="flex gap-5 items-center h-64 overflow-visible px-2">
        {MOCK_APPS.map((app, idx) => {
          const sel = activeIndex === idx
          return (
            <div key={app.id} className={`relative flex-shrink-0 transition-all duration-500 ${sel ? 'w-60 h-60 scale-110 z-10' : 'w-44 h-44 opacity-40 grayscale'}`}>
              {sel && <div className={`absolute inset-0 blur-3xl opacity-25 rounded-3xl ${app.color}`} />}
              <div
                className={`w-full h-full rounded-3xl p-5 flex flex-col justify-between relative z-10 border cursor-pointer
                  ${sel ? 'bg-white/10 backdrop-blur-2xl border-white/35 shadow-2xl' : 'bg-white/5 border-white/8'}`}
                onClick={() => { setActiveIndex(idx); if (sel) launchApp(app) }}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${app.color} shadow-lg`}>
                  {React.cloneElement(app.icon as React.ReactElement, { size: 26 })}
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight italic uppercase leading-none">{app.name}</h3>
                  <p className="text-[10px] text-gray-500 mt-1 uppercase font-black">
                    {sel ? 'Press Enter / Click' : 'Local App'}
                  </p>
                </div>
                {sel && (
                  <div className="absolute -bottom-3 right-5 bg-indigo-500 p-1.5 rounded-full shadow-lg shadow-indigo-500/50">
                    <ChevronRight size={16} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div
          className="flex-shrink-0 w-44 h-44 rounded-3xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-gray-700 cursor-pointer hover:text-gray-500 hover:border-white/20 transition-colors"
          onClick={() => notifService.push('Add new app: drag an .exe or enter a Steam URI.')}
        >
          <Plus size={20} />
          <span className="text-[10px] font-bold mt-2 uppercase tracking-widest">Add System</span>
        </div>
      </div>
    </div>
  )
}
"@ | Out-File -FilePath src/ui/components/AppLauncher.tsx -Encoding utf8

# src/ui/components/Footer.tsx
@"
import { MonitorPlay, Play, Settings, LogOut } from 'lucide-react'
import { MOCK_QUEUE } from '../../shared/constants'
import { notifService } from '../../services/notificationService'

interface FooterProps {
  players: { id: string; name: string; color: string }[]
}

export function Footer({ players }: FooterProps) {
  return (
    <div className="flex items-end gap-6 h-32">
      {/* In the Lobby */}
      <div className="flex flex-col gap-2.5 flex-shrink-0">
        <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest">In the Lobby</h3>
        <div className="flex -space-x-2.5 min-h-[48px] items-center">
          {players.map(p => (
            <div
              key={p.id}
              style={{ backgroundColor: p.color }}
              className="w-11 h-11 rounded-full border-[3px] border-[#04040a] flex items-center justify-center text-[11px] font-black shadow-lg hover:z-10 hover:scale-110 transition-transform relative"
              title={p.name}
            >
              {p.name[0]}
            </div>
          ))}
          {players.length === 0 && (
            <p className="text-[10px] text-gray-700 italic">WASD · UJHK to join</p>
          )}
        </div>
      </div>

      {/* Media Queue */}
      <div className="flex-1 bg-white/5 rounded-3xl border border-white/10 p-4 flex items-center gap-5 min-w-0">
        <div className="p-2.5 bg-indigo-500/20 rounded-xl text-indigo-400 flex-shrink-0">
          <MonitorPlay size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2">Up Next</h3>
          <div className="flex gap-2.5">
            {MOCK_QUEUE.map(item => (
              <div key={item.id} className="flex items-center gap-2.5 bg-white/5 rounded-xl p-2 pr-3 border border-white/5 flex-shrink-0">
                <img src={item.thumb} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" alt="" />
                <div className="min-w-0">
                  <p className="text-xs font-black leading-tight truncate max-w-[120px]">{item.title}</p>
                  <span className="text-[10px] text-gray-500">{item.duration}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={() => notifService.push('Opening video player…')}
          className="flex items-center gap-1.5 bg-white text-black px-4 py-2 rounded-xl font-black text-xs hover:scale-105 active:scale-95 transition-transform uppercase tracking-wide flex-shrink-0"
        >
          <Play size={13} />Play
        </button>
      </div>

      {/* System Buttons */}
      <div className="flex gap-2.5 flex-shrink-0">
        <button
          onClick={() => notifService.push('Settings: configure apps, themes, and input mappings.')}
          className="p-3.5 bg-white/5 rounded-2xl border border-white/10 text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Settings size={18} />
        </button>
        <button
          onClick={() => notifService.push('Shutting down… Goodbye!')}
          className="p-3.5 bg-red-500/10 rounded-2xl border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-colors"
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  )
}
"@ | Out-File -FilePath src/ui/components/Footer.tsx -Encoding utf8

# src/ui/components/AppRunningOverlay.tsx
@"
export function AppRunningOverlay() {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-xs font-black tracking-[0.4em] uppercase text-indigo-300/60">Launching…</p>
      </div>
    </div>
  )
}
"@ | Out-File -FilePath src/ui/components/AppRunningOverlay.tsx -Encoding utf8

# src/ui/components/Notifications.tsx
@"
import { useEffect, useState } from 'react'
import { notifService } from '../../services/notificationService'

export function Notifications() {
  const [notifs, setNotifs] = useState<any[]>([])

  useEffect(() => notifService.subscribe(setNotifs), [])

  return (
    <div className="fixed top-8 right-8 z-50 flex flex-col gap-2.5 pointer-events-none">
      {notifs.map(n => (
        <div key={n.id} className="bg-indigo-600 text-white px-5 py-3.5 rounded-2xl text-sm font-black notif shadow-2xl border border-indigo-400/40 flex items-center gap-3">
          <div className="w-1 h-5 bg-white/35 rounded-full flex-shrink-0" />
          {n.text}
        </div>
      ))}
    </div>
  )
}
"@ | Out-File -FilePath src/ui/components/Notifications.tsx -Encoding utf8

# src/ui/components/PhoneQR.tsx
@"
import { Wifi } from 'lucide-react'
import { notifService } from '../../services/notificationService'

export function PhoneQR() {
  return (
    <div className="fixed bottom-10 right-10 z-50 opacity-15 hover:opacity-95 transition-opacity duration-300 cursor-pointer" onClick={() => notifService.push('Phone pairing: open 192.168.1.x:3000 on your phone.')}>
      <div className="bg-white p-2.5 rounded-2xl shadow-2xl">
        <div className="w-[72px] h-[72px] bg-gray-900 rounded-lg grid grid-cols-3 gap-[2px] p-1.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={`rounded-[2px] ${[0,2,6,8,4].includes(i) ? 'bg-white' : 'bg-gray-700'}`} />
          ))}
        </div>
        <div className="flex items-center gap-1 mt-1.5 px-0.5">
          <Wifi size={9} className="text-gray-500" />
          <p className="text-[8px] text-gray-500 font-bold">:3000</p>
        </div>
      </div>
    </div>
  )
}
"@ | Out-File -FilePath src/ui/components/PhoneQR.tsx -Encoding utf8

# src/ui/layouts/DashboardLayout.tsx
@"
import { TopBar } from '../components/TopBar'
import { AppLauncher } from '../components/AppLauncher'
import { Footer } from '../components/Footer'
import type { Player } from '../../shared/types'

interface DashboardLayoutProps {
  clock: Date
  players: Player[]
  activeIndex: number
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>
}

export function DashboardLayout({ clock, players, activeIndex, setActiveIndex }: DashboardLayoutProps) {
  return (
    <div className="relative z-10 h-full w-full flex flex-col p-10">
      <TopBar clock={clock} players={players} />
      <AppLauncher activeIndex={activeIndex} setActiveIndex={setActiveIndex} />
      <Footer players={players} />
    </div>
  )
}
"@ | Out-File -FilePath src/ui/layouts/DashboardLayout.tsx -Encoding utf8

# src/App.tsx (final)
@"
import { useEffect, useState } from 'react'
import { appState } from './core/stateMachine'
import { notifService } from './services/notificationService'
import { launchApp } from './services/launcherService'
import { inputManager } from './systems/input/inputManager'
import { useLobbyRenderer } from './hooks/useLobbyRenderer'
import { useGameLoop } from './hooks/useGameLoop'
import { useClock } from './hooks/useClock'
import { BootScreen } from './ui/components/BootScreen'
import { DashboardLayout } from './ui/layouts/DashboardLayout'
import { AppRunningOverlay } from './ui/components/AppRunningOverlay'
import { Notifications } from './ui/components/Notifications'
import { PhoneQR } from './ui/components/PhoneQR'
import { MOCK_APPS } from './shared/constants'
import type { AppState } from './shared/types'

export default function App() {
  const [state, setState] = useState<AppState>(appState.current)
  const [activeIndex, setActiveIndex] = useState(0)
  const { mountRef, sceneRef } = useLobbyRenderer()
  const gameState = useGameLoop(sceneRef)
  const clock = useClock()

  // State machine listener
  useEffect(() => {
    const unsub = appState.on('state:change', (newState: AppState) => setState(newState))
    return unsub
  }, [])

  // Navigation via input manager
  useEffect(() => {
    const unsub = inputManager.onActions(actions => {
      if (appState.current !== 'HOME') return
      actions.forEach(a => {
        if (a.type === 'navigate' && a.value === 'right') setActiveIndex(i => Math.min(i + 1, MOCK_APPS.length - 1))
        if (a.type === 'navigate' && a.value === 'left')  setActiveIndex(i => Math.max(i - 1, 0))
        if (a.type === 'confirm') launchApp(MOCK_APPS[activeIndex])
      })
    })
    return unsub
  }, [activeIndex])

  if (state === 'BOOT') return <BootScreen />

  return (
    <div className="h-screen w-screen bg-[#04040a] text-slate-100 overflow-hidden select-none" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div ref={mountRef} className="fixed inset-0 z-0 pointer-events-none" />
      <div className={`transition-all duration-700 ${state === 'APP_RUNNING' ? 'opacity-0 scale-95 blur-2xl pointer-events-none' : ''}`}>
        <DashboardLayout
          clock={clock}
          players={gameState.players}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
        />
      </div>
      {state === 'APP_RUNNING' && <AppRunningOverlay />}
      <Notifications />
      <PhoneQR />
      <style>{`
        @keyframes notif-in {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .notif { animation: notif-in 0.38s cubic-bezier(.19,1,.22,1) forwards; }
      `}</style>
    </div>
  )
}
"@ | Out-File -FilePath src/App.tsx -Encoding utf8

# Done with TV app; go back
cd ..