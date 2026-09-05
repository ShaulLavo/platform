import { filePickerKeys } from '@/lib/query-keys'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { clientForQueryClient } from '@/lib/environments/state/query-clients'
import type { PickedFsEntry } from '@/lib/file-system-types'

import { recordRecent } from '@/features/file-picker/data-helpers'

export function useRecordRecentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (entry: PickedFsEntry, { client }) =>
      recordRecent(entry, clientForQueryClient(client)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: filePickerKeys.recents() })
    },
  })
}
