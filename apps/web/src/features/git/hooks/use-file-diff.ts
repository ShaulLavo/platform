import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { gitKeys } from "@/lib/query-keys"
import { fetchDiff } from "../api"

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
