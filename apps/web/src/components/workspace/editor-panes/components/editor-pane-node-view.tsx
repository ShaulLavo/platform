import { EditorPaneLeafView } from '@/components/workspace/editor-panes/components/editor-pane-leaf-view'
import { EditorPaneSplitView } from '@/components/workspace/editor-panes/components/editor-pane-split-view'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import type { EditorPaneNode } from '@/features/editor/state/editor-pane-state'
import type { EditorKeymapLayer } from '@editor/core'

export function EditorPaneNodeView({
  editorKeymapLayers,
  node,
  rootPath,
  onRequestCloseTab,
  onRequestCloseTabs,
}: {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  node: EditorPaneNode
  rootPath: string
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
}) {
  if (node.kind === 'leaf') {
    return (
      <EditorPaneLeafView
        editorKeymapLayers={editorKeymapLayers}
        pane={node}
        rootPath={rootPath}
        onRequestCloseTab={onRequestCloseTab}
        onRequestCloseTabs={onRequestCloseTabs}
      />
    )
  }

  return (
    <EditorPaneSplitView
      editorKeymapLayers={editorKeymapLayers}
      node={node}
      rootPath={rootPath}
      onRequestCloseTab={onRequestCloseTab}
      onRequestCloseTabs={onRequestCloseTabs}
    />
  )
}
