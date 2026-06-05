import { memo, useRef, useState } from 'react'

import { EditorPaneDropContext } from '@/components/workspace/editor-pane-drop-context'
import { EditorPaneDropOverlay } from '@/components/workspace/editor-pane-drop-overlay'
import { EditorPaneNodeView } from '@/components/workspace/editor-pane-node-view'
import type { EditorPaneSplitDropTarget } from '@/components/workspace/file-viewer-types'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import type { EditorKeymapLayer } from '@editor/core'

export const FileViewer = memo(
  ({
    editorKeymapLayers,
    rootPath,
    onRequestCloseTab,
    onRequestCloseTabs,
  }: {
    editorKeymapLayers: readonly EditorKeymapLayer[]
    rootPath: string
    onRequestCloseTab: RequestCloseTab
    onRequestCloseTabs: RequestCloseTabs
  }) => {
    const editorPaneLayout = useEditorWorkspaceState((state) => state.editorPaneLayout)
    const [dropTarget, setDropTarget] = useState<EditorPaneSplitDropTarget | null>(null)
    const surfaceRef = useRef<HTMLElement | null>(null)

    return (
      <EditorPaneDropContext value={{ dropTarget, setDropTarget, surfaceRef }}>
        <section className='relative h-full min-h-0 overflow-hidden' ref={surfaceRef}>
          <EditorPaneNodeView
            editorKeymapLayers={editorKeymapLayers}
            node={editorPaneLayout.root}
            rootPath={rootPath}
            onRequestCloseTab={onRequestCloseTab}
            onRequestCloseTabs={onRequestCloseTabs}
          />
          <EditorPaneDropOverlay target={dropTarget?.scope === 'root' ? dropTarget : null} />
        </section>
      </EditorPaneDropContext>
    )
  },
)
