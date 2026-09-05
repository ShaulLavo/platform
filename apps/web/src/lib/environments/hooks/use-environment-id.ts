import { useQueryClient } from '@tanstack/react-query'
import { useEnvironmentsStore } from '@/lib/environments/state/store'
import { originForQueryClient } from '@/lib/environments/state/query-clients'
import { createClientInvariantError } from '@/lib/structured-errors'

export function useEnvironmentId() {
  const origin = originForQueryClient(useQueryClient())
  const environmentId = useEnvironmentsStore((state) => state.entries[origin]?.environmentId)
  if (environmentId) return environmentId
  throw createClientInvariantError('The machine identity has not been confirmed.')
}
