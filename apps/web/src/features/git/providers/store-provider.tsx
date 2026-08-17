import { useState, type ReactNode } from 'react'

import { StateContext, createGitStore, type GitStoreApi } from '@/features/git/state/store'

/**
 * Git panel UI state — the commit message above all — belongs to one checkout.
 * A single store shared across roots means the message typed in project A is
 * still in the box after a switch, and the commit mutation, which takes the
 * ACTIVE rootPath, sends it to project B.
 *
 * One store per root, created on first use and kept, so switching away and back
 * returns the message you were part-way through writing.
 */
export function GitStoreProvider({
  children,
  rootPath,
}: {
  readonly children: ReactNode
  readonly rootPath: string
}) {
  // Held in state, not a ref: the map must be stable across renders, and the
  // React Compiler rules forbid reading a ref during render. Lazy per-key
  // creation is idempotent, so a double render just finds the existing store.
  const [storesByRootPath] = useState(() => new Map<string, GitStoreApi>())
  const store = storesByRootPath.get(rootPath) ?? createGitStore()
  if (!storesByRootPath.has(rootPath)) storesByRootPath.set(rootPath, store)

  return <StateContext value={store}>{children}</StateContext>
}
