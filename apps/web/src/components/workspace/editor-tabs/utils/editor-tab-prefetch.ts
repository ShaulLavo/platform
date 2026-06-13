import { fileBackedDocumentPath } from '@/features/editor/utils/file-backed-document'

export type EditorTabPrefetchCandidate = {
  id: string
  path: string
}

export type EditorTabPrefetchTarget = {
  id: string
  path: string
}

export function editorTabPrefetchRegistrationKey(target: EditorTabPrefetchTarget) {
  return `${target.id}:${target.path}`
}

export function editorTabIntentPrefetchKey(tabs: readonly EditorTabPrefetchCandidate[]) {
  const keys: string[] = []

  for (const tab of tabs) {
    const path = fileBackedDocumentPath(tab.path)
    if (!path) continue

    keys.push(editorTabPrefetchRegistrationKey({ id: tab.id, path }))
  }

  return keys.join('\n')
}
