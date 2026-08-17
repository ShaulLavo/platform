import type { WorkspaceSearchQuery } from '@workspace/contracts'

import {
  sameWorkspaceSearchQuery,
  type SearchBufferSnapshot,
} from '@/features/search/state/buffer-state'

export function shouldStartWorkspaceSearch(
  snapshot: SearchBufferSnapshot | null,
  query: WorkspaceSearchQuery,
) {
  if (!snapshot) return true
  if (snapshot.rootPath !== query.path) return true
  if (snapshot.runId === 0) return true
  if (!sameWorkspaceSearchQuery(snapshot.resultsSearchQuery, query)) return true

  return snapshot.status !== 'ready'
}
