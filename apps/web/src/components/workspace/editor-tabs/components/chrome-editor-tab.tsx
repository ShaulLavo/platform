import type { RefObject } from 'react'

import { ChromeTabSelectButton } from '@/components/workspace/editor-tabs/components/chrome-tab-select-button'
import { chromeTabRootClassName } from '@/components/workspace/editor-tabs/utils/chrome-tab-style'
import { ChromeTabTitle } from '@/components/workspace/editor-tabs/components/chrome-tab-title'
import { ChromeTabTrailingSlot } from '@/components/workspace/editor-tabs/components/chrome-tab-trailing-slot'
import { EditorTabContextMenuContent } from '@/components/workspace/editor-tabs/components/editor-tab-context-menu-content'
import {
  chromeTabStyle,
  fileIconStyle,
  tabDragClassName,
} from '@/components/workspace/editor-tabs/utils/editor-tab-style-utils'
import type {
  EditorChromeVisualTab,
  EditorTabModel,
} from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import type {
  EditorTabDragController,
  EditorTabInsertionEdge,
} from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
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
  onClose: (path: string) => void
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
        className={chromeTabRootClassName({
          active: tab.active,
          className: cn(
            'cursor-grab hover:z-20 active:cursor-grabbing',
            'z-[var(--chrome-tab-z)]',
            tabDragClassName(insertionEdge, dragged),
            tab.active && 'z-30',
          ),
        })}
        data-chrome-tab-root=''
        data-editor-tab-id={tab.id}
        data-editor-tab-path={tab.path}
        draggable
        onDragEnd={onDragEnd}
        onDragStart={(event) => onDragStart(event, tab)}
        ref={tabRef}
        style={tabStyle}
      >
        <ChromeTabSelectButton
          aria-selected={tab.active}
          onClick={() => onSelect(tab)}
          onDragEnd={onDragEnd}
          onDragStart={(event) => {
            event.stopPropagation()
            onDragStart(event, tab)
          }}
          draggable
          role='tab'
          title={tab.title}
        >
          <span
            aria-hidden='true'
            className='size-3.5 shrink-0 object-contain'
            style={fileIconStyle(tab.icon)}
          />
          <ChromeTabTitle tab={tab} />
        </ChromeTabSelectButton>
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
