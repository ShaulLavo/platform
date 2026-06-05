import { fileBackedDocumentPath } from '@/features/editor/utils/file-backed-document'

export const EDITOR_TAB_PREFETCH_STALE_MS = 5_000

export type EditorTabPrefetchCandidate = {
  id: string
  path: string
}

export type EditorTabPrefetchTarget = {
  id: string
  path: string
}

export function editorTabElements(root: ParentNode) {
  return Array.from(
    root.querySelectorAll<HTMLElement>('[data-editor-tab-id][data-editor-tab-path]'),
  )
}

export function editorTabPrefetchTarget(element: Element): EditorTabPrefetchTarget | null {
  if (!(element instanceof HTMLElement)) return null

  const id = element.dataset.editorTabId
  const path = fileBackedDocumentPath(element.dataset.editorTabPath)
  if (!id || !path) return null

  return { id, path }
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
