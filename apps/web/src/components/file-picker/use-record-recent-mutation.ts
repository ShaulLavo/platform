import { filePickerKeys } from '@/lib/query-keys'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { recordRecent } from './data-helpers'

export function useRecordRecentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: recordRecent,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: filePickerKeys.recents() })
    },
  })
}
