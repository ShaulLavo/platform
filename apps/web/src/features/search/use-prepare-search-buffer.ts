import { useEffect } from 'react'

import { useSearchBufferStoreApi } from '@/features/search/search-buffer-state'

export function usePrepareSearchBuffer(rootPath: string, enabled = true) {
  const store = useSearchBufferStoreApi()

  useEffect(() => {
    if (!enabled) return

    store.getState().prepareBuffer(rootPath)
  }, [enabled, rootPath, store])
}
