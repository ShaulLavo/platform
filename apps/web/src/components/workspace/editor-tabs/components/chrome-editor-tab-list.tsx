import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'

import { ChromeEditorTab } from '@/components/workspace/editor-tabs/components/chrome-editor-tab'
import { chromeTabLayout } from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import { scrollSelectedTabIntoView } from '@/components/workspace/editor-tabs/utils/editor-tab-scroll'
import {
  animateChromeTabSlides,
  chromeTabSlideSnapshot,
  type ChromeTabSlideSnapshot,
} from '@/components/workspace/editor-tabs/utils/editor-tab-slide-animation'
import {
  activeChromeTabId,
  chromeCloseSpacerSnapshot,
  chromeCloseSpacerStyle,
  CHROME_TAB_GROW_DELAY_MS,
  chromeTrailingSlotWidths,
  removedChromeCloseSpacerWidth,
  type ChromeCloseSpacerSnapshot,
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
  const measuredAvailableWidth = useElementWidth(tabListRef)
  const [closeModeSpacerWidth, setCloseModeSpacerWidth] = useState(0)
  const [optimisticallyHiddenTabIds, setOptimisticallyHiddenTabIds] = useState<readonly string[]>(
    [],
  )
  const tabStripRootRef = useRef<HTMLDivElement | null>(null)
  const previousCloseSnapshotRef = useRef<ChromeCloseSpacerSnapshot | null>(null)
  const previousSlideSnapshotRef = useRef<ChromeTabSlideSnapshot | null>(null)
  const deferSlideAnimationRef = useRef(false)
  const visibleTabs = visibleChromeTabs(tabs, optimisticallyHiddenTabIds)
  const activeTabId = activeChromeTabId(visibleTabs)
  const trailingSlotWidths = useMemo(() => chromeTrailingSlotWidths(visibleTabs), [visibleTabs])
  const availableWidth =
    measuredAvailableWidth === null
      ? null
      : Math.max(0, measuredAvailableWidth - closeModeSpacerWidth)
  const layout =
    availableWidth === null
      ? null
      : chromeTabLayout({
          activeIndex: visibleTabs.findIndex((visualTab) => visualTab.tab.active),
          availableWidth,
          tabCount: visibleTabs.length,
          trailingSlotWidths,
        })
  const overlap = layout?.overlap ?? 0
  const spacerStyle = chromeCloseSpacerStyle(closeModeSpacerWidth)
  const tabModels = useMemo(() => visibleTabs.map((visualTab) => visualTab.tab), [visibleTabs])

  useLayoutEffect(() => {
    const closeSnapshot = chromeCloseSpacerSnapshot(visibleTabs, layout, tabStripRootRef.current)
    const previousSnapshot = previousCloseSnapshotRef.current
    previousCloseSnapshotRef.current = closeSnapshot

    const removedWidth = removedChromeCloseSpacerWidth(previousSnapshot, closeSnapshot)
    if (removedWidth <= 0) return

    deferSlideAnimationRef.current = true
    setCloseModeSpacerWidth((width) => width + removedWidth)
  })

  useLayoutEffect(() => {
    if (deferSlideAnimationRef.current) {
      deferSlideAnimationRef.current = false
      return
    }

    const rootElement = tabStripRootRef.current
    const slideSnapshot = chromeTabSlideSnapshot(rootElement)
    const cleanup = animateChromeTabSlides(
      rootElement,
      previousSlideSnapshotRef.current,
      slideSnapshot,
    )

    previousSlideSnapshotRef.current = slideSnapshot
    return cleanup
  })

  useLayoutEffect(() => {
    scrollSelectedTabIntoView(tabListRef.current, selectedTabRef.current)
  }, [activeTabId, selectedTabRef, tabListRef, visibleTabs.length])

  useEffect(() => {
    if (closeModeSpacerWidth <= 0) return

    const timeout = window.setTimeout(() => {
      setCloseModeSpacerWidth(0)
    }, CHROME_TAB_GROW_DELAY_MS)

    return () => window.clearTimeout(timeout)
  }, [closeModeSpacerWidth])

  useEffect(() => {
    setOptimisticallyHiddenTabIds((tabIds) => visibleOptimisticTabIds(tabIds, tabs))
  }, [tabs])

  useEffect(() => {
    if (optimisticallyHiddenTabIds.length === 0) return

    const timeout = window.setTimeout(() => {
      setOptimisticallyHiddenTabIds([])
    }, CHROME_TAB_GROW_DELAY_MS)

    return () => window.clearTimeout(timeout)
  }, [optimisticallyHiddenTabIds])

  function handleClose(tabId: string) {
    const closed = onClose(tabId)
    if (!closed) return

    setOptimisticallyHiddenTabIds((tabIds) => addOptimisticallyHiddenTabId(tabIds, tabId))
  }

  return (
    <div className='flex min-w-full items-end overflow-visible' ref={tabStripRootRef}>
      {visibleTabs.map((visualTab, index) => {
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
      <div
        aria-hidden='true'
        className='pointer-events-none'
        data-chrome-close-spacer=''
        style={spacerStyle}
      />
    </div>
  )
}

function visibleChromeTabs(
  tabs: readonly EditorChromeVisualTab[],
  optimisticallyHiddenTabIds: readonly string[],
) {
  if (optimisticallyHiddenTabIds.length === 0) return tabs

  return tabs.filter((visualTab) => !optimisticallyHiddenTabIds.includes(visualTab.tab.id))
}

function visibleOptimisticTabIds(
  tabIds: readonly string[],
  tabs: readonly EditorChromeVisualTab[],
) {
  const sourceTabIds = new Set(tabs.map((visualTab) => visualTab.tab.id))
  const visibleTabIds = tabIds.filter((tabId) => sourceTabIds.has(tabId))
  if (visibleTabIds.length === tabIds.length) return tabIds

  return visibleTabIds
}

function addOptimisticallyHiddenTabId(tabIds: readonly string[], tabId: string) {
  if (tabIds.includes(tabId)) return tabIds

  return tabIds.concat(tabId)
}
