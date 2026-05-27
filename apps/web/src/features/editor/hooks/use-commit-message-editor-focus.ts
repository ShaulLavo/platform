import type { ReactEditorController } from '@editor/react'
import { useEffect, useRef } from 'react'

import type { CachedEditorDocument } from '@/features/editor/state/editor-document-state'
import { rowStartOffset } from '@/features/editor/utils/editor-position'

type UseCommitMessageEditorFocusOptions = {
  controller: ReactEditorController
  document: CachedEditorDocument
}

export function useCommitMessageEditorFocus({
  controller,
  document,
}: UseCommitMessageEditorFocusOptions) {
  const preparedPathRef = useRef<string | null>(null)

  useEffect(() => {
    const editor = controller.getEditor()
    if (!editor) return
    if (!isGitCommitMessagePath(document.path)) {
      preparedPathRef.current = null
      return
    }
    if (preparedPathRef.current === document.path) return

    preparedPathRef.current = document.path
    const offset = rowStartOffset(document.session.getTextSnapshot(), 1)
    editor.setSelection(offset, offset, offset)
    editor.focus()
  }, [controller, document.path, document.session])
}

function isGitCommitMessagePath(path: string) {
  return path.endsWith('/.git/COMMIT_EDITMSG') || path === '.git/COMMIT_EDITMSG'
}
