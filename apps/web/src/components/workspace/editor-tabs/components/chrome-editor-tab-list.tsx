import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react'

import { ChromeEditorTab } from '@/components/workspace/editor-tabs/components/chrome-editor-tab'
import { chromeTabLayout } from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import { scrollSelectedTabIntoView } from '@/components/workspace/editor-tabs/utils/editor-tab-scroll'
import {
  activeChromeTabId,
  chromeCloseSpacerStyle,
  CHROME_TAB_GROW_DELAY_MS,
  chromeTrailingSlotWidths,
  nextCloseModeSpacerWidth,
} from '@/components/workspace/editor-tabs/utils/editor-tab-style-utils'
import type {
  EditorChromeVisualTab,
  EditorTabModel,
} from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import {
  editorTabInsertionEdge,
  type EditorTabDragController,
} from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import { useElementWidth } from '@/components/workspace/shared/hooks/use-element-width'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import type { EditorPaneSplitDirection } from '@/features/editor/state/editor-pane-state'

export function ChromeEditorTabList({
  drag,
  selectedTabRef,
  tabListRef,
  tabs,
  onClose,
  onCloseTabs,
  onSplit,
  onSelect,
}: {
  drag: EditorTabDragController
  selectedTabRef: RefObject<HTMLDivElement | null>
  tabListRef: RefObject<HTMLDivElement | null>
  tabs: readonly EditorChromeVisualTab[]
  onClose: RequestCloseTab
  onCloseTabs: RequestCloseTabs
  onSplit: (tabId: string, direction: EditorPaneSplitDirection) => boolean
  onSelect: (tab: EditorTabModel) => void
}) {
  const activeTabId = activeChromeTabId(tabs)
  const measuredAvailableWidth = useElementWidth(tabListRef)
  const [closeModeSpacerWidth, setCloseModeSpacerWidth] = useState(0)
  const trailingSlotWidths = useMemo(() => chromeTrailingSlotWidths(tabs), [tabs])
  const availableWidth =
    measuredAvailableWidth === null
      ? null
      : Math.max(0, measuredAvailableWidth - closeModeSpacerWidth)
  const layout =
    availableWidth === null
      ? null
      : chromeTabLayout({
          activeIndex: tabs.findIndex((visualTab) => visualTab.tab.active),
          availableWidth,
          tabCount: tabs.length,
          trailingSlotWidths,
        })
  const overlap = layout?.overlap ?? 0
  const spacerStyle = chromeCloseSpacerStyle(closeModeSpacerWidth)
  const tabModels = useMemo(() => tabs.map((visualTab) => visualTab.tab), [tabs])

  useLayoutEffect(() => {
    scrollSelectedTabIntoView(tabListRef.current, selectedTabRef.current)
  }, [activeTabId, selectedTabRef, tabListRef, tabs.length])

  useEffect(() => {
    if (closeModeSpacerWidth <= 0) return

    const timeout = window.setTimeout(() => {
      setCloseModeSpacerWidth(0)
    }, CHROME_TAB_GROW_DELAY_MS)

    return () => window.clearTimeout(timeout)
  }, [closeModeSpacerWidth])

  function handleClose(tabId: string, width: number | null) {
    const closed = onClose(tabId)
    if (!closed) return

    const nextSpacerWidth = nextCloseModeSpacerWidth(closeModeSpacerWidth, layout, width)
    setCloseModeSpacerWidth(nextSpacerWidth)
  }

  return (
    <div className='flex min-w-full items-end overflow-visible'>
      {tabs.map((visualTab, index) => {
        const insertionEdge = editorTabInsertionEdge(tabModels, visualTab.tab, drag.state)

        return (
          <ChromeEditorTab
            dragged={drag.draggedTabId === visualTab.tab.id}
            index={index}
            insertionEdge={insertionEdge}
            layoutWidth={layout?.tabs[index]?.width ?? null}
            key={visualTab.tab.id}
            overlap={overlap}
            tabs={tabModels}
            tabRef={visualTab.tab.active ? selectedTabRef : undefined}
            trailingSlotWidth={trailingSlotWidths[index] ?? 0}
            visualTab={visualTab}
            onClose={handleClose}
            onCloseTabs={onCloseTabs}
            onSplit={onSplit}
            onDragEnd={drag.onDragEnd}
            onDragStart={drag.onDragStart}
            onSelect={onSelect}
          />
        )
      })}
      <div aria-hidden='true' className='pointer-events-none' style={spacerStyle} />
    </div>
  )
}
