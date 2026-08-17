import { useCallback, useEffect, useRef } from 'react'

import {
  cancelConflictResolutions,
  scheduleConflictResolution,
  resolveConflictEditorSnapshot,
  type ConflictResolutionDebouncers,
} from '@/features/workspace/utils/conflict-editor-resolution'
import { parseConflictDiffDocumentId } from '@/features/editor/utils/conflict-diff-document'
import { useEditorConflictStoreApi } from '@/features/editor/state/conflict-state'
import type { FileResult } from '@/lib/file-system-types'
import type { TextSnapshot } from '@singapor/core'
import { useQueryClient } from '@tanstack/react-query'

export function useConflictEditorResolution({
  discardLiveEditorDocument,
  forceReplaceLiveEditorDocument,
  renameLiveEditorDocument,
}: {
  discardLiveEditorDocument: (path: string) => { wasDirty: boolean }
  forceReplaceLiveEditorDocument: (file: FileResult) => { wasDirty: boolean }
  renameLiveEditorDocument: (from: string, to: string) => { wasDirty: boolean }
}) {
  const conflictStore = useEditorConflictStoreApi()
  const queryClient = useQueryClient()
  const resolvingConflictIds = useRef(new Set<string>())
  const pendingResolutions = useRef<ConflictResolutionDebouncers>(new Map())

  useEffect(() => () => cancelConflictResolutions(pendingResolutions.current), [])

  return useCallback(
    (path: string, textSnapshot: TextSnapshot) => {
      const conflictDiff = parseConflictDiffDocumentId(path)
      if (!conflictDiff) return

      scheduleConflictResolution(pendingResolutions.current, path, () => {
        pendingResolutions.current.delete(path)
        resolveConflictEditorSnapshot(conflictDiff, textSnapshot, {
          conflictStore,
          discardLiveEditorDocument,
          forceReplaceLiveEditorDocument,
          queryClient,
          renameLiveEditorDocument,
          resolvingConflictIds,
        })
      })
    },
    [
      conflictStore,
      discardLiveEditorDocument,
      forceReplaceLiveEditorDocument,
      queryClient,
      renameLiveEditorDocument,
    ],
  )
}
