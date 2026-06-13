import { useLayoutEffect, useReducer, type Reducer } from 'react'

type ChromeVisualTabPhase = 'closing' | 'opening' | 'present'

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

const chromeVisualTabsStateCache = new Map<string, ChromeVisualTabsState<ChromeVisualTabSource>>()
const CHROME_TAB_CLOSE_HOLD_MS = 1000

export function useChromeVisualTabs<TTab extends ChromeVisualTabSource>(
  tabs: readonly TTab[],
  enabled: boolean,
  areTabsEqual: ChromeVisualTabEquality<TTab> = sameChromeVisualTabSource,
  cacheKey?: string,
) {
  const reducer: Reducer<
    ChromeVisualTabsState<TTab>,
    ChromeVisualTabsAction<TTab>
  > = chromeVisualTabsReducer
  const [state, dispatch] = useReducer(reducer, tabs, (initialTabs) =>
    chromeVisualTabsInitialState(initialTabs, cacheKey, areTabsEqual),
  )
  const sourceTabsChanged =
    enabled && !sameChromeVisualTabSources(state.sourceTabs, tabs, areTabsEqual)
  const visualTabs = sourceTabsChanged
    ? syncChromeVisualTabs(state.visualTabs, tabs, areTabsEqual)
    : state.visualTabs
  const openingKey = chromeVisualTabPhaseKey(visualTabs, 'opening')
  const closingKey = chromeVisualTabPhaseKey(visualTabs, 'closing')

  useLayoutEffect(() => {
    if (!enabled) return
    if (!sourceTabsChanged) return

    // oxlint-disable-next-line oxc-react-compiler/set-state-in-effect -- The hook returns derived visual tabs for this render, then syncs reducer state so timed phase updates apply to the same source set.
    dispatch({ areTabsEqual, tabs, type: 'sync-tabs' })
  }, [areTabsEqual, enabled, sourceTabsChanged, tabs])

  useLayoutEffect(() => {
    if (!enabled) return

    cacheChromeVisualTabsState(cacheKey, tabs, visualTabs)
  }, [cacheKey, enabled, tabs, visualTabs])

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
    }, CHROME_TAB_CLOSE_HOLD_MS)

    return () => window.clearTimeout(timeout)
  }, [closingKey, enabled])

  if (!enabled) return tabs.map(presentChromeVisualTab)

  return visualTabs
}

export function primeChromeVisualTabsCache<TTab extends ChromeVisualTabSource>(
  cacheKey: string | undefined,
  sourceTabs: readonly TTab[],
  visualTabs?: readonly ChromeVisualTab<TTab>[],
) {
  cacheChromeVisualTabsState(
    cacheKey,
    sourceTabs,
    visualTabs ?? sourceTabs.map(presentChromeVisualTab),
  )
}

export function chromeVisualTabsInitialState<TTab extends ChromeVisualTabSource>(
  tabs: readonly TTab[],
  cacheKey: string | undefined,
  areTabsEqual: ChromeVisualTabEquality<TTab> = sameChromeVisualTabSource,
): ChromeVisualTabsState<TTab> {
  const cached = cachedChromeVisualTabsState(cacheKey)
  if (!cached) return presentChromeVisualTabsState(tabs)
  if (!cachedChromeVisualTabsCanApply(cached.visualTabs, tabs)) {
    return presentChromeVisualTabsState(tabs)
  }

  return {
    sourceTabs: tabs,
    visualTabs: syncChromeVisualTabs(
      cached.visualTabs as readonly ChromeVisualTab<TTab>[],
      tabs,
      areTabsEqual,
    ),
  }
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

  const next = nextChromeVisualTabs(current, tabs, areTabsEqual)

  if (sameChromeVisualTabs(current, next, areTabsEqual)) return current

  return next
}

function nextChromeVisualTabs<TTab extends ChromeVisualTabSource>(
  current: readonly ChromeVisualTab<TTab>[],
  tabs: readonly TTab[],
  areTabsEqual: ChromeVisualTabEquality<TTab>,
) {
  const nextTabsByKey = new Map(tabs.map((tab) => [chromeVisualTabKey(tab), tab]))
  const closingTabs = current.filter(
    (visualTab) => !nextTabsByKey.has(chromeVisualTabKey(visualTab.tab)),
  )

  if (closingTabs.length === 0) {
    return sourceOrderedChromeVisualTabs(current, tabs, areTabsEqual)
  }

  return currentOrderedChromeVisualTabs(current, tabs, areTabsEqual)
}

function sourceOrderedChromeVisualTabs<TTab extends ChromeVisualTabSource>(
  current: readonly ChromeVisualTab<TTab>[],
  tabs: readonly TTab[],
  areTabsEqual: ChromeVisualTabEquality<TTab>,
) {
  const currentByKey = new Map(
    current.map((visualTab) => [chromeVisualTabKey(visualTab.tab), visualTab]),
  )

  return tabs.map((tab) => {
    const visualTab = currentByKey.get(chromeVisualTabKey(tab))
    if (!visualTab) return { phase: 'opening' as const, tab }

    return nextChromeVisualTab(visualTab, tab, areTabsEqual)
  })
}

function currentOrderedChromeVisualTabs<TTab extends ChromeVisualTabSource>(
  current: readonly ChromeVisualTab<TTab>[],
  tabs: readonly TTab[],
  areTabsEqual: ChromeVisualTabEquality<TTab>,
) {
  const nextTabsByKey = new Map(tabs.map((tab) => [chromeVisualTabKey(tab), tab]))
  const consumedKeys = new Set<string>()
  const next: ChromeVisualTab<TTab>[] = []

  for (const visualTab of current) {
    const key = chromeVisualTabKey(visualTab.tab)
    const tab = nextTabsByKey.get(key)

    if (!tab) {
      next.push(closingChromeVisualTab(visualTab))
      continue
    }

    consumedKeys.add(key)
    next.push(nextChromeVisualTab(visualTab, tab, areTabsEqual))
  }

  for (const tab of tabs) {
    const key = chromeVisualTabKey(tab)
    if (consumedKeys.has(key)) continue

    next.push({ phase: 'opening', tab })
  }

  return next
}

function presentChromeVisualTabsState<TTab extends ChromeVisualTabSource>(
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
  const sourceTabsChanged = !sameChromeVisualTabSources(state.sourceTabs, tabs, areTabsEqual)
  if (!sourceTabsChanged && state.visualTabs === visualTabs) return state

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
  if (visualTab.phase === 'closing') return visualTab

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

function cachedChromeVisualTabsState(cacheKey: string | undefined) {
  if (!cacheKey) return null

  return chromeVisualTabsStateCache.get(cacheKey) ?? null
}

function cacheChromeVisualTabsState<TTab extends ChromeVisualTabSource>(
  cacheKey: string | undefined,
  sourceTabs: readonly TTab[],
  visualTabs: readonly ChromeVisualTab<TTab>[],
) {
  if (!cacheKey) return

  chromeVisualTabsStateCache.set(cacheKey, {
    sourceTabs,
    visualTabs,
  } as ChromeVisualTabsState<ChromeVisualTabSource>)
}

function cachedChromeVisualTabsCanApply<TTab extends ChromeVisualTabSource>(
  visualTabs: readonly ChromeVisualTab<ChromeVisualTabSource>[],
  tabs: readonly TTab[],
) {
  if (visualTabs.length === 0) return false
  if (tabs.length === 0) return false

  const sourceKeys = new Set(tabs.map(chromeVisualTabKey))
  return visualTabs.some((visualTab) => sourceKeys.has(chromeVisualTabKey(visualTab.tab)))
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

function sameChromeVisualTabSources<TTab extends ChromeVisualTabSource>(
  left: readonly TTab[],
  right: readonly TTab[],
  areTabsEqual: ChromeVisualTabEquality<TTab>,
) {
  if (left.length !== right.length) return false

  return left.every((tab, index) => {
    const rightTab = right[index]
    if (!rightTab) return false

    return areTabsEqual(tab, rightTab)
  })
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
