import { useSyncExternalStore } from 'react'

import { useFocusService } from '@/lib/focus/hooks/use-service'

export function useFocusSnapshot() {
  const service = useFocusService()
  return useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot)
}
