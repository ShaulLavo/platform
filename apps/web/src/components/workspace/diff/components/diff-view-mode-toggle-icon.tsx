import { ColumnsIcon, RowsIcon } from '@phosphor-icons/react'

import type { EditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'

export function DiffViewModeToggleIcon({ mode }: { mode: EditorDiffViewMode }) {
  if (mode === 'stacked') return <RowsIcon className='size-3.5' />

  return <ColumnsIcon className='size-3.5' />
}
