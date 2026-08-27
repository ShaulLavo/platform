import { useMemo } from 'react'

import { useEditorDocumentState } from '@/features/editor/state/document-state'
import type {
  DiffLanguageHost,
  DiffLanguageServerContext,
} from '@/features/editor/utils/diff-language-context'
import { isPathInWorkspace, toWorkspaceAbsolute } from '@/features/workspace/utils/path'

/** Platform-owned live text and host capabilities for a reusable diff editor. */
export function useDiffLanguageContext(
  path: string | null,
  rootPath: string,
  newSideIsWorkingTree: boolean,
  host: DiffLanguageHost,
): DiffLanguageServerContext | null {
  const documentId = path ? workspaceDocumentId(rootPath, path) : null
  const buffer = useEditorDocumentState((state) =>
    documentId ? (state.liveDocumentsById[documentId]?.buffer ?? null) : null,
  )
  // The buffer mutates in place, so its identity cannot invalidate materialized text.
  const revision = useEditorDocumentState((state) =>
    documentId ? (state.documentContentRevisions[documentId] ?? '') : '',
  )
  const snapshot = useMemo(
    () => ({ revision, text: buffer?.materializeFullText() ?? null }),
    [buffer, revision],
  )

  if (!path) return null

  return {
    documentPath: documentId,
    host,
    newSideIsWorkingTree,
    ownedText: snapshot.text,
    rootPath,
  }
}

function workspaceDocumentId(rootPath: string, path: string) {
  if (isPathInWorkspace(path, rootPath)) return path

  return toWorkspaceAbsolute(rootPath, path)
}
