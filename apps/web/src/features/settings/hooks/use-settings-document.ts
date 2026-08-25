import { useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchSettings } from '@/features/settings/utils/api'
import {
  beginSettingsSnapshotRead,
  observeInitialSettingsSnapshot,
} from '@/features/settings/state/snapshot-admission'
import { settingsKeys } from '@/features/settings/utils/query-keys'

/** The confirmed document exactly as the server last acknowledged it. */
export function useSettingsDocument() {
  const queryClient = useQueryClient()

  return useQuery({
    queryFn: async ({ signal }) => {
      const token = beginSettingsSnapshotRead(queryClient)
      const snapshot = await fetchSettings(signal)
      return observeInitialSettingsSnapshot(queryClient, snapshot, token)
    },
    queryKey: settingsKeys.document(),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
