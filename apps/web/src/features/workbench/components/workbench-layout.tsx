import type { EditorKeymapLayer } from '@singapor/core'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@workspace/ui/components/resizable'

import type { EditorTabConflictMap } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import type { GitStoreApi } from '@/features/git/state'
import type { FileStatus } from '@/features/git/types'
import { BottomPanel } from '@/features/workbench/components/bottom-panel'
import { CodePanel } from '@/features/workbench/components/code-panel'
import { SidebarPanel } from '@/features/workbench/components/sidebar-panel'
import { Wallpaper } from '@/features/workbench/components/wallpaper'
import {
  BOTTOM_MAX_SIZE,
  BOTTOM_MIN_SIZE,
  SIDEBAR_MAX_SIZE,
  SIDEBAR_MIN_SIZE,
  setWorkbenchMainLayout,
  setWorkbenchOuterLayout,
  type WorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'

export function WorkbenchLayout({
  conflicts,
  editorKeymapLayers,
  gitFiles,
  gitStore,
  panels,
  rootPath,
  onPanelsChange,
}: {
  readonly conflicts: EditorTabConflictMap
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly gitFiles: readonly FileStatus[]
  readonly gitStore: GitStoreApi
  readonly panels: WorkbenchPanels
  readonly rootPath: string
  readonly onPanelsChange: (panels: WorkbenchPanels) => void
}) {
  function handleOuterLayoutChanged(layout: Record<string, number>) {
    onPanelsChange(setWorkbenchOuterLayout(panels, layout))
  }

  function handleMainLayoutChanged(layout: Record<string, number>) {
    onPanelsChange(setWorkbenchMainLayout(panels, layout))
  }

  return (
    <div
      aria-label='Workbench'
      className='text-foreground relative isolate flex h-full min-h-0 min-w-0 overflow-hidden'
      data-workbench=''
      role='application'
    >
      <Wallpaper />
      <ResizablePanelGroup
        key={rootPath}
        className='border-border/70 relative z-10 min-h-0 min-w-0 flex-1 border-4'
        defaultLayout={panels.outerLayout}
        id='workbench-outer'
        onLayoutChanged={handleOuterLayoutChanged}
      >
        <ResizablePanel
          className='h-full min-h-0 overflow-hidden'
          id='sidebar'
          maxSize={SIDEBAR_MAX_SIZE}
          minSize={SIDEBAR_MIN_SIZE}
        >
          <SidebarPanel
            editorKeymapLayers={editorKeymapLayers}
            gitStore={gitStore}
            panels={panels}
            rootPath={rootPath}
            onPanelsChange={onPanelsChange}
          />
        </ResizablePanel>
        <ResizableHandle id='sidebar-handle' withHandle />
        <ResizablePanel className='min-h-0 min-w-0' id='main' minSize={360}>
          <ResizablePanelGroup
            className='min-h-0 min-w-0'
            defaultLayout={panels.mainLayout}
            id='workbench-main'
            orientation='vertical'
            onLayoutChanged={handleMainLayoutChanged}
          >
            <ResizablePanel className='min-h-0 min-w-0 overflow-hidden' id='editor' minSize={160}>
              <CodePanel
                conflicts={conflicts}
                editorKeymapLayers={editorKeymapLayers}
                gitFiles={gitFiles}
                panels={panels}
                rootPath={rootPath}
              />
            </ResizablePanel>
            <ResizableHandle id='bottom-handle' withHandle />
            <ResizablePanel
              className='min-h-0 min-w-0 overflow-hidden'
              id='bottom'
              maxSize={BOTTOM_MAX_SIZE}
              minSize={BOTTOM_MIN_SIZE}
            >
              <BottomPanel panels={panels} rootPath={rootPath} onPanelsChange={onPanelsChange} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
