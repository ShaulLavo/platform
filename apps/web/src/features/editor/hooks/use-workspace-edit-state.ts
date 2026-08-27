import { useSyncExternalStore } from 'react'

import { useWorkspaceEditService } from '@/features/editor/providers/workspace-edit-context'

export function useWorkspaceEditState() {
  const service = useWorkspaceEditService()
  return useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot)
}
