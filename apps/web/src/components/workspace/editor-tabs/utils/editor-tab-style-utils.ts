import type { CSSProperties } from 'react'

import {
  CHROME_TAB_ACTIVE_MIN_WIDTH,
  CHROME_TAB_CLOSED_WIDTH,
  CHROME_TAB_HEIGHT,
  CHROME_TAB_INACTIVE_MIN_WIDTH,
  CHROME_TAB_STANDARD_WIDTH,
  CHROME_TAB_TRAILING_SLOT_WIDTH,
  type ChromeTabLayout,
} from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import type {
  EditorChromeVisualTab,
  EditorTabModel,
  EditorTabSizing,
} from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import type { EditorTabInsertionEdge } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import { colorForFileIcon, type ResolvedFileIcon } from '@/lib/file-icons'
import { cn } from '@workspace/ui/lib/utils'

export const CHROME_TAB_GROW_DELAY_MS = 1200

const CHROME_TAB_TRANSITION =
  'flex-basis 160ms cubic-bezier(0.2, 0, 0, 1), margin-left 160ms cubic-bezier(0.2, 0, 0, 1), max-width 160ms cubic-bezier(0.2, 0, 0, 1), min-width 160ms cubic-bezier(0.2, 0, 0, 1), transform 160ms cubic-bezier(0.2, 0, 0, 1), width 160ms cubic-bezier(0.2, 0, 0, 1)'
const CHROME_TAB_SLOT_TRANSITION =
  'max-width 160ms cubic-bezier(0.2, 0, 0, 1), min-width 160ms cubic-bezier(0.2, 0, 0, 1), width 160ms cubic-bezier(0.2, 0, 0, 1)'

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
  return visualTabs.find((visualTab) => visualTab.tab.active)?.tab.id ?? null
}

export function chromeTrailingSlotWidths(visualTabs: readonly EditorChromeVisualTab[]) {
  return visualTabs.map((visualTab) => {
    if (!visualTab.tab.active) return 0

    return CHROME_TAB_TRAILING_SLOT_WIDTH
  })
}

export function chromeTabCloseButtonVisibilityClassName(tab: EditorTabModel, dirty: boolean) {
  if (tab.active && !dirty) return 'opacity-100'

  return 'pointer-events-none opacity-0 group-focus-within/chrome-tab:pointer-events-auto group-focus-within/chrome-tab:opacity-100 group-hover/chrome-tab:pointer-events-auto group-hover/chrome-tab:opacity-100'
}

export function chromeCloseSpacerStyle(width: number) {
  return {
    flex: `0 0 ${width}px`,
    maxWidth: width,
    minWidth: width,
    width,
  } as CSSProperties
}

export function chromeTabTrailingSlotStyle() {
  return {
    '--chrome-tab-trailing-slot-width': `${CHROME_TAB_TRAILING_SLOT_WIDTH}px`,
    transition: CHROME_TAB_SLOT_TRANSITION,
  } as CSSProperties
}

export type ChromeCloseSpacerSnapshot = {
  readonly overlap: number
  readonly tabs: readonly ChromeCloseSpacerSnapshotTab[]
}

type ChromeCloseSpacerSnapshotTab = {
  readonly id: string
  readonly width: number
}

export function chromeCloseSpacerSnapshot(
  visualTabs: readonly EditorChromeVisualTab[],
  layout: ChromeTabLayout | null,
  rootElement: HTMLElement | null,
): ChromeCloseSpacerSnapshot {
  const domWidths = chromeTabDomWidths(rootElement)

  return {
    overlap: layout?.overlap ?? 0,
    tabs: visualTabs.map((visualTab, index) => ({
      id: visualTab.tab.id,
      width: domWidths.get(visualTab.tab.id) ?? layout?.tabs[index]?.width ?? 0,
    })),
  }
}

function chromeTabDomWidths(rootElement: HTMLElement | null) {
  const widths = new Map<string, number>()
  if (rootElement === null) return widths

  const tabElements = rootElement.querySelectorAll<HTMLElement>('[data-editor-tab-id]')
  for (const tabElement of tabElements) {
    const tabId = tabElement.dataset.editorTabId
    if (!tabId) continue

    widths.set(tabId, tabElement.getBoundingClientRect().width)
  }

  return widths
}

export function removedChromeCloseSpacerWidth(
  previous: ChromeCloseSpacerSnapshot | null,
  current: ChromeCloseSpacerSnapshot,
) {
  if (previous === null) return 0

  const currentTabIds = new Set(current.tabs.map((tab) => tab.id))
  return previous.tabs.reduce((width, tab) => {
    if (currentTabIds.has(tab.id)) return width

    return width + Math.max(0, tab.width - previous.overlap)
  }, 0)
}

export function chromeTabStyle(
  visualTab: EditorChromeVisualTab,
  index: number,
  overlap: number,
  layoutWidth: number | null,
  trailingSlotWidth: number,
) {
  const tab = visualTab.tab
  const fixedWidth = openingTabWidth(visualTab)
  const targetWidth = fixedWidth ?? layoutWidth
  const minWidth = tab.active
    ? CHROME_TAB_ACTIVE_MIN_WIDTH + trailingSlotWidth
    : CHROME_TAB_INACTIVE_MIN_WIDTH + trailingSlotWidth

  return {
    '--chrome-tab-z': tab.active ? 30 : 1,
    flex: targetWidth === null ? '1 1 0px' : `0 0 ${targetWidth}px`,
    height: CHROME_TAB_HEIGHT,
    marginLeft: index === 0 ? 0 : -overlap,
    maxWidth: targetWidth ?? CHROME_TAB_STANDARD_WIDTH + trailingSlotWidth,
    minWidth: targetWidth ?? minWidth,
    transition: CHROME_TAB_TRANSITION,
    width: targetWidth ?? 'auto',
  } as CSSProperties
}

function openingTabWidth(visualTab: EditorChromeVisualTab) {
  if (visualTab.phase === 'opening') return CHROME_TAB_CLOSED_WIDTH

  return null
}
