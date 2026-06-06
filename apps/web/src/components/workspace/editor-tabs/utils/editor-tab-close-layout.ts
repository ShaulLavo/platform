import type { ChromeTabLayout } from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'
import type { EditorChromeVisualTab } from '@/components/workspace/editor-tabs/utils/editor-tab-types'

export type ChromeTabCloseLayoutSnapshot = {
  readonly overlap: number
  readonly widthsById: ReadonlyMap<string, number>
}

const chromeTabCloseLayoutSnapshotCache = new Map<string, ChromeTabCloseLayoutSnapshot>()

export function hasClosingChromeTabs(visualTabs: readonly EditorChromeVisualTab[]) {
  return visualTabs.some((visualTab) => visualTab.phase === 'closing')
}

export function chromeTabCloseLayoutSnapshot(
  visualTabs: readonly EditorChromeVisualTab[],
  layout: ChromeTabLayout | null,
  heldSnapshot: ChromeTabCloseLayoutSnapshot | null = null,
): ChromeTabCloseLayoutSnapshot | null {
  if (!layout) return null

  const widthsById = new Map<string, number>()
  for (const [index, visualTab] of visualTabs.entries()) {
    const tabBounds = layout.tabs[index]
    if (!tabBounds) continue

    widthsById.set(
      visualTab.tab.id,
      chromeTabCloseLayoutSnapshotWidth(visualTab, tabBounds.width, layout, heldSnapshot),
    )
  }

  return {
    overlap: layout.overlap,
    widthsById,
  }
}

export function chromeTabCloseLayoutWidth(
  snapshot: ChromeTabCloseLayoutSnapshot | null,
  visualTab: EditorChromeVisualTab,
  fallbackWidth: number | null,
) {
  if (!snapshot) return fallbackWidth

  return snapshot.widthsById.get(visualTab.tab.id) ?? fallbackWidth
}

export function chromeTabCloseModeAvailableWidth(
  snapshot: ChromeTabCloseLayoutSnapshot | null,
  visualTabs: readonly EditorChromeVisualTab[],
  availableWidth: number,
) {
  if (!snapshot) return availableWidth

  const removedWidth = chromeTabCloseModeRemovedWidth(snapshot, visualTabs)
  if (removedWidth <= 0) return availableWidth

  return Math.max(0, availableWidth - removedWidth)
}

export function cacheChromeTabCloseLayoutSnapshot(
  cacheKey: string | undefined,
  snapshot: ChromeTabCloseLayoutSnapshot | null,
) {
  if (!cacheKey) return

  if (!snapshot) {
    chromeTabCloseLayoutSnapshotCache.delete(cacheKey)
    return
  }

  chromeTabCloseLayoutSnapshotCache.set(cacheKey, snapshot)
}

export function cachedChromeTabCloseLayoutSnapshot(cacheKey: string | undefined) {
  if (!cacheKey) return null

  return chromeTabCloseLayoutSnapshotCache.get(cacheKey) ?? null
}

function chromeTabCloseLayoutSnapshotWidth(
  visualTab: EditorChromeVisualTab,
  tabWidth: number,
  layout: ChromeTabLayout,
  heldSnapshot: ChromeTabCloseLayoutSnapshot | null,
) {
  if (visualTab.phase === 'closing') return layout.overlap

  const heldWidth = heldSnapshot?.widthsById.get(visualTab.tab.id)
  if (typeof heldWidth === 'number') return heldWidth

  return tabWidth
}

function chromeTabCloseModeRemovedWidth(
  snapshot: ChromeTabCloseLayoutSnapshot,
  visualTabs: readonly EditorChromeVisualTab[],
) {
  return visualTabs.reduce((width, visualTab) => {
    if (visualTab.phase !== 'closing') return width

    return width + chromeTabCloseModeTabRemovedWidth(snapshot, visualTab)
  }, 0)
}

function chromeTabCloseModeTabRemovedWidth(
  snapshot: ChromeTabCloseLayoutSnapshot,
  visualTab: EditorChromeVisualTab,
) {
  const width = snapshot.widthsById.get(visualTab.tab.id)
  if (typeof width !== 'number') return 0

  return Math.max(0, width - snapshot.overlap)
}
