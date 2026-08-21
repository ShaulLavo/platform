import { useMemo } from 'react'

import type { DiffLanguageServerContext } from '@/features/editor/hooks/use-diff-hover'
import { useOptionalEditorDocumentState } from '@/features/editor/state/document-state'

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
): DiffLanguageServerContext | null {
  const buffer = useOptionalEditorDocumentState((state) =>
    path ? (state.liveDocumentsById[path]?.buffer ?? null) : null,
  )
  // Revision, not the buffer object: the buffer is mutated in place, so its identity never changes.
  const revision = useOptionalEditorDocumentState((state) =>
    path ? (state.documentContentRevisions[path] ?? '') : '',
  )

  return useMemo(() => {
    if (!path) return null

    return { ownedText: buffer?.materializeFullText() ?? null, rootPath }
    // `revision` stands in for the buffer's contents; see the selector above.
  }, [buffer, path, revision, rootPath])
}
