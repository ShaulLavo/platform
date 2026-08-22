export type TreeCommandKind = 'focus' | 'open-search' | 'reveal-active'

export type TreeCommandRequest = {
  readonly id: number
  readonly kind: TreeCommandKind
  readonly rootPath: string
}

export type TreeCommandStore = {
  readonly acknowledge: (id: number) => void
  readonly getSnapshot: () => TreeCommandRequest | null
  readonly request: (kind: TreeCommandKind, rootPath: string) => void
  readonly subscribe: (listener: () => void) => () => void
}

export function createTreeCommandStore(): TreeCommandStore {
  let nextRequestId = 0
  let snapshot: TreeCommandRequest | null = null
  const listeners = new Set<() => void>()

  function publish(nextSnapshot: TreeCommandRequest | null) {
    snapshot = nextSnapshot
    listeners.forEach((listener) => listener())
  }

  return {
    acknowledge: (id) => {
      if (snapshot?.id !== id) return

      publish(null)
    },
    getSnapshot: () => snapshot,
    request: (kind, rootPath) => {
      nextRequestId += 1
      publish({ id: nextRequestId, kind, rootPath })
    },
    subscribe: (listener) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
  }
}
