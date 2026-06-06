import type { RefObject } from 'react'

import { EditorTabContextMenuContent } from '@/components/workspace/editor-tabs/components/editor-tab-context-menu-content'
import {
  fileIconStyle,
  tabDragClassName,
  tabSizingClassName,
} from '@/components/workspace/editor-tabs/utils/editor-tab-style-utils'
import type {
  EditorTabModel,
  EditorTabSizing,
} from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import {
  editorTabInsertionEdge,
  type EditorTabDragController,
} from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import { TabCloseButton } from '@/components/workspace/editor-tabs/components/tab-close-button'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import type { EditorPaneSplitDirection } from '@/features/editor/state/editor-pane-state'
import { ContextMenu, ContextMenuTrigger } from '@workspace/ui/components/context-menu'
import { cn } from '@workspace/ui/lib/utils'

export function EditorTabList({
  drag,
  selectedTabRef,
  tabSizing,
  tabs,
  onClose,
  onCloseTabs,
  onSplit,
  onSelect,
}: {
  drag: EditorTabDragController
  selectedTabRef: RefObject<HTMLDivElement | null>
  tabSizing: Exclude<EditorTabSizing, 'chrome'>
  tabs: readonly EditorTabModel[]
  onClose: RequestCloseTab
  onCloseTabs: RequestCloseTabs
  onSplit: (tabId: string, direction: EditorPaneSplitDirection) => boolean
  onSelect: (tab: EditorTabModel) => void
}) {
  return (
    <div className='flex min-w-full flex-1 items-end'>
      {tabs.map((tab) => {
        const insertionEdge = editorTabInsertionEdge(tabs, tab, drag.state)

        return (
          <ContextMenu key={tab.id}>
            <ContextMenuTrigger
              className={cn(
                'group relative flex h-10 cursor-grab items-center border-r border-border bg-background/40 text-xs active:cursor-grabbing',
                tabSizingClassName(tabSizing),
                tabDragClassName(insertionEdge, drag.draggedTabId === tab.id),
                tab.active && 'border-t-2 border-t-foreground bg-background text-foreground',
              )}
              data-editor-tab-id={tab.id}
              data-editor-tab-path={tab.path}
              draggable
              onDragEnd={drag.onDragEnd}
              onDragStart={(event) => drag.onDragStart(event, tab)}
              ref={tab.active ? selectedTabRef : undefined}
            >
              <button
                aria-selected={tab.active}
                className={cn(
                  'flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50',
                  tab.active && 'text-foreground',
                )}
                onClick={() => onSelect(tab)}
                onDragEnd={drag.onDragEnd}
                onDragStart={(event) => {
                  event.stopPropagation()
                  drag.onDragStart(event, tab)
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
                <span className='truncate'>{tab.name}</span>
                {tab.diffSuffix ? (
                  <span
                    aria-hidden='true'
                    className={cn(
                      'shrink-0 text-xs leading-none font-semibold tabular-nums',
                      tab.diffStatus?.className ?? 'text-muted-foreground',
                    )}
                    title={tab.diffStatus?.title}
                  >
                    {tab.diffSuffix}
                  </span>
                ) : null}
              </button>
              <TabCloseButton tab={tab} onClose={onClose} />
            </ContextMenuTrigger>
            <EditorTabContextMenuContent
              tab={tab}
              tabs={tabs}
              onCloseTabs={onCloseTabs}
              onSplit={onSplit}
            />
          </ContextMenu>
        )
      })}
    </div>
  )
}
