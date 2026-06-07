import type { CSSProperties } from 'react'

import {
  CHROME_TAB_ACTIVE_MIN_WIDTH,
  CHROME_TAB_HEIGHT,
  CHROME_TAB_INACTIVE_MIN_WIDTH,
  CHROME_TAB_STANDARD_WIDTH,
  CHROME_TAB_TRAILING_SLOT_WIDTH,
} from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import type {
  EditorChromeVisualTab,
  EditorTabModel,
  EditorTabSizing,
} from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import type { EditorTabInsertionEdge } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import { colorForFileIcon, type ResolvedFileIcon } from '@/lib/file-icons'
import { cn } from '@workspace/ui/lib/utils'

export const CHROME_TAB_GROW_DELAY_MS = 1000

const CHROME_TAB_CLOSE_BURST_MS = 45
const CHROME_TAB_CLOSE_BURST_EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
const CHROME_TAB_TRANSITION = `flex-basis ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, margin-left ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, max-width ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, min-width ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, opacity ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, width ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}`
const CHROME_TAB_SLOT_TRANSITION = `max-width ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, min-width ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, width ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}`

export function tabDragClassName(insertionEdge: EditorTabInsertionEdge, dragged: boolean) {
  return cn(
    'transition-opacity',
    dragged && 'opacity-45',
    insertionEdge === 'before' &&
      "before:pointer-events-none before:absolute before:top-1 before:bottom-1 before:left-0 before:z-40 before:w-0.5 before:rounded-full before:bg-ring before:content-['']",
    insertionEdge === 'after' &&
      "after:pointer-events-none after:absolute after:top-1 after:right-0 after:bottom-1 after:z-40 after:w-0.5 after:rounded-full after:bg-ring after:content-['']",
  )
}

export function tabSizingClassName(tabSizing: EditorTabSizing) {
  if (tabSizing === 'fixed') return 'min-w-[50px] max-w-40 flex-[1_0_0]'
  if (tabSizing === 'shrink') return 'min-w-20 max-w-fit basis-0 grow'

  return 'w-[120px] min-w-fit shrink-0'
}

export function fileIconStyle(icon: ResolvedFileIcon): CSSProperties {
  const mask = `url(${icon.src}) center / contain no-repeat`

  return {
    backgroundColor: colorForFileIcon(icon),
    mask,
    WebkitMask: mask,
  }
}

export function activeChromeTabId(visualTabs: readonly EditorChromeVisualTab[]) {
  return (
    visualTabs.find((visualTab) => visualTab.phase !== 'closing' && visualTab.tab.active)?.tab.id ??
    null
  )
}

export function chromeTrailingSlotWidths(visualTabs: readonly EditorChromeVisualTab[]) {
  return visualTabs.map((visualTab) => {
    if (visualTab.phase === 'closing') return 0
    if (!visualTab.tab.active) return 0

    return CHROME_TAB_TRAILING_SLOT_WIDTH
  })
}

export function chromeTabCloseButtonVisibilityClassName(
  tab: EditorTabModel,
  dirty: boolean,
  forceVisible: boolean,
) {
  if (forceVisible) return 'opacity-100'
  if (tab.active && !dirty) return 'opacity-100'

  return 'pointer-events-none opacity-0 group-focus-within/chrome-tab:pointer-events-auto group-focus-within/chrome-tab:opacity-100 group-hover/chrome-tab:pointer-events-auto group-hover/chrome-tab:opacity-100'
}

export function chromeTabTrailingSlotStyle(closeMode: boolean) {
  return {
    '--chrome-tab-trailing-slot-width': `${CHROME_TAB_TRAILING_SLOT_WIDTH}px`,
    transition: closeMode ? 'none' : CHROME_TAB_SLOT_TRANSITION,
  } as CSSProperties
}

export function chromeTabStyle(
  visualTab: EditorChromeVisualTab,
  index: number,
  overlap: number,
  layoutWidth: number | null,
  trailingSlotWidth: number,
  closedWidth = overlap,
) {
  const tab = visualTab.tab
  const fixedWidth = openingTabWidth(visualTab, overlap, closedWidth)
  const targetWidth = fixedWidth ?? layoutWidth
  const minWidth = tab.active
    ? CHROME_TAB_ACTIVE_MIN_WIDTH + trailingSlotWidth
    : CHROME_TAB_INACTIVE_MIN_WIDTH + trailingSlotWidth

  return {
    '--chrome-tab-z': tab.active ? 2000 : 1000 - index,
    flex: targetWidth === null ? '1 1 0px' : `0 0 ${targetWidth}px`,
    height: CHROME_TAB_HEIGHT,
    marginLeft: index === 0 ? 0 : -overlap,
    maxWidth: targetWidth ?? CHROME_TAB_STANDARD_WIDTH + trailingSlotWidth,
    minWidth: targetWidth ?? minWidth,
    transition: visualTab.phase === 'closing' ? 'none' : CHROME_TAB_TRANSITION,
    width: targetWidth ?? 'auto',
  } as CSSProperties
}

function openingTabWidth(visualTab: EditorChromeVisualTab, overlap: number, closedWidth: number) {
  if (visualTab.phase === 'closing') return closedWidth
  if (visualTab.phase === 'opening') return overlap

  return null
}
