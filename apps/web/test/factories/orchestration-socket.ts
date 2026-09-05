import type { OrchestrationWsClientMessage } from '@workspace/contracts'
import { orchestrationServerConfig } from './orchestration-server-config'

/**
 * Stands in for the browser socket so the test can hold a connection half-open:
 * a real WebSocket cannot be made to stay `OPEN` while ignoring pings.
 */
export class FakeOrchestrationSocket {
  autoPong = false
  closed = false
  readyState = 0
  sent: string[] = []
  private listeners = new Map<string, Array<(event: unknown) => void>>()

  addEventListener(type: string, listener: (event: never) => void) {
    const existing = this.listeners.get(type) ?? []
    existing.push(listener as (event: unknown) => void)
    this.listeners.set(type, existing)
  }

  close() {
    this.closed = true
    this.readyState = 3
  }

  send(data: string) {
    this.sent.push(data)
    const message = JSON.parse(data) as OrchestrationWsClientMessage
    if (!this.autoPong || message.kind !== 'ping') return

    setTimeout(() => this.deliver({ kind: 'pong', requestId: message.requestId }), 0)
  }

  open(handshake = true) {
    this.readyState = 1
    this.emit('open', { type: 'open' })
    if (handshake) this.deliver({ kind: 'connected', config: orchestrationServerConfig() })
  }

  deliver(message: unknown) {
    this.emit('message', { data: JSON.stringify(message) })
  }

  serverClose({ code, wasClean }: { code: number; wasClean: boolean }) {
    this.readyState = 3
    this.emit('close', { code, reason: '', type: 'close', wasClean })
  }

  private emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}
