import { clientForQueryClient } from '@/lib/environments/state/query-clients'
import { useQuery } from '@tanstack/react-query'

import { gitKeys } from '@/lib/query-keys'
import { fetchBranchRemoteState } from '@/features/git/utils/api'

/**
 * Local git, so it is cheap and it is allowed to be fresh: a commit made in the
 * terminal should move the push count without a reload. The pull request half
 * is a separate, slower query for exactly this reason.
 */
export function useBranchRemoteState(rootPath: string | null) {
  return useQuery({
    enabled: Boolean(rootPath),
    queryFn: ({ signal, client }) =>
      fetchBranchRemoteState(rootPath ?? '', signal, clientForQueryClient(client)),
    queryKey: gitKeys.branchRemoteState(rootPath ?? ''),
    staleTime: 2_000,
  })
}
