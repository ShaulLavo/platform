import { useEditorDocumentState } from '@/features/editor/state/editor-document-state'

export function useEditorTabDirty(path: string) {
  return useEditorDocumentState((state) => state.dirtyFilePaths.has(path))
}
