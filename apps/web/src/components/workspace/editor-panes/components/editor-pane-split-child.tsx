import { EditorPaneNodeView } from '@/components/workspace/editor-panes/components/editor-pane-node-view'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import type { EditorPaneNode, EditorPaneSplit } from '@/features/editor/state/editor-pane-state'
import { ResizableHandle, ResizablePanel } from '@workspace/ui/components/resizable'
import type { EditorKeymapLayer } from '@editor/core'

export function EditorPaneSplitChild({
  child,
  editorKeymapLayers,
  index,
  node,
  rootPath,
  onRequestCloseTab,
  onRequestCloseTabs,
}: {
  child: EditorPaneNode
  editorKeymapLayers: readonly EditorKeymapLayer[]
  index: number
  node: EditorPaneSplit
  rootPath: string
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
}) {
  return (
    <>
      {index > 0 ? <ResizableHandle aria-label='Resize editor pane' withHandle /> : null}
      <ResizablePanel
        id={child.id}
        className='min-h-0 min-w-0 overflow-hidden'
        defaultSize={`${node.sizes[index] ?? 100 / node.children.length}%`}
        minSize='180px'
      >
        <EditorPaneNodeView
          editorKeymapLayers={editorKeymapLayers}
          node={child}
          rootPath={rootPath}
          onRequestCloseTab={onRequestCloseTab}
          onRequestCloseTabs={onRequestCloseTabs}
        />
      </ResizablePanel>
    </>
  )
}
