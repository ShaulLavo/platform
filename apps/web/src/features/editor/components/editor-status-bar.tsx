import { EditorStatusBarContent } from '@/features/editor/components/editor-status-bar-content'
import { useEditorUiState } from '@/features/editor/state/editor-ui-state'
import { memo } from 'react'

export const EditorStatusBar = memo(function EditorStatusBar() {
  const source = useEditorUiState((state) => state.statusBarSource)

  return (
    <div
      className='bg-background text-muted-foreground flex min-h-7 items-center gap-4 overflow-hidden border-t px-3 py-1 font-sans text-[11px] whitespace-nowrap'
      aria-label='Status bar'
    >
      {source ? <EditorStatusBarContent source={source} /> : null}
    </div>
  )
})
