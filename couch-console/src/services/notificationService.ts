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
