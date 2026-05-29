import { EditorPaneSplitChild } from '@/components/workspace/editor-pane-split-child'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import {
  updateEditorPaneSplitSizes,
  type EditorPaneSplit,
} from '@/features/editor/state/editor-pane-state'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { ResizablePanelGroup } from '@workspace/ui/components/resizable'
import type { EditorKeymapLayer } from '@editor/core'

export function EditorPaneSplitView({
  editorKeymapLayers,
  node,
  rootPath,
  onRequestCloseTab,
  onRequestCloseTabs,
}: {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  node: EditorPaneSplit
  rootPath: string
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
}) {
  const setEditorPaneLayout = useEditorWorkspaceState((state) => state.setEditorPaneLayout)
  const editorPaneLayout = useEditorWorkspaceState((state) => state.editorPaneLayout)

  function handleLayoutChanged(layout: Record<string, number>) {
    const sizes = node.children.map((child) => layout[child.id] ?? 0)
    setEditorPaneLayout(updateEditorPaneSplitSizes(editorPaneLayout, node.id, sizes))
  }

  return (
    <ResizablePanelGroup
      className='min-h-0 min-w-0'
      orientation={node.direction}
      onLayoutChanged={handleLayoutChanged}
    >
      {node.children.map((child, index) => (
        <EditorPaneSplitChild
          child={child}
          editorKeymapLayers={editorKeymapLayers}
          index={index}
          key={child.id}
          node={node}
          rootPath={rootPath}
          onRequestCloseTab={onRequestCloseTab}
          onRequestCloseTabs={onRequestCloseTabs}
        />
      ))}
    </ResizablePanelGroup>
  )
}
