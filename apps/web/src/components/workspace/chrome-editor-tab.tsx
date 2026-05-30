import type { RefObject } from 'react'

import { ChromeTabTitle } from '@/components/workspace/chrome-tab-title'
import { ChromeTabTrailingSlot } from '@/components/workspace/chrome-tab-trailing-slot'
import { EditorTabContextMenuContent } from '@/components/workspace/editor-tab-context-menu-content'
import {
  chromeTabStyle,
  fileIconStyle,
  tabDragClassName,
} from '@/components/workspace/editor-tab-style-utils'
import type { EditorChromeVisualTab, EditorTabModel } from '@/components/workspace/editor-tab-types'
import type {
  EditorTabDragController,
  EditorTabInsertionEdge,
} from '@/components/workspace/use-editor-tab-drag'
import type { RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import type { EditorPaneSplitDirection } from '@/features/editor/state/editor-pane-state'
import { ContextMenu, ContextMenuTrigger } from '@workspace/ui/components/context-menu'
import { cn } from '@workspace/ui/lib/utils'

export function ChromeEditorTab({
  dragged,
  index,
  insertionEdge,
  layoutWidth,
  overlap,
  tabs,
  tabRef,
  trailingSlotWidth,
  visualTab,
  onClose,
  onCloseTabs,
  onSplit,
  onDragEnd,
  onDragStart,
  onSelect,
}: {
  dragged: boolean
  index: number
  insertionEdge: EditorTabInsertionEdge
  layoutWidth: number | null
  overlap: number
  tabs: readonly EditorTabModel[]
  tabRef?: RefObject<HTMLDivElement | null>
  trailingSlotWidth: number
  visualTab: EditorChromeVisualTab
  onClose: (path: string, width: number | null) => void
  onCloseTabs: RequestCloseTabs
  onSplit: (tabId: string, direction: EditorPaneSplitDirection) => boolean
  onDragEnd: () => void
  onDragStart: EditorTabDragController['onDragStart']
  onSelect: (tab: EditorTabModel) => void
}) {
  const tab = visualTab.tab
  const tabStyle = chromeTabStyle(visualTab, index, overlap, layoutWidth, trailingSlotWidth)

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={cn(
          'group group/chrome-tab relative flex cursor-grab items-center overflow-hidden border-x border-transparent bg-background/55 text-xs text-muted-foreground/70 hover:z-20 hover:border-border/50 hover:bg-muted/45 hover:text-foreground/85 active:cursor-grabbing',
          'z-[var(--chrome-tab-z)]',
          tabDragClassName(insertionEdge, dragged),
          tab.active &&
            'z-30 border-border bg-muted/85 text-foreground shadow-[inset_0_1px_0_var(--border)]',
        )}
        data-chrome-tab-root=''
        data-editor-tab-id={tab.id}
        data-editor-tab-path={tab.path}
        draggable
        onDragEnd={onDragEnd}
        onDragStart={(event) => onDragStart(event, tab)}
        ref={tabRef}
        style={tabStyle}
      >
        <button
          aria-selected={tab.active}
          className='focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center gap-1.5 py-0 pr-1.5 pl-3 text-left transition-colors outline-none focus-visible:ring-1'
          onClick={() => onSelect(tab)}
          onDragEnd={onDragEnd}
          onDragStart={(event) => {
            event.stopPropagation()
            onDragStart(event, tab)
          }}
          draggable
          role='tab'
          title={tab.title}
          type='button'
        >
          <span
            aria-hidden='true'
            className='size-3.5 shrink-0 object-contain'
            style={fileIconStyle(tab.icon)}
          />
          <ChromeTabTitle tab={tab} />
        </button>
        <ChromeTabTrailingSlot tab={tab} width={trailingSlotWidth} onClose={onClose} />
      </ContextMenuTrigger>
      <EditorTabContextMenuContent
        tab={tab}
        tabs={tabs}
        onCloseTabs={onCloseTabs}
        onSplit={onSplit}
      />
    </ContextMenu>
  )
}
