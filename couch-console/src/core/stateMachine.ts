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
