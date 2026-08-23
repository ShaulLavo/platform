import { useForesight } from '@foresightjs/react'
import { useQueryClient } from '@tanstack/react-query'

import {
  editorTabPrefetchRegistrationKey,
  editorTabPrefetchTarget,
  type EditorTabPrefetchCandidate,
} from '@/features/workspace/utils/tab-prefetch'
import { FILE_SNAPSHOT_STALE_MS, prefetchFileSnapshotQuery } from '@/lib/file-snapshot-query-cache'
import { INTENT_PREFETCH_HIT_SLOP_PX } from '@/lib/intent-prefetch-options'

export function useEditorTabIntentPrefetch(tab: EditorTabPrefetchCandidate) {
  const queryClient = useQueryClient()
  const target = editorTabPrefetchTarget(tab)
  const registrationKey = target ? editorTabPrefetchRegistrationKey(target) : null

  function prefetchTab() {
    if (!target) return

    void prefetchFileSnapshotQuery(queryClient, target.path)
  }

  const { elementRef } = useForesight<HTMLButtonElement>({
    callback: prefetchTab,
    enabled: target !== null,
    hitSlop: INTENT_PREFETCH_HIT_SLOP_PX,
    meta: target ? { path: target.path, tabId: target.id } : { tabId: tab.id },
    name: registrationKey ? `editor-tab:${registrationKey}` : `editor-tab:${tab.id}:disabled`,
    reactivateAfter: FILE_SNAPSHOT_STALE_MS,
  })

  return elementRef
}
