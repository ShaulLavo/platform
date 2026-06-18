import type { EditorKeymapLayer } from '@singapor/core'
import type { PointerEvent as ReactPointerEvent } from 'react'

import type { EditorTabConflictMap } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import type { GitStoreApi } from '@/features/git/state'
import type { FileStatus } from '@/features/git/types'
import { BottomPanel } from '@/features/workbench/components/bottom-panel'
import { CodePanel } from '@/features/workbench/components/code-panel'
import { SidebarPanel } from '@/features/workbench/components/sidebar-panel'
import { Wallpaper } from '@/features/workbench/components/wallpaper'
import {
  resizeWorkbenchBottom,
  resizeWorkbenchSidebar,
  type WorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'

export function FixedWorkbenchLayout({
  conflicts,
  editorKeymapLayers,
  gitFiles,
  gitStore,
  panels,
  rootPath,
  onPanelsChange,
  onRequestCloseTab,
  onSelectTab,
}: {
  readonly conflicts: EditorTabConflictMap
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly gitFiles: readonly FileStatus[]
  readonly gitStore: GitStoreApi
  readonly panels: WorkbenchPanels
  readonly rootPath: string
  readonly onPanelsChange: (panels: WorkbenchPanels) => void
  readonly onRequestCloseTab: RequestCloseTab
  readonly onSelectTab: (tabId: string) => void
}) {
  function startSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = panels.sidebarWidth

    function handlePointerMove(moveEvent: PointerEvent) {
      onPanelsChange(resizeWorkbenchSidebar(panels, startWidth + moveEvent.clientX - startX))
    }

    addResizeListeners(handlePointerMove)
  }

  function startBottomResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = panels.bottomHeight

    function handlePointerMove(moveEvent: PointerEvent) {
      onPanelsChange(resizeWorkbenchBottom(panels, startHeight + startY - moveEvent.clientY))
    }

    addResizeListeners(handlePointerMove)
  }

  return (
    <div
      aria-label='Workbench'
      className='text-foreground relative isolate flex h-full min-h-0 min-w-0 overflow-hidden'
      data-workbench=''
      role='application'
    >
      <Wallpaper />
      <div className='relative z-10 flex h-full min-h-0 min-w-0 flex-1'>
        <div
          className='h-full min-h-0 shrink-0 overflow-hidden'
          style={{ width: panels.sidebarWidth }}
        >
          <SidebarPanel
            editorKeymapLayers={editorKeymapLayers}
            gitStore={gitStore}
            panels={panels}
            rootPath={rootPath}
            onPanelsChange={onPanelsChange}
          />
        </div>
        <div
          aria-label='Resize sidebar'
          className='bg-border/70 hover:bg-ring relative z-20 w-1 shrink-0 cursor-col-resize'
          role='separator'
          tabIndex={0}
          onPointerDown={startSidebarResize}
        />
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
            <CodePanel
              conflicts={conflicts}
              editorKeymapLayers={editorKeymapLayers}
              gitFiles={gitFiles}
              panels={panels}
              rootPath={rootPath}
              onRequestCloseTab={onRequestCloseTab}
              onSelectTab={onSelectTab}
            />
          </div>
          <div
            aria-label='Resize bottom panel'
            className='bg-border/70 hover:bg-ring relative z-20 h-1 shrink-0 cursor-row-resize'
            role='separator'
            tabIndex={0}
            onPointerDown={startBottomResize}
          />
          <div
            className='min-h-0 min-w-0 shrink-0 overflow-hidden'
            style={{ height: panels.bottomHeight }}
          >
            <BottomPanel panels={panels} rootPath={rootPath} onPanelsChange={onPanelsChange} />
          </div>
        </div>
      </div>
    </div>
  )
}

function addResizeListeners(handlePointerMove: (event: PointerEvent) => void) {
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp, { once: true })

  function handlePointerUp() {
    window.removeEventListener('pointermove', handlePointerMove)
  }
}
