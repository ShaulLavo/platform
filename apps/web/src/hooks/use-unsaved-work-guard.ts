import { useEffect } from 'react'

import { useEditorDocumentStoreApi } from '@/features/editor/state/document-state'

/**
 * Switching projects discards nothing — buffers are parked, not wiped — and history
 * navigation discards nothing either, because the applier refuses to close a tab with
 * unsaved edits (`closeTabsOutsideAddress` in `address/hooks/use-restore.ts`). So closing the
 * tab and reloading remain the only ways to lose unsaved work, and `beforeunload`
 * covers both.
 *
 * There was briefly a `popstate` prompt here as well. It is gone, and deliberately so:
 *
 * - It guarded nothing. No back press can drop a dirty buffer, because the tab that
 *   holds one is never closed.
 * - It could not be ordered correctly. It relied on `{capture: true}` running before
 *   the address layer's own `popstate` listener. Measured across engines, Chromium
 *   invokes window at-target listeners in REGISTRATION order regardless of the capture
 *   flag — so the address was already applied before the prompt appeared, and
 *   `stopImmediatePropagation` fired at a listener that had already run. Chromium is
 *   the shipping engine.
 * - Declining made things worse. Restoring the previous entry left the store holding
 *   the popped address, so the projection immediately wrote it back — landing the user
 *   exactly where they had just refused to go, one history entry heavier.
 *
 * If `?tabs=` ever becomes authoritative enough to close a dirty tab, the guard belongs
 * inside the address applier, which can decide before it applies and return `pending` —
 * not in a second listener racing it.
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
