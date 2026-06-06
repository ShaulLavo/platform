import { useLayoutEffect, useReducer, type Reducer } from 'react'

import { CHROME_TAB_GROW_DELAY_MS } from '@/components/workspace/editor-tabs/utils/editor-tab-style-utils'

export type ChromeVisualTabPhase = 'closing' | 'opening' | 'present'

export type ChromeVisualTabSource = {
  id?: string
  path: string
}

export type ChromeVisualTab<TTab extends ChromeVisualTabSource> = {
  phase: ChromeVisualTabPhase
  tab: TTab
}

export type ChromeVisualTabsState<TTab extends ChromeVisualTabSource> = {
  sourceTabs: readonly TTab[]
  visualTabs: readonly ChromeVisualTab<TTab>[]
}

export type ChromeVisualTabEquality<TTab extends ChromeVisualTabSource> = (
  left: TTab,
  right: TTab,
) => boolean

export type ChromeVisualTabsAction<TTab extends ChromeVisualTabSource> =
  | {
      areTabsEqual: ChromeVisualTabEquality<TTab>
      tabs: readonly TTab[]
      type: 'sync-tabs'
    }
  | {
      openingKey: string
      type: 'finish-opening'
    }
  | {
      closingKey: string
      type: 'remove-closing'
    }

export function useChromeVisualTabs<TTab extends ChromeVisualTabSource>(
  tabs: readonly TTab[],
  enabled: boolean,
  areTabsEqual: ChromeVisualTabEquality<TTab> = sameChromeVisualTabSource,
) {
  const reducer: Reducer<
    ChromeVisualTabsState<TTab>,
    ChromeVisualTabsAction<TTab>
  > = chromeVisualTabsReducer
  const [state, dispatch] = useReducer(reducer, initialChromeVisualTabsState(tabs))
  const visualTabs =
    enabled && state.sourceTabs !== tabs
      ? syncChromeVisualTabs(state.visualTabs, tabs, areTabsEqual)
      : state.visualTabs
  const openingKey = chromeVisualTabPhaseKey(visualTabs, 'opening')
  const closingKey = chromeVisualTabPhaseKey(visualTabs, 'closing')

  useLayoutEffect(() => {
    if (!enabled) return
    if (state.sourceTabs === tabs) return

    dispatch({ areTabsEqual, tabs, type: 'sync-tabs' })
  }, [areTabsEqual, enabled, state.sourceTabs, tabs])

  useLayoutEffect(() => {
    if (!enabled) return
    if (!openingKey) return

    const frame = requestAnimationFrame(() => {
      dispatch({ openingKey, type: 'finish-opening' })
    })

    return () => cancelAnimationFrame(frame)
  }, [enabled, openingKey])

  useLayoutEffect(() => {
    if (!enabled) return
    if (!closingKey) return

    const timeout = window.setTimeout(() => {
      dispatch({ closingKey, type: 'remove-closing' })
    }, CHROME_TAB_GROW_DELAY_MS)

    return () => window.clearTimeout(timeout)
  }, [closingKey, enabled])

  if (!enabled) return []

  return visualTabs
}

export function chromeVisualTabsReducer<TTab extends ChromeVisualTabSource>(
  state: ChromeVisualTabsState<TTab>,
  action: ChromeVisualTabsAction<TTab>,
): ChromeVisualTabsState<TTab> {
  if (action.type === 'sync-tabs') {
    return syncChromeVisualTabsState(state, action.tabs, action.areTabsEqual)
  }

  if (action.type === 'finish-opening') {
    const openingKey = chromeVisualTabPhaseKey(state.visualTabs, 'opening')
    if (openingKey !== action.openingKey) return state

    return {
      ...state,
      visualTabs: presentOpeningChromeVisualTabs(state.visualTabs),
    }
  }

  const closingKey = chromeVisualTabPhaseKey(state.visualTabs, 'closing')
  if (closingKey !== action.closingKey) return state

  return {
    ...state,
    visualTabs: removeClosingChromeVisualTabs(state.visualTabs),
  }
}

export function syncChromeVisualTabs<TTab extends ChromeVisualTabSource>(
  current: readonly ChromeVisualTab<TTab>[],
  tabs: readonly TTab[],
  areTabsEqual: ChromeVisualTabEquality<TTab> = sameChromeVisualTabSource,
) {
  if (current.length === 0) return tabs.map(presentChromeVisualTab)

  const currentByKey = new Map(
    current.map((visualTab) => [chromeVisualTabKey(visualTab.tab), visualTab]),
  )
  const nextKeys = new Set(tabs.map(chromeVisualTabKey))
  const next = tabs.map((tab) => {
    const visualTab = currentByKey.get(chromeVisualTabKey(tab))
    if (!visualTab) return { phase: 'opening' as const, tab }

    return nextChromeVisualTab(visualTab, tab, areTabsEqual)
  })
  const closing = current.filter((visualTab) => {
    const key = chromeVisualTabKey(visualTab.tab)
    return !nextKeys.has(key)
  })
  const nextWithClosing = next.concat(closing.map(closingChromeVisualTab))

  if (sameChromeVisualTabs(current, nextWithClosing, areTabsEqual)) return current

  return nextWithClosing
}

function initialChromeVisualTabsState<TTab extends ChromeVisualTabSource>(
  tabs: readonly TTab[],
): ChromeVisualTabsState<TTab> {
  return {
    sourceTabs: tabs,
    visualTabs: tabs.map(presentChromeVisualTab),
  }
}

function syncChromeVisualTabsState<TTab extends ChromeVisualTabSource>(
  state: ChromeVisualTabsState<TTab>,
  tabs: readonly TTab[],
  areTabsEqual: ChromeVisualTabEquality<TTab>,
): ChromeVisualTabsState<TTab> {
  const visualTabs = syncChromeVisualTabs(state.visualTabs, tabs, areTabsEqual)
  if (state.sourceTabs === tabs && state.visualTabs === visualTabs) return state

  return { sourceTabs: tabs, visualTabs }
}

function nextChromeVisualTab<TTab extends ChromeVisualTabSource>(
  visualTab: ChromeVisualTab<TTab>,
  openTab: TTab,
  areTabsEqual: ChromeVisualTabEquality<TTab>,
): ChromeVisualTab<TTab> {
  const tab = areTabsEqual(visualTab.tab, openTab) ? visualTab.tab : openTab
  if (visualTab.phase === 'opening') return { phase: 'opening', tab }

  return { phase: 'present', tab }
}

function presentChromeVisualTab<TTab extends ChromeVisualTabSource>(
  tab: TTab,
): ChromeVisualTab<TTab> {
  return { phase: 'present', tab }
}

function closingChromeVisualTab<TTab extends ChromeVisualTabSource>(
  visualTab: ChromeVisualTab<TTab>,
): ChromeVisualTab<TTab> {
  return { phase: 'closing', tab: visualTab.tab }
}

function presentOpeningChromeVisualTabs<TTab extends ChromeVisualTabSource>(
  current: readonly ChromeVisualTab<TTab>[],
) {
  return current.map((visualTab) => {
    if (visualTab.phase !== 'opening') return visualTab

    return { ...visualTab, phase: 'present' as const }
  })
}

function removeClosingChromeVisualTabs<TTab extends ChromeVisualTabSource>(
  current: readonly ChromeVisualTab<TTab>[],
) {
  return current.filter((visualTab) => visualTab.phase !== 'closing')
}

function chromeVisualTabPhaseKey<TTab extends ChromeVisualTabSource>(
  visualTabs: readonly ChromeVisualTab<TTab>[],
  phase: ChromeVisualTabPhase,
) {
  return visualTabs
    .filter((visualTab) => visualTab.phase === phase)
    .map((visualTab) => chromeVisualTabKey(visualTab.tab))
    .join('\0')
}

function chromeVisualTabKey(tab: ChromeVisualTabSource) {
  return tab.id ?? tab.path
}

function sameChromeVisualTabs<TTab extends ChromeVisualTabSource>(
  left: readonly ChromeVisualTab<TTab>[],
  right: readonly ChromeVisualTab<TTab>[],
  areTabsEqual: ChromeVisualTabEquality<TTab>,
) {
  if (left.length !== right.length) return false

  return left.every((visualTab, index) =>
    sameChromeVisualTab(visualTab, right[index], areTabsEqual),
  )
}

function sameChromeVisualTab<TTab extends ChromeVisualTabSource>(
  left: ChromeVisualTab<TTab>,
  right: ChromeVisualTab<TTab> | undefined,
  areTabsEqual: ChromeVisualTabEquality<TTab>,
) {
  if (!right) return false
  if (left.phase !== right.phase) return false

  return areTabsEqual(left.tab, right.tab)
}

function sameChromeVisualTabSource<TTab extends ChromeVisualTabSource>(left: TTab, right: TTab) {
  return Object.is(left, right)
}
