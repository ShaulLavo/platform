import { keepPreviousData, useQuery } from '@tanstack/react-query'

import {
  checkpointDiffQueryKey,
  checkpointDiffRetry,
  checkpointDiffRetryDelay,
  fetchCheckpointDiff,
} from '@/features/chat/lib/checkpoint-diff-query'
import type { DiffDocumentInfo } from '@/features/git/diff-document'
import { gitKeys } from '@/lib/query-keys'
import { fetchBlobDiff } from '../api'

type UseDiffDocumentDiffOptions = {
  enabled?: boolean
  keepPrevious?: boolean
}

export function useDiffDocumentDiff(
  diff: DiffDocumentInfo | null,
  options: UseDiffDocumentDiffOptions = {},
) {
  const enabled = Boolean(diff) && options.enabled !== false
  const placeholderData = options.keepPrevious === false ? undefined : keepPreviousData

  return useQuery({
    enabled,
    placeholderData,
    queryFn: ({ signal }) => fetchDiffDocument(diff, signal),
    queryKey: diffDocumentQueryKey(diff),
    retry: diff?.kind === 'checkpoint' ? checkpointDiffRetry : undefined,
    retryDelay: diff?.kind === 'checkpoint' ? checkpointDiffRetryDelay : undefined,
    staleTime: diff ? Infinity : 1000,
  })
}

function fetchDiffDocument(diff: DiffDocumentInfo | null, signal?: AbortSignal) {
  if (!diff) return Promise.resolve([])
  if (diff.kind === 'checkpoint') return fetchCheckpointDiff(diff.query, signal)

  return fetchBlobDiff(diff.query, signal)
}

function diffDocumentQueryKey(diff: DiffDocumentInfo | null) {
  if (!diff) return gitKeys.diff('', false)
  if (diff.kind === 'checkpoint') return checkpointDiffQueryKey(diff.query)

  return gitKeys.blobDiff(diff.query)
}
