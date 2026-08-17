import { Debouncer } from '@tanstack/react-pacer/debouncer'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import {
  fileBackedEditorPath,
  isDirtyLiveEditorDocument,
  saveEditorDocumentByPath,
} from '@/features/editor/utils/save'
import { useEditorDocumentStoreApi } from '@/features/editor/state/document-state'
import { useSettingValue } from '@/features/settings/hooks/use-setting-value'

/**
 * Saves edited files without being asked.
 *
 * Reuses the same `saveEditorDocumentByPath` the explicit command calls, so an
 * automatic save and a `Mod+S` are the same operation — a second write path
 * would be a second set of conflict and dirty-tracking bugs.
 *
 * `onFocusChange` and `onWindowChange` collapse to the same browser signal here:
 * the app is one page, so an editor losing focus to another pane and the window
 * losing focus both surface as `blur`. They stay distinct settings because they
 * will diverge once the desktop shell reports window focus separately.
 */
export function useAutoSave() {
  const mode = useSettingValue('files.autoSave')
  const delay = useSettingValue('files.autoSaveDelay')
  const documentStore = useEditorDocumentStoreApi()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (mode === 'off') return

    const saveDirtyDocuments = () => {
      const state = documentStore.getState()
      for (const document of Object.values(state.liveDocumentsById)) {
        if (document.sync.kind !== 'file') continue

        const path = fileBackedEditorPath(document.sync.path)
        if (!path || !isDirtyLiveEditorDocument(state, path)) continue

        void saveEditorDocumentByPath(documentStore, queryClient, path)
      }
    }

    if (mode !== 'afterDelay') {
      window.addEventListener('blur', saveDirtyDocuments)

      return () => window.removeEventListener('blur', saveDirtyDocuments)
    }

    // Subscribed to the content revisions, not to `dirtyFilePaths`: the dirty
    // set changes only when a file crosses clean↔dirty, so debouncing on it
    // would fire once when typing starts and then save mid-word `delay` later —
    // the opposite of quiet time. Revisions change on every edit, which is what
    // "after a delay" is actually measuring.
    const pending = new Debouncer(saveDirtyDocuments, { wait: delay })
    const unsubscribe = documentStore.subscribe(
      (state) => state.documentContentRevisions,
      () => pending.maybeExecute(),
    )

    return () => {
      unsubscribe()
      // Flush rather than drop: unmounting mid-delay must not lose the edit the
      // user already made.
      pending.flush()
    }
  }, [delay, documentStore, mode, queryClient])
}
