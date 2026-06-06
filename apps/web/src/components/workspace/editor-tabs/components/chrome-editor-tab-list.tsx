import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'

import { ChromeEditorTab } from '@/components/workspace/editor-tabs/components/chrome-editor-tab'
import { chromeTabLayout } from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import {
  cachedChromeTabCloseLayoutSnapshot,
  cacheChromeTabCloseLayoutSnapshot,
  chromeTabCloseModeAvailableWidth,
  chromeTabCloseLayoutSnapshot,
  chromeTabCloseLayoutWidth,
  hasClosingChromeTabs,
  type ChromeTabCloseLayoutSnapshot,
} from '@/components/workspace/editor-tabs/utils/editor-tab-close-layout'
import {
  chromeTabCloseBurstTargetId,
  chromeTabCloseTargetAfterClosingTab,
} from '@/components/workspace/editor-tabs/utils/editor-tab-close-retarget'
import { scrollSelectedTabIntoView } from '@/components/workspace/editor-tabs/utils/editor-tab-scroll'
import {
  activeChromeTabId,
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
  closeLayoutCacheKey,
  drag,
  selectedTabRef,
  tabListRef,
  tabs,
  onBeforeClose,
  onClose,
  onCloseTabs,
  onSplit,
  onSelect,
}: {
  closeLayoutCacheKey?: string
  drag: EditorTabDragController
  selectedTabRef: RefObject<HTMLDivElement | null>
  tabListRef: RefObject<HTMLDivElement | null>
  tabs: readonly EditorChromeVisualTab[]
  onBeforeClose?: () => void
  onClose: RequestCloseTab
  onCloseTabs: RequestCloseTabs
  onSplit: (tabId: string, direction: EditorPaneSplitDirection) => boolean
  onSelect: (tab: EditorTabModel) => void
}) {
  const closeLayoutSnapshotRef = useRef<ChromeTabCloseLayoutSnapshot | null>(null)
  const activeTabId = activeChromeTabId(tabs)
  const measuredAvailableWidth = useElementWidth(tabListRef)
  const closing = hasClosingChromeTabs(tabs)
  const closeBurstTargetId = closing ? chromeTabCloseBurstTargetId(tabs) : null
  const trailingSlotWidths = useMemo(() => chromeTrailingSlotWidths(tabs), [tabs])
  const cachedCloseLayoutSnapshot = cachedChromeTabCloseLayoutSnapshot(closeLayoutCacheKey)
  const closeLayoutSnapshot = closing
    ? (closeLayoutSnapshotRef.current ?? cachedCloseLayoutSnapshot)
    : null
  const availableWidth =
    measuredAvailableWidth === null
      ? null
      : chromeTabCloseModeAvailableWidth(closeLayoutSnapshot, tabs, measuredAvailableWidth)
  const layout =
    availableWidth === null
      ? null
      : chromeTabLayout({
          activeIndex: tabs.findIndex(
            (visualTab) => visualTab.phase !== 'closing' && visualTab.tab.active,
          ),
          availableWidth,
          tabCount: tabs.length,
          trailingSlotWidths,
        })
  const currentLayoutSnapshot = chromeTabCloseLayoutSnapshot(tabs, layout)
  const overlap = closeLayoutSnapshot?.overlap ?? layout?.overlap ?? 0
  const tabModels = useMemo(
    () =>
      tabs.filter((visualTab) => visualTab.phase !== 'closing').map((visualTab) => visualTab.tab),
    [tabs],
  )

  useLayoutEffect(() => {
    scrollSelectedTabIntoView(tabListRef.current, selectedTabRef.current)
  }, [activeTabId, selectedTabRef, tabListRef, tabs.length])

  useLayoutEffect(() => {
    if (closing) return

    closeLayoutSnapshotRef.current = currentLayoutSnapshot
    cacheChromeTabCloseLayoutSnapshot(closeLayoutCacheKey, currentLayoutSnapshot)
  }, [closeLayoutCacheKey, closing, currentLayoutSnapshot])

  function handleClose(tabId: string) {
    captureCloseLayoutSnapshot()
    onBeforeClose?.()
    const closed = onClose(tabId)
    if (closed) return
  }

  function captureCloseLayoutSnapshot() {
    const nextCloseLayoutSnapshot = chromeTabCloseLayoutSnapshot(tabs, layout, closeLayoutSnapshot)
    if (!nextCloseLayoutSnapshot) return

    closeLayoutSnapshotRef.current = nextCloseLayoutSnapshot
    cacheChromeTabCloseLayoutSnapshot(closeLayoutCacheKey, nextCloseLayoutSnapshot)
  }

  function handleCloseClosingTab(tabId: string) {
    const targetTabId = chromeTabCloseTargetAfterClosingTab(tabs, tabId)
    if (!targetTabId) return

    handleClose(targetTabId)
  }

  return (
    <div className='flex min-w-full items-end overflow-visible'>
      {tabs.map((visualTab, index) => {
        const insertionEdge = editorTabInsertionEdge(tabModels, visualTab.tab, drag.state)

        return (
          <ChromeEditorTab
            closeMode={closing}
            closeTarget={visualTab.tab.id === closeBurstTargetId}
            dragged={drag.draggedTabId === visualTab.tab.id}
            index={index}
            insertionEdge={insertionEdge}
            layoutWidth={chromeTabCloseLayoutWidth(
              closeLayoutSnapshot,
              visualTab,
              layout?.tabs[index]?.width ?? null,
            )}
            key={visualTab.tab.id}
            overlap={overlap}
            tabs={tabModels}
            tabRef={visualTab.tab.active ? selectedTabRef : undefined}
            trailingSlotWidth={trailingSlotWidths[index] ?? 0}
            visualTab={visualTab}
            onClose={handleClose}
            onCloseClosingTab={handleCloseClosingTab}
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
