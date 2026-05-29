import { dropZonePreviewStyle } from '@/components/workspace/editor-pane-drop-utils'
import type { EditorPaneSplitDropTarget } from '@/components/workspace/file-viewer-types'

export function EditorPaneDropOverlay({ target }: { target: EditorPaneSplitDropTarget | null }) {
  if (!target) return null

  return (
    <div
      className='bg-background/10 pointer-events-none absolute inset-0 z-40'
      data-editor-pane-drop-preview={target.zone}
      data-editor-pane-drop-scope={target.scope}
    >
      <div
        className='border-ring/80 bg-ring/20 absolute rounded-sm border shadow-[inset_0_0_0_1px_hsl(var(--ring)/0.28)]'
        style={dropZonePreviewStyle(target.zone)}
      />
    </div>
  )
}
