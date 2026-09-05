import { useQueryClient } from '@tanstack/react-query'
import { originForQueryClient } from '@/lib/environments/state/query-clients'
import { useEnvironmentsStore } from '@/lib/environments/state/store'
import { unavailableEnvironment } from '@/lib/environments/utils/availability'

export function useUnavailableEnvironment() {
  const origin = originForQueryClient(useQueryClient())
  return useEnvironmentsStore((state) => unavailableEnvironment(state.entries[origin]))
}
