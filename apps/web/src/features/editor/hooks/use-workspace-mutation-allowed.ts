import { useSyncExternalStore } from 'react'

import { useOptionalWorkspaceEditService } from '@/features/editor/providers/workspace-edit-context'

const subscribeWithoutService = () => () => undefined
const mutationAllowedWithoutService = () => true

export function useWorkspaceMutationAllowed(): boolean {
  const service = useOptionalWorkspaceEditService()
  return useSyncExternalStore(
    service?.subscribe ?? subscribeWithoutService,
    service ? service.canMutateWorkspace : mutationAllowedWithoutService,
    service ? service.canMutateWorkspace : mutationAllowedWithoutService,
  )
}
