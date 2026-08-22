import { useEffect, use, useSyncExternalStore } from 'react'

import { TreeCommandsContext } from '@/features/workspace/providers/tree-commands-context'
import { clientErrors } from '@/lib/structured-errors'

export function useTreeCommandRequest(rootPath: string) {
  const store = use(TreeCommandsContext)
  if (!store) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useTreeCommandRequest must be used within TreeCommandsProvider',
    })
  }

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const request = snapshot?.rootPath === rootPath ? snapshot : null

  useEffect(() => {
    if (!snapshot) return
    if (snapshot.rootPath === rootPath) return

    store.acknowledge(snapshot.id)
  }, [rootPath, snapshot, store])

  return { acknowledge: store.acknowledge, request }
}
