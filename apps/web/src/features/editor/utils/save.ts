import type {
  EditorDocumentStore,
  LiveEditorDocument,
} from '@/features/editor/state/document-state'

export function isSavableEditorDocument(document: LiveEditorDocument) {
  return document.sync.kind === 'file' || document.sync.kind === 'settings'
}

export function dirtySavableEditorDocuments(
  state: Pick<EditorDocumentStore, 'dirtyFilePaths' | 'liveDocumentsById'>,
): readonly LiveEditorDocument[] {
  return Object.values(state.liveDocumentsById).filter(
    (document) =>
      isSavableEditorDocument(document) && isDirtyLiveEditorDocument(state, document.id),
  )
}

export function isDirtyLiveEditorDocument(
  state: Pick<EditorDocumentStore, 'dirtyFilePaths' | 'liveDocumentsById'>,
  path: string,
) {
  return state.dirtyFilePaths.has(path) || state.liveDocumentsById[path]?.buffer.isDirty() === true
}
