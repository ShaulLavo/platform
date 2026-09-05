export class AsyncSubscriptionQueue<T> {
  private closed = false
  private error: unknown = null
  private items: T[] = []
  private waiters: Array<{
    reject: (error: unknown) => void
    resolve: (result: IteratorResult<T>) => void
  }> = []

  push(item: T) {
    if (this.closed) return

    const waiter = this.waiters.shift()
    if (waiter) {
      waiter.resolve({ done: false, value: item })
      return
    }

    this.items.push(item)
  }

  fail(error: unknown) {
    if (this.closed) return

    this.error = error
    this.closed = true
    this.items = []
    const waiters = this.drainWaiters()

    for (const waiter of waiters) {
      waiter.reject(error)
    }
  }

  close() {
    if (this.closed) return

    this.closed = true
    const waiters = this.drainWaiters()

    for (const waiter of waiters) {
      waiter.resolve({ done: true, value: undefined })
    }
  }

  next(): Promise<IteratorResult<T>> {
    const item = this.items.shift()
    if (item !== undefined) return Promise.resolve({ done: false, value: item })
    if (this.error !== null) return Promise.reject(this.error)
    if (this.closed) return Promise.resolve({ done: true, value: undefined })

    return new Promise((resolve, reject) => {
      this.waiters.push({ reject, resolve })
    })
  }

  private drainWaiters() {
    const waiters = this.waiters
    this.waiters = []

    return waiters
  }
}

export async function* drainSubscriptionQueue<T>(queue: AsyncSubscriptionQueue<T>) {
  while (true) {
    const result = await queue.next()
    if (result.done) return

    yield result.value
  }
}
