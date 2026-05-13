export const CHROME_TAB_STANDARD_WIDTH = 224
export const CHROME_TAB_ACTIVE_MIN_WIDTH = 80
export const CHROME_TAB_INACTIVE_MIN_WIDTH = 64
export const CHROME_TAB_OVERLAP = 18
export const CHROME_TAB_CLOSED_WIDTH = 18
export const CHROME_TAB_HEIGHT = 41
export const CHROME_TAB_INACTIVE_CLOSE_THRESHOLD = 68
export const CHROME_TAB_TRAILING_SLOT_WIDTH = 28

const EMPTY_TRAILING_SLOT_WIDTHS: readonly number[] = []

export type ChromeTabLayoutInput = {
  activeIndex: number
  availableWidth: number
  tabCount: number
  trailingSlotWidths?: readonly number[]
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
  trailingSlotWidths: inputTrailingSlotWidths = EMPTY_TRAILING_SLOT_WIDTHS,
}: ChromeTabLayoutInput): ChromeTabLayout {
  if (tabCount <= 0) return { overlap: 0, tabs: [], trackWidth: 0 }

  const trailingSlotWidths = normalizeTrailingSlotWidths(
    inputTrailingSlotWidths,
    tabCount
  )
  const overlap = chromeTabOverlap({
    activeIndex,
    availableWidth,
    tabCount,
    trailingSlotWidths,
  })
  const widths = chromeTabWidths({
    activeIndex,
    overlap,
    availableWidth,
    tabCount,
    trailingSlotWidths,
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
  trailingSlotWidths,
}: ChromeTabLayoutInput & {
  overlap: number
  trailingSlotWidths: readonly number[]
}) {
  const effectiveWidth = effectiveTabWidth(availableWidth, tabCount, overlap)
  const trailingSlotTotal = totalTrailingSlotWidth(trailingSlotWidths)
  const effectiveContentWidth = Math.max(0, effectiveWidth - trailingSlotTotal)
  const standardTotal = CHROME_TAB_STANDARD_WIDTH * tabCount + trailingSlotTotal

  if (effectiveWidth >= standardTotal) {
    return addTrailingSlotWidths(
      Array.from({ length: tabCount }, () => CHROME_TAB_STANDARD_WIDTH),
      trailingSlotWidths
    )
  }

  const equalMinimumTotal =
    CHROME_TAB_ACTIVE_MIN_WIDTH * tabCount + trailingSlotTotal
  if (effectiveWidth >= equalMinimumTotal) {
    return addTrailingSlotWidths(
      distributeWidth(effectiveContentWidth, tabCount),
      trailingSlotWidths
    )
  }

  const normalizedActiveIndex = normalizeActiveIndex(activeIndex, tabCount)
  if (normalizedActiveIndex === null) {
    return inactiveOnlyWidths(
      effectiveContentWidth,
      tabCount,
      trailingSlotWidths
    )
  }

  return activeMinimumWidths(
    effectiveContentWidth,
    tabCount,
    normalizedActiveIndex,
    trailingSlotWidths
  )
}

function chromeTabOverlap({
  activeIndex,
  availableWidth,
  tabCount,
  trailingSlotWidths = EMPTY_TRAILING_SLOT_WIDTHS,
}: ChromeTabLayoutInput) {
  if (tabCount <= 1) return 0

  const safeAvailableWidth = safeTabAvailableWidth(availableWidth)
  const normalizedTrailingSlotWidths = normalizeTrailingSlotWidths(
    trailingSlotWidths,
    tabCount
  )
  const normalizedActiveIndex = normalizeActiveIndex(activeIndex, tabCount)
  const minimumTotal = minimumTabTotalWidth(
    tabCount,
    normalizedActiveIndex,
    normalizedTrailingSlotWidths
  )
  const overflow = minimumTotal - safeAvailableWidth

  if (overflow <= 0) return 0

  return Math.min(CHROME_TAB_OVERLAP, overflow / (tabCount - 1))
}

function minimumTabTotalWidth(
  tabCount: number,
  activeIndex: number | null,
  trailingSlotWidths: readonly number[]
) {
  const trailingSlotTotal = totalTrailingSlotWidth(trailingSlotWidths)
  if (activeIndex === null) {
    return CHROME_TAB_INACTIVE_MIN_WIDTH * tabCount + trailingSlotTotal
  }

  return (
    CHROME_TAB_ACTIVE_MIN_WIDTH +
    CHROME_TAB_INACTIVE_MIN_WIDTH * (tabCount - 1) +
    trailingSlotTotal
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
  activeIndex: number,
  trailingSlotWidths: readonly number[]
) {
  const minimumTotal =
    CHROME_TAB_ACTIVE_MIN_WIDTH + CHROME_TAB_INACTIVE_MIN_WIDTH * (tabCount - 1)

  if (effectiveWidth <= minimumTotal) {
    return addTrailingSlotWidths(
      Array.from({ length: tabCount }, (_value, index) =>
        index === activeIndex
          ? CHROME_TAB_ACTIVE_MIN_WIDTH
          : CHROME_TAB_INACTIVE_MIN_WIDTH
      ),
      trailingSlotWidths
    )
  }

  const inactiveWidths = distributeWidth(
    effectiveWidth - CHROME_TAB_ACTIVE_MIN_WIDTH,
    tabCount - 1
  )
  let inactiveIndex = 0

  const widths = Array.from({ length: tabCount }, (_value, index) => {
    if (index === activeIndex) return CHROME_TAB_ACTIVE_MIN_WIDTH

    const width = inactiveWidths[inactiveIndex] ?? CHROME_TAB_INACTIVE_MIN_WIDTH
    inactiveIndex += 1
    return Math.max(CHROME_TAB_INACTIVE_MIN_WIDTH, width)
  })

  return addTrailingSlotWidths(widths, trailingSlotWidths)
}

function inactiveOnlyWidths(
  effectiveWidth: number,
  tabCount: number,
  trailingSlotWidths: readonly number[]
) {
  const minimumTotal = CHROME_TAB_INACTIVE_MIN_WIDTH * tabCount
  if (effectiveWidth <= minimumTotal) {
    return addTrailingSlotWidths(
      Array.from({ length: tabCount }, () => CHROME_TAB_INACTIVE_MIN_WIDTH),
      trailingSlotWidths
    )
  }

  return addTrailingSlotWidths(
    distributeWidth(effectiveWidth, tabCount).map((width) =>
      Math.max(CHROME_TAB_INACTIVE_MIN_WIDTH, width)
    ),
    trailingSlotWidths
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

function normalizeTrailingSlotWidths(
  widths: readonly number[],
  tabCount: number
) {
  return Array.from({ length: tabCount }, (_value, index) =>
    safeTrailingSlotWidth(widths[index])
  )
}

function safeTrailingSlotWidth(width: number | undefined) {
  if (typeof width !== "number") return 0
  if (!Number.isFinite(width)) return 0

  return Math.max(0, Math.floor(width))
}

function totalTrailingSlotWidth(widths: readonly number[]) {
  return widths.reduce((total, width) => total + width, 0)
}

function addTrailingSlotWidths(
  widths: readonly number[],
  trailingSlotWidths: readonly number[]
) {
  return widths.map((width, index) => width + (trailingSlotWidths[index] ?? 0))
}

function tabBoundsForWidths(widths: readonly number[], overlap: number) {
  let x = 0

  return widths.map((width, index) => {
    const bounds = { index, width, x }
    x += width - overlap
    return bounds
  })
}
