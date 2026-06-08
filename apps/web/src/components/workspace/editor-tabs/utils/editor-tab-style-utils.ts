import type { CSSProperties } from 'react'

import {
  CHROME_TAB_ACTIVE_MIN_WIDTH,
  CHROME_TAB_HEIGHT,
  CHROME_TAB_INACTIVE_MIN_WIDTH,
  CHROME_TAB_STANDARD_WIDTH,
  CHROME_TAB_TRAILING_SLOT_WIDTH,
} from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import {
  CHROME_TAB_SLOT_TRANSITION,
  CHROME_TAB_TRANSITION,
} from '@/components/workspace/editor-tabs/utils/chrome-tab-style'
import type {
  EditorChromeVisualTab,
  EditorTabModel,
  EditorTabSizing,
} from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { colorForFileIcon, type ResolvedFileIcon } from '@/lib/file-icons'

export const CHROME_TAB_GROW_DELAY_MS = 1000

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
