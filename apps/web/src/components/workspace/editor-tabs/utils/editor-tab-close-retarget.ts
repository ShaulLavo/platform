import type { EditorChromeVisualTab } from '@/components/workspace/editor-tabs/utils/editor-tab-types'

export function chromeTabCloseTargetAfterClosingTab(
  visualTabs: readonly EditorChromeVisualTab[],
  closingTabId: string,
) {
  const closingIndex = visualTabs.findIndex((visualTab) => visualTab.tab.id === closingTabId)
  if (closingIndex < 0) return null

  return chromeTabCloseTargetAfterIndex(visualTabs, closingIndex)
}

export function chromeTabCloseBurstTargetId(visualTabs: readonly EditorChromeVisualTab[]) {
  for (let index = visualTabs.length - 1; index >= 0; index -= 1) {
    const visualTab = visualTabs[index]
    if (!visualTab) continue
    if (visualTab.phase !== 'closing') continue

    return chromeTabCloseTargetAfterIndex(visualTabs, index)
  }

  return null
}

function chromeTabCloseTargetAfterIndex(
  visualTabs: readonly EditorChromeVisualTab[],
  closingIndex: number,
) {
  for (let index = closingIndex + 1; index < visualTabs.length; index += 1) {
    const visualTab = visualTabs[index]
    if (!visualTab) continue
    if (visualTab.phase === 'closing') continue

    return visualTab.tab.id
  }

  return null
}
