import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'

import { ChromeEditorTab } from '@/components/workspace/editor-tabs/components/chrome-editor-tab'
import {
  CHROME_TAB_ACTIVE_MIN_WIDTH,
  CHROME_TAB_CLOSED_WIDTH,
  CHROME_TAB_TRAILING_SLOT_WIDTH,
  chromeTabLayout,
} from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import {
  cachedChromeTabCloseLayoutSnapshot,
  cacheChromeTabCloseLayoutSnapshot,
  chromeTabCloseModeAvailableWidth,
  chromeTabCloseLayoutSnapshot,
  chromeTabCloseLayoutWidth,
  hasClosingChromeTabs,
  promotedChromeTabIdAfterClose,
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
import type { EditorSplitDirection } from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import { useElementWidth } from '@/components/workspace/shared/hooks/use-element-width'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'

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
  onSplit: (tabId: string, direction: EditorSplitDirection) => boolean
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
    ? (closeLayoutSnapshotRef.current ??
      cachedCloseLayoutSnapshot ??
      mountedChromeTabCloseLayoutSnapshot(tabListRef.current, tabs))
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
    captureCloseLayoutSnapshot(tabId)
    onBeforeClose?.()
    const closed = onClose(tabId)
    if (closed) return
  }

  function captureCloseLayoutSnapshot(tabId: string) {
    const promotedTabId = promotedChromeTabIdAfterClose(tabs, tabId)
    const nextCloseLayoutSnapshot =
      chromeTabCloseLayoutSnapshot(tabs, layout, closeLayoutSnapshot, promotedTabId) ??
      mountedChromeTabCloseLayoutSnapshot(tabListRef.current, tabs, promotedTabId)
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
        const dragged = drag.draggedTabId === visualTab.tab.id

        return (
          <ChromeEditorTab
            closedWidth={closeLayoutSnapshot?.closedWidth ?? overlap}
            closeMode={closing}
            closeTarget={visualTab.tab.id === closeBurstTargetId}
            dragOffsetX={dragged && !drag.state?.detached ? (drag.state?.offsetX ?? 0) : 0}
            dragged={dragged}
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
            onPointerCancel={drag.onPointerCancel}
            onPointerDown={drag.onPointerDown}
            onPointerMove={drag.onPointerMove}
            onPointerUp={drag.onPointerUp}
            onSelect={onSelect}
          />
        )
      })}
    </div>
  )
}

function mountedChromeTabCloseLayoutSnapshot(
  tabListElement: HTMLElement | null,
  visualTabs: readonly EditorChromeVisualTab[],
  promotedActiveTabId: string | null = null,
): ChromeTabCloseLayoutSnapshot | null {
  if (!tabListElement) return null

  const measurements = mountedChromeTabMeasurements(tabListElement)
  const widthsById = new Map(measurements.map((measurement) => [measurement.id, measurement.width]))

  if (widthsById.size === 0) return null

  promoteMountedActiveCloseWidth(widthsById, visualTabs, promotedActiveTabId)

  return {
    closedWidth: CHROME_TAB_CLOSED_WIDTH,
    overlap: mountedChromeTabOverlap(measurements),
    widthsById,
  }
}

type MountedChromeTabMeasurement = {
  readonly id: string
  readonly left: number
  readonly right: number
  readonly width: number
}

function mountedChromeTabMeasurements(tabListElement: HTMLElement) {
  const measurements: MountedChromeTabMeasurement[] = []
  const tabElements = tabListElement.querySelectorAll<HTMLElement>('[data-editor-tab-id]')
  for (const tabElement of tabElements) {
    const measurement = mountedChromeTabMeasurement(tabElement)
    if (!measurement) continue

    measurements.push(measurement)
  }

  return measurements
}

function mountedChromeTabMeasurement(tabElement: HTMLElement): MountedChromeTabMeasurement | null {
  const id = tabElement.dataset.editorTabId
  if (!id) return null

  const rect = tabElement.getBoundingClientRect()
  if (rect.width <= 0) return null

  return {
    id,
    left: rect.left,
    right: rect.right,
    width: rect.width,
  }
}

function mountedChromeTabOverlap(measurements: readonly MountedChromeTabMeasurement[]) {
  let overlap = 0
  for (let index = 1; index < measurements.length; index += 1) {
    const previous = measurements[index - 1]
    const current = measurements[index]
    if (!previous || !current) continue

    overlap = Math.max(overlap, previous.right - current.left)
  }

  return Math.max(0, Math.min(CHROME_TAB_CLOSED_WIDTH, Math.round(overlap)))
}

function promoteMountedActiveCloseWidth(
  widthsById: Map<string, number>,
  visualTabs: readonly EditorChromeVisualTab[],
  promotedActiveTabId: string | null,
) {
  const promotedTabId = promotedActiveTabId ?? mountedActiveClosePromotedTabId(visualTabs)
  if (!promotedTabId) return

  const width = widthsById.get(promotedTabId)
  if (typeof width !== 'number') return

  widthsById.set(
    promotedTabId,
    Math.max(width, CHROME_TAB_ACTIVE_MIN_WIDTH + CHROME_TAB_TRAILING_SLOT_WIDTH),
  )
}

function mountedActiveClosePromotedTabId(visualTabs: readonly EditorChromeVisualTab[]) {
  const activeClosingTab = visualTabs.find((visualTab) => {
    if (visualTab.phase !== 'closing') return false

    return visualTab.tab.active
  })
  if (!activeClosingTab) return null

  return (
    visualTabs.find((visualTab) => {
      if (visualTab.phase === 'closing') return false

      return visualTab.tab.active
    })?.tab.id ?? null
  )
}
