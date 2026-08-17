import { useQuery, type UseQueryOptions } from '@tanstack/react-query'

import {
  checkpointDiffQueryKey,
  checkpointDiffRetry,
  checkpointDiffRetryDelay,
  fetchCheckpointDiff,
} from '@/features/chat/lib/checkpoint-diff-query'
import { errorMessage } from '@/lib/error-message'

import { blobDiffQueryKey, fetchBlobDiff } from '@/features/git/utils/blob-diff-query'
import type { DiffDocumentInfo } from '@/features/git/utils/diff-document'
import type { FileDiff } from '@/features/git/utils/types'

type DiffList = readonly FileDiff[]
type DiffQueryOptions = UseQueryOptions<DiffList, Error, DiffList, readonly unknown[]>

/**
 * Both diff document kinds resolve to the same shape — a list of `GitFileDiff`
 * — so the viewer never branches on where the diff came from. Snapshot ids are
 * content-addressed and checkpoint ids are pinned to a turn range, so neither
 * result can go stale once fetched.
 */
export function useDiffDocumentDiffs(info: DiffDocumentInfo) {
  const query = useQuery(diffDocumentQueryOptions(info))

  return {
    diffs: query.data ?? [],
    failure: query.isError ? errorMessage(query.error, 'Diff unavailable.') : null,
    pending: query.isPending,
  }
}

function diffDocumentQueryOptions(info: DiffDocumentInfo): DiffQueryOptions {
  if (info.kind === 'checkpoint') {
    const input = info.query

    return {
      queryFn: ({ signal }) => fetchCheckpointDiff(input, signal),
      queryKey: checkpointDiffQueryKey(input),
      retry: checkpointDiffRetry,
      retryDelay: checkpointDiffRetryDelay,
      staleTime: Infinity,
    }
  }

  const input = info.query

  return {
    queryFn: ({ signal }) => fetchBlobDiff(input, signal),
    queryKey: blobDiffQueryKey(input),
    retry: false,
    staleTime: Infinity,
  }
}
