import type { ReactEditorStoreSnapshot } from '@editor/react'

import { formatHistoryStatus, formatSyntaxStatus } from '@/features/editor/utils/status-formatters'

export type EditorCursorPosition = {
  column: number
  row: number
}

export function selectEditorCharCount(snapshot: ReactEditorStoreSnapshot): number {
  return snapshot.state?.length ?? snapshot.textSnapshot?.length ?? 0
}

export function selectEditorCursorPosition(
  snapshot: ReactEditorStoreSnapshot,
): EditorCursorPosition | null {
  const state = snapshot.state
  if (!state?.documentId) return null

  return {
    column: state.cursor.column,
    row: state.cursor.row,
  }
}

export function selectEditorDirty(snapshot: ReactEditorStoreSnapshot) {
  return snapshot.state?.isDirty ?? null
}

export function selectEditorHistoryStatus(snapshot: ReactEditorStoreSnapshot): string {
  return formatHistoryStatus(snapshot.state)
}

export function selectEditorSyntaxStatus(snapshot: ReactEditorStoreSnapshot): string {
  return formatSyntaxStatus(snapshot.state)
}

export function editorCursorPositionsEqual(
  left: EditorCursorPosition | null,
  right: EditorCursorPosition | null,
) {
  if (left === right) return true
  if (!left || !right) return false

  return left.column === right.column && left.row === right.row
}
