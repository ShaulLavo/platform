import type { CSSProperties } from 'react'

import {
  CHROME_TAB_ACTIVE_MIN_WIDTH,
  CHROME_TAB_HEIGHT,
  CHROME_TAB_INACTIVE_MIN_WIDTH,
  CHROME_TAB_STANDARD_WIDTH,
} from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import { CHROME_TAB_TRANSITION } from '@/components/workspace/editor-tabs/utils/chrome-tab-style'
import type { EditorChromeVisualTab } from '@/components/workspace/editor-tabs/utils/editor-tab-types'

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
