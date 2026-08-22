import type { ProviderRuntimeEvent } from './types'

type ProviderRuntimeEventSubscriber = (event: ProviderRuntimeEvent) => void

export class ProviderRuntimeEventStream {
  private readonly subscribers = new Set<ProviderRuntimeEventSubscriber>()

  publish(event: ProviderRuntimeEvent) {
    for (const subscriber of this.subscribers) {
      subscriber(event)
    }
  }

  /**
   * Synchronous fan-out at publish time. The pull iterator this replaced parked
   * events in a buffer only the generator could see, which is why draining the
   * pipeline needed a timer to guess when they had been handed on.
   */
  subscribe(subscriber: ProviderRuntimeEventSubscriber) {
    this.subscribers.add(subscriber)

    return () => {
      this.subscribers.delete(subscriber)
    }
  }
}
