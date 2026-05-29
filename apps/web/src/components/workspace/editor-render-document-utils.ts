import type { EditorRenderDocument } from '@/features/editor/editor-render-document'
import type { FileResult } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'

export function readyFile(fileState: LoadState<FileResult>) {
  if (fileState.status !== 'ready') return null

  return fileState.data
}

export function joinedEditorRenderDocument({
  buffer,
  documentId,
  path,
  view,
}: {
  buffer: EditorRenderDocument['buffer'] | null
  documentId: string | null
  path: string | null
  view: EditorRenderDocument['view'] | null
}): EditorRenderDocument | null {
  if (!buffer) return null
  if (!documentId) return null
  if (!path) return null
  if (!view) return null

  return {
    buffer,
    id: documentId,
    path,
    view,
  }
}
