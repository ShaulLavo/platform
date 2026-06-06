import { useLayoutEffect, useMemo, type RefObject } from 'react'

import { ChromeEditorTab } from '@/components/workspace/editor-tabs/components/chrome-editor-tab'
import { chromeTabLayout } from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import { scrollSelectedTabIntoView } from '@/components/workspace/editor-tabs/utils/editor-tab-scroll'
import {
  activeChromeTabId,
  chromeGhostTabStyle,
  chromeTrailingSlotWidths,
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
  const trailingSlotWidths = useMemo(() => chromeTrailingSlotWidths(tabs), [tabs])
  const layout =
    measuredAvailableWidth === null
      ? null
      : chromeTabLayout({
          activeIndex: tabs.findIndex(
            (visualTab) => visualTab.phase !== 'closing' && visualTab.tab.active,
          ),
          availableWidth: measuredAvailableWidth,
          tabCount: tabs.length,
          trailingSlotWidths,
        })
  const overlap = layout?.overlap ?? 0
  const tabModels = useMemo(
    () =>
      tabs.filter((visualTab) => visualTab.phase !== 'closing').map((visualTab) => visualTab.tab),
    [tabs],
  )

  useLayoutEffect(() => {
    scrollSelectedTabIntoView(tabListRef.current, selectedTabRef.current)
  }, [activeTabId, selectedTabRef, tabListRef, tabs.length])

  function handleClose(tabId: string) {
    const closed = onClose(tabId)
    if (closed) return
  }

  return (
    <div className='flex min-w-full items-end overflow-visible'>
      {tabs.map((visualTab, index) => {
        if (visualTab.phase === 'closing') {
          return (
            <div
              aria-hidden='true'
              className='pointer-events-none invisible'
              key={visualTab.tab.id}
              style={chromeGhostTabStyle(index, overlap, layout?.tabs[index]?.width ?? null)}
            />
          )
        }

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
    </div>
  )
}
