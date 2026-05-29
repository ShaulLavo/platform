import type { ProviderRuntimeEvent } from './types'

type ProviderRuntimeEventSubscriber = (event: ProviderRuntimeEvent) => void

export class ProviderRuntimeEventStream {
  private readonly subscribers = new Set<ProviderRuntimeEventSubscriber>()

  publish(event: ProviderRuntimeEvent) {
    for (const subscriber of this.subscribers) {
      subscriber(event)
    }
  }

  stream(): AsyncIterable<ProviderRuntimeEvent> {
    return this.iterator()
  }

  private async *iterator() {
    const queue: ProviderRuntimeEvent[] = []
    const wakeups: Array<() => void> = []
    const subscriber = (event: ProviderRuntimeEvent) => {
      queue.push(event)
      wakeups.shift()?.()
    }

    this.subscribers.add(subscriber)
    try {
      for (;;) {
        const event = queue.shift()
        if (event) {
          yield event
          continue
        }

        await new Promise<void>((resolve) => {
          wakeups.push(resolve)
        })
      }
    } finally {
      this.subscribers.delete(subscriber)
      wakeups.splice(0)
    }
  }
}
