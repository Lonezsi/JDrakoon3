import type { DeviceAction } from '../../shared/types'

type ActionCallback = (actions: DeviceAction[]) => void

export class InputManager {
  private keys = new Map<string, boolean>()
  private prevKeys = new Map<string, boolean>()
  private listeners: ActionCallback[] = []

  // Keyboard repeat
  private navKeys = ['arrowleft', 'arrowright', 'enter']
  private repeatDelay = 300
  private repeatInterval = 60
  private keyPressStart = new Map<string, number>()
  private keyLastAction = new Map<string, number>()
  private keyInitialFired = new Map<string, boolean>()

  // Gamepad
  private rafId: number | null = null
  private gamepadIndex: number | null = null

  // Gamepad repeat state
  private gpLeftPressed = false
  private gpRightPressed = false
  private gpAPressed = false
  private gpPressStart = { left: 0, right: 0, a: 0 }
  private gpLastAction = { left: 0, right: 0, a: 0 }
  private gpInitialFired = { left: false, right: false, a: false }

  // ─── Start / Stop ──────────────────────────────────────
  start() {
    // Keyboard listeners
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

    // Gamepad polling loop
    const loop = () => {
      this.processInput()
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (this.rafId) cancelAnimationFrame(this.rafId)
    }
  }

  // ─── Process all inputs each frame ──────────────────────
  private processInput() {
    const actions: DeviceAction[] = []
    const now = performance.now()

    // ===== KEYBOARD MOVEMENT (continuous) =====
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

    // ===== KEYBOARD NAVIGATION (repeat) =====
    for (const key of this.navKeys) {
      const held = this.keys.get(key) || false
      const wasHeld = this.prevKeys.get(key) || false

      if (held && !wasHeld) {
        // Initial press – fire immediately
        this.keyPressStart.set(key, now)
        this.keyLastAction.set(key, now)
        this.keyInitialFired.set(key, false)
        this.fireNavAction(key, actions)
      } else if (held && this.keyPressStart.has(key)) {
        const pressStart = this.keyPressStart.get(key)!
        const lastAction = this.keyLastAction.get(key)!
        const initialFired = this.keyInitialFired.get(key) || false
        const elapsed = now - pressStart

        if (!initialFired) {
          if (elapsed >= this.repeatDelay) {
            this.fireNavAction(key, actions)
            this.keyLastAction.set(key, now)
            this.keyInitialFired.set(key, true)
          }
        } else {
          if (now - lastAction >= this.repeatInterval) {
            this.fireNavAction(key, actions)
            this.keyLastAction.set(key, now)
          }
        }
      }

      if (!held) {
        this.keyPressStart.delete(key)
        this.keyLastAction.delete(key)
        this.keyInitialFired.delete(key)
      }
    }

    // Save keyboard state for next comparison
    this.prevKeys = new Map(this.keys)

    // ===== GAMEPAD =====
    const gamepads = navigator.getGamepads()
    const gp = gamepads[this.gamepadIndex ?? 0]
    if (gp) {
      this.gamepadIndex = gp.index

      // ── Movement (left stick) ──
      const lx = gp.axes[0] ?? 0
      const ly = gp.axes[1] ?? 0
      const deadzone = 0.25
      if (Math.abs(lx) > deadzone || Math.abs(ly) > deadzone) {
        actions.push({
          type: 'move',
          playerId: 'p1',
          deviceId: `gamepad-${gp.index}`,
          deviceType: 'gamepad',
          value: { x: lx, y: ly }
        })
      }

      // ── D‑pad & A button with repeat ──
      const btnLeft   = gp.buttons[14]?.pressed ?? false
      const btnRight  = gp.buttons[15]?.pressed ?? false
      const btnA      = gp.buttons[0]?.pressed ?? false

      // Left
      this.handleGamepadButton(
        btnLeft, 'left', 'arrowleft', now, actions,
        () => this.gpLeftPressed, (v) => { this.gpLeftPressed = v }
      )
      // Right
      this.handleGamepadButton(
        btnRight, 'right', 'arrowright', now, actions,
        () => this.gpRightPressed, (v) => { this.gpRightPressed = v }
      )
      // A
      this.handleGamepadButton(
        btnA, 'a', 'enter', now, actions,
        () => this.gpAPressed, (v) => { this.gpAPressed = v }
      )
    } else {
      // No gamepad – reset states
      this.gpLeftPressed = false
      this.gpRightPressed = false
      this.gpAPressed = false
    }

    // Notify listeners
    this.listeners.forEach(cb => cb(actions))
  }

  // ─── Gamepad repeat helper ─────────────────────────────
  private handleGamepadButton(
    currentlyPressed: boolean,
    btnName: 'left' | 'right' | 'a',
    virtualKey: string,
    now: number,
    actions: DeviceAction[],
    getPrev: () => boolean,
    setPrev: (v: boolean) => void
  ) {
    const wasPressed = getPrev()
    if (currentlyPressed && !wasPressed) {
      // Rising edge – fire immediately
      this.gpPressStart[btnName] = now
      this.gpLastAction[btnName] = now
      this.gpInitialFired[btnName] = false
      this.fireNavAction(virtualKey, actions)
    } else if (currentlyPressed) {
      const pressStart = this.gpPressStart[btnName]
      const lastAction = this.gpLastAction[btnName]
      const initialFired = this.gpInitialFired[btnName]
      const elapsed = now - pressStart

      if (!initialFired) {
        if (elapsed >= this.repeatDelay) {
          this.fireNavAction(virtualKey, actions)
          this.gpLastAction[btnName] = now
          this.gpInitialFired[btnName] = true
        }
      } else {
        if (now - lastAction >= this.repeatInterval) {
          this.fireNavAction(virtualKey, actions)
          this.gpLastAction[btnName] = now
        }
      }
    }
    setPrev(currentlyPressed)
  }

  // ─── Fire keyboard / virtual nav actions ───────────────
  private fireNavAction(key: string, actions: DeviceAction[]) {
    if (key === 'arrowright') {
      actions.push({
        type: 'navigate',
        deviceId: 'keyboard1',   // could be gamepad, but we'll keep generic
        deviceType: 'keyboard',
        value: { direction: 'right' }
      })
    } else if (key === 'arrowleft') {
      actions.push({
        type: 'navigate',
        deviceId: 'keyboard1',
        deviceType: 'keyboard',
        value: { direction: 'left' }
      })
    } else if (key === 'enter') {
      actions.push({
        type: 'confirm',
        deviceId: 'keyboard1',
        deviceType: 'keyboard',
        value: true
      })
    }
  }

  // ─── Subscribe ─────────────────────────────────────────
  onActions(cb: ActionCallback) {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb)
    }
  }
}

export const inputManager = new InputManager()