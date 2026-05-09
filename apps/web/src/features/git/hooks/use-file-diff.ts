import { useQuery } from "@tanstack/react-query"

import { gitKeys } from "@/lib/query-keys"
import { fetchDiff } from "../api"

export function useFileDiff(path: string | null, staged = false) {
  return useQuery({
    enabled: Boolean(path),
    queryFn: ({ signal }) => fetchDiff(path ?? "", staged, signal),
    queryKey: gitKeys.diff(path ?? "", staged),
    staleTime: 1000,
  })
}
