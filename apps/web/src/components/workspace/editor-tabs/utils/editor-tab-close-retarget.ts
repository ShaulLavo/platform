import type {
  ChromeVisualTab,
  ChromeVisualTabSource,
} from '@/components/workspace/editor-tabs/hooks/use-chrome-visual-tabs'

export function chromeTabCloseTargetAfterClosingTab<TTab extends IdentifiedChromeVisualTabSource>(
  visualTabs: readonly ChromeVisualTab<TTab>[],
  closingTabId: TTab['id'],
): TTab['id'] | null {
  const closingIndex = visualTabs.findIndex((visualTab) => visualTab.tab.id === closingTabId)
  if (closingIndex < 0) return null

  return chromeTabCloseTargetAfterIndex(visualTabs, closingIndex)
}

export function chromeTabCloseBurstTargetId<TTab extends IdentifiedChromeVisualTabSource>(
  visualTabs: readonly ChromeVisualTab<TTab>[],
): TTab['id'] | null {
  for (let index = visualTabs.length - 1; index >= 0; index -= 1) {
    const visualTab = visualTabs[index]
    if (!visualTab) continue
    if (visualTab.phase !== 'closing') continue

    return chromeTabCloseTargetAfterIndex(visualTabs, index)
  }

  return null
}

function chromeTabCloseTargetAfterIndex<TTab extends IdentifiedChromeVisualTabSource>(
  visualTabs: readonly ChromeVisualTab<TTab>[],
  closingIndex: number,
): TTab['id'] | null {
  for (let index = closingIndex + 1; index < visualTabs.length; index += 1) {
    const visualTab = visualTabs[index]
    if (!visualTab) continue
    if (visualTab.phase === 'closing') continue

    return visualTab.tab.id
  }

  return null
}

type IdentifiedChromeVisualTabSource = ChromeVisualTabSource & {
  readonly id: string
}
