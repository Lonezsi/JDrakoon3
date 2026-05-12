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
