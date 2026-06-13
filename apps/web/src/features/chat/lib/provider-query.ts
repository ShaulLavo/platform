import { queryOptions } from '@tanstack/react-query'
import type { ProviderListResult } from '@workspace/contracts'

import { getClient } from '@/lib/client'
import { createRpcError } from '@/lib/structured-errors'

const PROVIDER_LIST_STALE_TIME_MS = 60_000
const PROVIDER_LIST_GC_TIME_MS = 30 * 60_000

const providerQueryKeys = {
  all: ['providers'] as const,
  list: () => [...providerQueryKeys.all, 'list'] as const,
}

export function providerListQueryOptions() {
  return queryOptions({
    gcTime: PROVIDER_LIST_GC_TIME_MS,
    queryFn: fetchProviders,
    queryKey: providerQueryKeys.list(),
    refetchOnWindowFocus: false,
    staleTime: PROVIDER_LIST_STALE_TIME_MS,
  })
}

async function fetchProviders() {
  const response = await getClient().providers.get()
  if (response.error) throw createRpcError(response.error)

  return response.data as ProviderListResult
}
