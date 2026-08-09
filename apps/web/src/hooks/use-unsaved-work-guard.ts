import { useEffect } from 'react'

import { useEditorDocumentStoreApi } from '@/features/editor/state/editor-document-state'

/**
 * Switching projects no longer discards anything — buffers are parked, not wiped — so
 * the only remaining way to lose unsaved edits is to close the tab or reload. This is
 * the honest place for the warning, and the only one left.
 */
export function useUnsavedWorkGuard() {
  const documentStore = useEditorDocumentStoreApi()

  useEffect(() => {
    if (typeof window === 'undefined') return

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (documentStore.getState().dirtyFilePaths.size === 0) return

      event.preventDefault()
    }

    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [documentStore])
}
