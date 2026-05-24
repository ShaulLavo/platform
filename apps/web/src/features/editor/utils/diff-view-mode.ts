export type EditorDiffViewMode = 'split' | 'stacked'

export const DEFAULT_DIFF_VIEW_MODE: EditorDiffViewMode = 'split'

export function isEditorDiffViewMode(value: unknown): value is EditorDiffViewMode {
  return value === 'split' || value === 'stacked'
}

export function nextEditorDiffViewMode(mode: EditorDiffViewMode): EditorDiffViewMode {
  if (mode === 'split') return 'stacked'

  return 'split'
}
