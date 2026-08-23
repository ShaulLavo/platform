import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  createPickerFolder,
  type CreatePickerFolderRequest,
} from '@/features/file-picker/data-helpers'
import { filePickerKeys, fileSystemKeys } from '@/lib/query-keys'

export function useCreateFolderMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: CreatePickerFolderRequest) => createPickerFolder(request),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: filePickerKeys.directories() }),
        queryClient.invalidateQueries({ queryKey: fileSystemKeys.trees() }),
      ])
    },
  })
}
