import type { ReactEditorStoreSnapshot } from '@singapor/react'

import { formatHistoryStatus, formatSyntaxStatus } from '@/features/editor/utils/status-formatters'

export function selectEditorCharCount(snapshot: ReactEditorStoreSnapshot): number {
  return snapshot.state?.length ?? snapshot.textSnapshot?.length ?? 0
}

export function selectEditorCursorAvailable(snapshot: ReactEditorStoreSnapshot): boolean {
  return Boolean(snapshot.state?.documentId)
}

export function selectEditorCursorColumn(snapshot: ReactEditorStoreSnapshot): number | null {
  if (!snapshot.state?.documentId) return null

  return snapshot.state.cursor.column
}

export function selectEditorCursorRow(snapshot: ReactEditorStoreSnapshot): number | null {
  if (!snapshot.state?.documentId) return null

  return snapshot.state.cursor.row
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
