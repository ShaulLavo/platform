import { fileBackedDocumentPath } from '@/features/editor/utils/file-backed-document'
import type { FileOpenIntent } from '@/lib/file-open-intent/state/service'

export type EditorTabPrefetchCandidate = {
  active?: boolean
  id: string
  path: string
}

export type EditorTabPrefetchTarget = {
  id: string
  path: string
}

export function editorTabPrefetchTarget(
  tab: EditorTabPrefetchCandidate,
): EditorTabPrefetchTarget | null {
  if (tab.active) return null

  const path = fileBackedDocumentPath(tab.path)
  if (!path) return null

  return { id: tab.id, path }
}

export function editorTabPrefetchRegistrationKey(target: EditorTabPrefetchTarget) {
  return `${target.id}:${target.path}`
}

export function editorTabFileOpenIntent(
  rootPath: string,
  target: EditorTabPrefetchTarget,
): FileOpenIntent {
  return {
    path: target.path,
    rootPath,
    source: 'tab',
    tabId: target.id,
  }
}
