import { appState } from '../core/stateMachine'
import { notifService } from './notificationService'
import type { AppDefinition } from '../shared/types'

export function launchApp(app: AppDefinition) {
  notifService.push(`Starting ${app.name}…`)
  appState.transition('APP_RUNNING')
  setTimeout(() => appState.transition('HOME'), 3200)
}