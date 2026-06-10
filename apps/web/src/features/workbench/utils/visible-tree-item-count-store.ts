type VisibleTreeItemCountSnapshot = {
  readonly count: number | null
  readonly rootPath: string | null
}

export type VisibleTreeItemCountStore = {
  readonly getSnapshot: () => VisibleTreeItemCountSnapshot
  readonly setCount: (rootPath: string, count: number) => void
  readonly subscribe: (listener: () => void) => () => void
}

const EMPTY_VISIBLE_TREE_ITEM_COUNT: VisibleTreeItemCountSnapshot = {
  count: null,
  rootPath: null,
}

export function createVisibleTreeItemCountStore(): VisibleTreeItemCountStore {
  let snapshot = EMPTY_VISIBLE_TREE_ITEM_COUNT
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => snapshot,
    setCount: (rootPath, count) => {
      if (snapshot.count === count && snapshot.rootPath === rootPath) return

      snapshot = { count, rootPath }
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
  }
}
