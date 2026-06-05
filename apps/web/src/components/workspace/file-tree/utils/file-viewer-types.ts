import type { RefObject } from 'react'

import type {
  EditorPaneDropZone,
  EditorPaneSplitScope,
} from '@/features/editor/state/editor-pane-state'

export type EditorPaneSplitDropZone = Exclude<EditorPaneDropZone, 'center'>

export type EditorPaneSplitDropTarget = {
  paneId: string
  scope: EditorPaneSplitScope
  zone: EditorPaneSplitDropZone
}

export type EditorPaneDropContextValue = {
  dropTarget: EditorPaneSplitDropTarget | null
  setDropTarget: (target: EditorPaneSplitDropTarget | null) => void
  surfaceRef: RefObject<HTMLElement | null>
}
