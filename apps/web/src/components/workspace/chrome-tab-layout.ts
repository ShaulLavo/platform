export const CHROME_TAB_STANDARD_WIDTH = 224
export const CHROME_TAB_ACTIVE_MIN_WIDTH = 80
export const CHROME_TAB_INACTIVE_MIN_WIDTH = 64
export const CHROME_TAB_OVERLAP = 18
export const CHROME_TAB_CLOSED_WIDTH = 18
export const CHROME_TAB_HEIGHT = 41
export const CHROME_TAB_INACTIVE_CLOSE_THRESHOLD = 68

export type ChromeTabLayoutInput = {
  activeIndex: number
  availableWidth: number
  tabCount: number
}

export type ChromeTabBounds = {
  index: number
  width: number
  x: number
}

export type ChromeTabLayout = {
  overlap: number
  tabs: ChromeTabBounds[]
  trackWidth: number
}

export function chromeTabLayout({
  activeIndex,
  availableWidth,
  tabCount,
}: ChromeTabLayoutInput): ChromeTabLayout {
  if (tabCount <= 0) return { overlap: 0, tabs: [], trackWidth: 0 }

  const overlap = chromeTabOverlap({ activeIndex, availableWidth, tabCount })
  const widths = chromeTabWidths({
    activeIndex,
    overlap,
    availableWidth,
    tabCount,
  })
  const tabs = tabBoundsForWidths(widths, overlap)
  const lastTab = tabs.at(-1)

  return {
    overlap,
    tabs,
    trackWidth: lastTab ? lastTab.x + lastTab.width : 0,
  }
}

function chromeTabWidths({
  activeIndex,
  overlap,
  availableWidth,
  tabCount,
}: ChromeTabLayoutInput & { overlap: number }) {
  const effectiveWidth = effectiveTabWidth(availableWidth, tabCount, overlap)
  const standardTotal = CHROME_TAB_STANDARD_WIDTH * tabCount

  if (effectiveWidth >= standardTotal) {
    return Array.from({ length: tabCount }, () => CHROME_TAB_STANDARD_WIDTH)
  }

  const equalMinimumTotal = CHROME_TAB_ACTIVE_MIN_WIDTH * tabCount
  if (effectiveWidth >= equalMinimumTotal) {
    return distributeWidth(effectiveWidth, tabCount)
  }

  const normalizedActiveIndex = normalizeActiveIndex(activeIndex, tabCount)
  if (normalizedActiveIndex === null) {
    return inactiveOnlyWidths(effectiveWidth, tabCount)
  }

  return activeMinimumWidths(effectiveWidth, tabCount, normalizedActiveIndex)
}

function chromeTabOverlap({
  activeIndex,
  availableWidth,
  tabCount,
}: ChromeTabLayoutInput) {
  if (tabCount <= 1) return 0

  const safeAvailableWidth = safeTabAvailableWidth(availableWidth)
  const normalizedActiveIndex = normalizeActiveIndex(activeIndex, tabCount)
  const minimumTotal = minimumTabTotalWidth(tabCount, normalizedActiveIndex)
  const overflow = minimumTotal - safeAvailableWidth

  if (overflow <= 0) return 0

  return Math.min(CHROME_TAB_OVERLAP, overflow / (tabCount - 1))
}

function minimumTabTotalWidth(tabCount: number, activeIndex: number | null) {
  if (activeIndex === null) return CHROME_TAB_INACTIVE_MIN_WIDTH * tabCount

  return (
    CHROME_TAB_ACTIVE_MIN_WIDTH + CHROME_TAB_INACTIVE_MIN_WIDTH * (tabCount - 1)
  )
}

function effectiveTabWidth(
  availableWidth: number,
  tabCount: number,
  overlap: number
) {
  const safeAvailableWidth = safeTabAvailableWidth(availableWidth)

  return safeAvailableWidth + overlap * (tabCount - 1)
}

function safeTabAvailableWidth(availableWidth: number) {
  const safeAvailableWidth = Math.max(0, Math.floor(availableWidth))

  return safeAvailableWidth
}

function activeMinimumWidths(
  effectiveWidth: number,
  tabCount: number,
  activeIndex: number
) {
  const minimumTotal =
    CHROME_TAB_ACTIVE_MIN_WIDTH + CHROME_TAB_INACTIVE_MIN_WIDTH * (tabCount - 1)

  if (effectiveWidth <= minimumTotal) {
    return Array.from({ length: tabCount }, (_value, index) =>
      index === activeIndex
        ? CHROME_TAB_ACTIVE_MIN_WIDTH
        : CHROME_TAB_INACTIVE_MIN_WIDTH
    )
  }

  const inactiveWidths = distributeWidth(
    effectiveWidth - CHROME_TAB_ACTIVE_MIN_WIDTH,
    tabCount - 1
  )
  let inactiveIndex = 0

  return Array.from({ length: tabCount }, (_value, index) => {
    if (index === activeIndex) return CHROME_TAB_ACTIVE_MIN_WIDTH

    const width = inactiveWidths[inactiveIndex] ?? CHROME_TAB_INACTIVE_MIN_WIDTH
    inactiveIndex += 1
    return Math.max(CHROME_TAB_INACTIVE_MIN_WIDTH, width)
  })
}

function inactiveOnlyWidths(effectiveWidth: number, tabCount: number) {
  const minimumTotal = CHROME_TAB_INACTIVE_MIN_WIDTH * tabCount
  if (effectiveWidth <= minimumTotal) {
    return Array.from({ length: tabCount }, () => CHROME_TAB_INACTIVE_MIN_WIDTH)
  }

  return distributeWidth(effectiveWidth, tabCount).map((width) =>
    Math.max(CHROME_TAB_INACTIVE_MIN_WIDTH, width)
  )
}

function distributeWidth(totalWidth: number, count: number) {
  if (count <= 0) return []

  const baseWidth = Math.floor(totalWidth / count)
  const remainder = totalWidth - baseWidth * count

  return Array.from({ length: count }, (_value, index) =>
    index < remainder ? baseWidth + 1 : baseWidth
  )
}

function normalizeActiveIndex(activeIndex: number, tabCount: number) {
  if (activeIndex < 0) return null
  if (activeIndex >= tabCount) return null

  return activeIndex
}

function tabBoundsForWidths(widths: readonly number[], overlap: number) {
  let x = 0

  return widths.map((width, index) => {
    const bounds = { index, width, x }
    x += width - overlap
    return bounds
  })
}
