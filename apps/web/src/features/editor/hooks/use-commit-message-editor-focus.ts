import type { EditorInstance } from "@editor/core"
import { useEffect, useRef } from "react"

import type { CachedEditorDocument } from "@/features/editor/state/editor-document-state"
import { rowStartOffset } from "@/features/editor/utils/editor-position"

type UseCommitMessageEditorFocusOptions = {
  document: CachedEditorDocument
  editorInstance: EditorInstance | null
}

export function useCommitMessageEditorFocus({
  document,
  editorInstance,
}: UseCommitMessageEditorFocusOptions) {
  const preparedPathRef = useRef<string | null>(null)

  useEffect(() => {
    if (!editorInstance) return
    if (!isGitCommitMessagePath(document.path)) {
      preparedPathRef.current = null
      return
    }
    if (preparedPathRef.current === document.path) return

    preparedPathRef.current = document.path
    const offset = rowStartOffset(document.session.getText(), 1)
    editorInstance.setSelection(offset, offset, offset)
    editorInstance.focus()
  }, [document.path, document.session, editorInstance])
}

function isGitCommitMessagePath(path: string) {
  return path.endsWith("/.git/COMMIT_EDITMSG") || path === ".git/COMMIT_EDITMSG"
}
