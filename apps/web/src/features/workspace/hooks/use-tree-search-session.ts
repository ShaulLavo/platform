import type { FileTreeModel } from '@workspace/tree'
import { useMemo, useSyncExternalStore } from 'react'

export type TreeSearchSessionSnapshot = {
  readonly isSearchOpen: boolean
  readonly matchCount: number
  readonly query: string
}

export function useTreeSearchSession(tree: FileTreeModel): TreeSearchSessionSnapshot {
  // useSyncExternalStore requires stable subscription and snapshot identities.
  const store = useMemo(() => createTreeSearchSessionStore(tree), [tree])

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

function createTreeSearchSessionStore(tree: FileTreeModel) {
  let snapshot = readTreeSearchSession(tree)

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) =>
      tree.subscribe(() => {
        const nextSnapshot = readTreeSearchSession(tree)
        if (equalTreeSearchSession(snapshot, nextSnapshot)) return

        snapshot = nextSnapshot
        listener()
      }),
  }
}

function readTreeSearchSession(tree: FileTreeModel): TreeSearchSessionSnapshot {
  return {
    isSearchOpen: tree.isSearchOpen(),
    matchCount: tree.getSearchMatchingPaths().length,
    query: tree.getSearchValue(),
  }
}

function equalTreeSearchSession(left: TreeSearchSessionSnapshot, right: TreeSearchSessionSnapshot) {
  return (
    left.isSearchOpen === right.isSearchOpen &&
    left.matchCount === right.matchCount &&
    left.query === right.query
  )
}
