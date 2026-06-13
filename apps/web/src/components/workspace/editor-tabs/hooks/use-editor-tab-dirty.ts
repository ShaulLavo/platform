import { useEditorDocumentState } from '@/features/editor/state/editor-document-state'

export function useEditorTabDirty(path: string | null) {
  return useEditorDocumentState((state) => {
    if (!path) return false

    return state.dirtyFilePaths.has(path)
  })
}
