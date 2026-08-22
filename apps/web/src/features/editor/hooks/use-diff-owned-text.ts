import { useMemo } from 'react'

import type { DiffLanguageServerContext } from '@/features/editor/hooks/use-diff-language'
import { useOptionalEditorDocumentState } from '@/features/editor/state/document-state'
import { isPathInWorkspace, toWorkspaceAbsolute } from '@/features/workspace/utils/path'

/**
 * What an open editor currently holds for a path, for a diff that wants to ask a language server
 * about it.
 *
 * Null when nothing has the file open. That is a refusal rather than a reason to open it: opening
 * it here is exactly what would make the diff a second owner of the document.
 *
 * Materializing the whole buffer looks expensive and is what `CompareSavedView` already does on
 * every keystroke — keyed on the content revision, so a diff nobody is typing into pays once. The
 * cheaper alternative, comparing only the line under the pointer, buys a weaker guarantee for a
 * per-line cost on a path that runs on every mouse move; worth revisiting with a profile rather
 * than a guess.
 */
export function useDiffOwnedText(
  path: string | null,
  rootPath: string,
  /**
   * Whether the diff's new side is the file as it sits on disk right now.
   *
   * Only an unstaged working-tree diff can say yes. A staged diff's new side is the INDEX blob and
   * a checkpoint's is a historical commit — both can differ from disk, and publishing either under
   * the file's real uri would hand the shared backend text the file does not have.
   */
  newSideIsWorkingTree: boolean,
): DiffLanguageServerContext | null {
  const documentId = path ? workspaceDocumentId(rootPath, path) : null
  const buffer = useOptionalEditorDocumentState((state) =>
    documentId ? (state.liveDocumentsById[documentId]?.buffer ?? null) : null,
  )
  // Revision, not the buffer object: the buffer is mutated in place, so its identity never changes.
  const revision = useOptionalEditorDocumentState((state) =>
    documentId ? (state.documentContentRevisions[documentId] ?? '') : '',
  )

  return useMemo(() => {
    if (!path) return null

    return {
      documentPath: documentId,
      newSideIsWorkingTree,
      ownedText: buffer?.materializeFullText() ?? null,
      rootPath,
    }
    // `revision` stands in for the buffer's contents; see the selector above.
  }, [buffer, documentId, newSideIsWorkingTree, path, revision, rootPath])
}

/**
 * The absolute path for a diff's file, whichever way it named it.
 *
 * Not every route names it the same. A diff opened from the git panel already carries the absolute
 * path, while `GitService` elsewhere returns `paths.toRelative(absolutePath)` — and joining a root
 * onto a path that already starts with it yields `<root>/<root>/...`, a uri no language server has
 * ever heard of and no document is ever keyed by. Both spellings were live at once, so the join had
 * to be conditional rather than merely correct for one of them.
 */
function workspaceDocumentId(rootPath: string, path: string) {
  if (isPathInWorkspace(path, rootPath)) return path

  return toWorkspaceAbsolute(rootPath, path)
}
