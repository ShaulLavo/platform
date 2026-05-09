import { keepPreviousData, useQuery } from "@tanstack/react-query"

import type { DiffDocumentInfo } from "@/features/git/diff-document"
import { gitKeys } from "@/lib/query-keys"
import { fetchBlobDiff, fetchDiff } from "../api"

type UseFileDiffOptions = {
  enabled?: boolean
  keepPrevious?: boolean
}

export function useFileDiff(
  path: string | null,
  staged = false,
  options: UseFileDiffOptions = {}
) {
  const enabled = Boolean(path) && options.enabled !== false
  const placeholderData =
    options.keepPrevious === false ? undefined : keepPreviousData

  return useQuery({
    enabled,
    placeholderData,
    queryFn: ({ signal }) => fetchDiff(path ?? "", staged, signal),
    queryKey: gitKeys.diff(path ?? "", staged),
    staleTime: 1000,
  })
}

export function useDiffDocumentDiff(
  diff: DiffDocumentInfo | null,
  options: UseFileDiffOptions = {}
) {
  const enabled = Boolean(diff) && options.enabled !== false
  const placeholderData =
    options.keepPrevious === false ? undefined : keepPreviousData

  return useQuery({
    enabled,
    placeholderData,
    queryFn: ({ signal }) => fetchDiffDocument(diff, signal),
    queryKey: diffDocumentQueryKey(diff),
    staleTime: diff?.kind === "snapshot" ? Infinity : 1000,
  })
}

function fetchDiffDocument(
  diff: DiffDocumentInfo | null,
  signal?: AbortSignal
) {
  if (!diff) return Promise.resolve([])
  if (diff.kind === "snapshot") return fetchBlobDiff(diff.query, signal)

  return fetchDiff(diff.path, diff.staged, signal)
}

function diffDocumentQueryKey(diff: DiffDocumentInfo | null) {
  if (!diff) return gitKeys.diff("", false)
  if (diff.kind === "snapshot") return gitKeys.blobDiff(diff.query)

  return gitKeys.diff(diff.path, diff.staged)
}
