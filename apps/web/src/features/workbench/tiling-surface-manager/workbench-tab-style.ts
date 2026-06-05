import type { CSSProperties } from 'react'

import {
  CHROME_TAB_ACTIVE_MIN_WIDTH,
  CHROME_TAB_HEIGHT,
  CHROME_TAB_INACTIVE_MIN_WIDTH,
  CHROME_TAB_STANDARD_WIDTH,
} from '@/components/workspace/chrome-tab-layout'

export function workbenchChromeTabStyle({
  active,
  index,
  overlap,
  width,
}: {
  readonly active: boolean
  readonly index: number
  readonly overlap: number
  readonly width: number | null
}): CSSProperties {
  const minWidth = active ? CHROME_TAB_ACTIVE_MIN_WIDTH : CHROME_TAB_INACTIVE_MIN_WIDTH

  return {
    '--chrome-tab-z': active ? 30 : 1,
    flex: width === null ? '1 1 0px' : `0 0 ${width}px`,
    height: CHROME_TAB_HEIGHT,
    marginLeft: index === 0 ? 0 : -overlap,
    maxWidth: width ?? CHROME_TAB_STANDARD_WIDTH,
    minWidth: width ?? minWidth,
    width: width ?? 'auto',
  } as CSSProperties
}
