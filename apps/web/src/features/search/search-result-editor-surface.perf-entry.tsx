import type { EditorKeymapLayer } from '@editor/core'
import { observeEditorMountTiming } from '@editor/core'
import type { WorkspaceSearchMatch } from '@workspace/contracts'
import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import '@workspace/ui/globals.css'

import { ThemeProvider } from '@/components/theme-provider'
import { WorkspaceFocusProvider } from '@/components/workspace/workspace-focus-provider'
import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme'
import type { WorkspaceSearchFileGroup } from '@/features/search/search-buffer-state'
import { SearchResultEditorSurface } from '@/features/search/search-result-editor-surface'
import {
  firstSearchResultExcerptId,
  firstSearchResultVirtualRowId,
  searchResultFileBlocks,
  searchResultVirtualRows,
} from '@/features/search/search-result-view-model'
import type { SearchResultId } from '@/features/search/search-result-items'

const SEARCH_QUERY = 'needle'
const TOTAL_RESULTS = 200
const FILE_COUNT = 10
const MATCHES_PER_FILE = TOTAL_RESULTS / FILE_COUNT
const STREAM_INITIAL_MATCHES_PER_FILE = 1
const STREAM_MATCH_BATCH_SIZE = 3
const STREAM_BATCH_DELAY_MS = 80
const PERF_START = performance.now()
const editorMountStats = {
  count: 0,
  totalMs: 0,
}
const nativeSelectionStats = installNativeSelectionPerfProbe()

observeEditorMountTiming((durationMs) => {
  editorMountStats.count += 1
  editorMountStats.totalMs += durationMs
})

type SearchPerfVariant = {
  readonly autoScroll: boolean
  readonly collapsed: boolean
  readonly replaceVisible: boolean
  readonly streaming: boolean
  readonly theme: 'dark' | 'light'
}

type SearchPerfMetrics = {
  readonly editorMountCount: number
  readonly initialRenderMs: number | null
  readonly longestFrameMs: number | null
  readonly longestTaskMs: number
  readonly nativeAddRangeCount: number
  readonly scrollFrames: number
  readonly scrollSampleMs: number | null
  readonly totalEditorMountMs: number
  readonly visibleEditorHosts: number
}

type NativeSelectionPerfStats = {
  addRangeCount: number
}

type SearchPerfSelectionWindow = Window & {
  __searchResultEditorSelectionProbe?: NativeSelectionPerfStats
}

const EMPTY_KEYMAP_LAYERS: readonly EditorKeymapLayer[] = []

export function SearchResultEditorSurfacePerfFixture() {
  const variant = useMemo(() => readSearchPerfVariant(), [])
  const fixtureRef = useRef<HTMLDivElement | null>(null)
  const longestTaskRef = useRef(0)
  const [streaming, setStreaming] = useState(variant.streaming)
  const [groups, setGroups] = useState(() =>
    createSearchPerfGroups(variant, searchPerfInitialMatchesPerFile(variant)),
  )
  const rows = useMemo(
    () => searchResultVirtualRows(searchResultFileBlocks(groups, SEARCH_QUERY)),
    [groups],
  )
  const [activeResultId, setActiveResultId] = useState<SearchResultId | null>(() =>
    firstVisibleSearchResultId(groups),
  )
  const [metrics, setMetrics] = useState<SearchPerfMetrics>(() => currentSearchPerfMetrics(null, 0))

  useEffect(() => applyPerfTheme(variant.theme), [variant.theme])

  useEffect(() => {
    if (!variant.streaming) return undefined

    return runSearchPerfStreamingSample((matchesPerFile) => {
      setGroups(createSearchPerfGroups(variant, matchesPerFile))
      setStreaming(matchesPerFile < MATCHES_PER_FILE)
    })
  }, [variant])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMetrics(currentSearchPerfMetrics(fixtureRef.current, longestTaskRef.current))
    })

    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    return observeLongTasks((durationMs) => {
      longestTaskRef.current = Math.max(longestTaskRef.current, durationMs)
      setMetrics(currentSearchPerfMetrics(fixtureRef.current, longestTaskRef.current))
    })
  }, [])

  useEffect(() => {
    if (!variant.autoScroll) return undefined

    return runSearchPerfScrollSample(fixtureRef.current, (sample) => {
      setMetrics({
        ...currentSearchPerfMetrics(fixtureRef.current, longestTaskRef.current),
        longestFrameMs: sample.longestFrameMs,
        scrollFrames: sample.frames,
        scrollSampleMs: sample.durationMs,
      })
    })
  }, [variant.autoScroll, rows.length])

  const handleToggleGroup = useCallback((path: string) => {
    setGroups((current) =>
      current.map((group) =>
        group.path === path ? { ...group, collapsed: !group.collapsed } : group,
      ),
    )
  }, [])

  return (
    <div
      className='bg-background text-foreground grid h-svh min-h-0 grid-rows-[auto_minmax(0,1fr)]'
      ref={fixtureRef}
    >
      <SearchPerfHeader metrics={metrics} variant={variant} />
      <SearchResultEditorSurface
        activeResultId={activeResultId}
        canReplace={variant.replaceVisible}
        displayedResultsQuery={SEARCH_QUERY}
        groups={groups}
        keymapLayers={EMPTY_KEYMAP_LAYERS}
        prewarmEditorPool={!streaming}
        replaceVisible={variant.replaceVisible}
        resultsQuery={SEARCH_QUERY}
        onOpenTarget={handleOpenTarget}
        onReplaceGroup={handleReplaceGroup}
        onReplaceMatch={handleReplaceMatch}
        onSelectResult={setActiveResultId}
        onToggleGroup={handleToggleGroup}
      />
    </div>
  )
}

export function SearchPerfHeader({
  metrics,
  variant,
}: {
  metrics: SearchPerfMetrics
  variant: SearchPerfVariant
}) {
  return (
    <div className='bg-muted/25 grid grid-cols-[1fr_auto] items-center gap-4 border-b px-3 py-2 text-xs'>
      <div className='min-w-0 truncate font-medium'>Search result editor perf fixture</div>
      <dl className='text-muted-foreground grid grid-cols-[repeat(9,auto)] gap-x-3 gap-y-1'>
        <PerfMetric label='variant' value={variantLabel(variant)} />
        <PerfMetric label='first paint' value={formatMs(metrics.initialRenderMs)} />
        <PerfMetric label='editors' value={String(metrics.editorMountCount)} />
        <PerfMetric label='mount total' value={formatMs(metrics.totalEditorMountMs)} />
        <PerfMetric label='visible hosts' value={String(metrics.visibleEditorHosts)} />
        <PerfMetric label='addRange' value={String(metrics.nativeAddRangeCount)} />
        <PerfMetric label='long task' value={formatMs(metrics.longestTaskMs)} />
        <PerfMetric label='scroll frames' value={String(metrics.scrollFrames)} />
        <PerfMetric label='longest frame' value={formatMs(metrics.longestFrameMs)} />
      </dl>
    </div>
  )
}

export function PerfMetric({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className='text-foreground font-mono tabular-nums'>{value}</dd>
    </>
  )
}

function readSearchPerfVariant(): SearchPerfVariant {
  const params = new URLSearchParams(window.location.search)

  return {
    autoScroll: params.get('scroll') !== '0',
    collapsed: params.get('collapsed') === '1',
    replaceVisible: params.get('replace') === 'visible',
    streaming: params.get('stream') === '1',
    theme: params.get('theme') === 'light' ? 'light' : 'dark',
  }
}

function createSearchPerfGroups(
  variant: SearchPerfVariant,
  matchesPerFile = MATCHES_PER_FILE,
): WorkspaceSearchFileGroup[] {
  return Array.from({ length: FILE_COUNT }, (_, fileIndex) => {
    const path = `/perf/project/src/module-${fileIndex}/search-fixture-${fileIndex}.tsx`
    const matches = Array.from({ length: matchesPerFile }, (_, matchIndex) =>
      createSearchPerfMatch(path, fileIndex, matchIndex),
    )

    return {
      collapsed: variant.collapsed && fileIndex % 3 === 0,
      count: matches.length,
      matches,
      name: `search-fixture-${fileIndex}.tsx`,
      path,
      pathLabel: path,
    }
  })
}

function searchPerfInitialMatchesPerFile(variant: SearchPerfVariant) {
  if (!variant.streaming) return MATCHES_PER_FILE

  return STREAM_INITIAL_MATCHES_PER_FILE
}

function createSearchPerfMatch(
  path: string,
  fileIndex: number,
  matchIndex: number,
): WorkspaceSearchMatch {
  const prefix = `const result${matchIndex} = computeSearchRow(${fileIndex}, `
  const suffix = `) // preview data ${matchIndex}`
  const preview = `${prefix}${SEARCH_QUERY}${suffix}`
  const startColumn = prefix.length + 1

  return {
    column: startColumn,
    endColumn: startColumn + SEARCH_QUERY.length,
    kind: 'content',
    line: matchIndex * 3 + 1,
    path,
    preview,
    previewStartColumn: 0,
    source: matchIndex % 7 === 0 ? 'open-buffer' : 'disk',
    type: 'file',
  }
}

function firstVisibleSearchResultId(
  groups: readonly WorkspaceSearchFileGroup[],
): SearchResultId | null {
  const rows = searchResultVirtualRows(searchResultFileBlocks(groups, SEARCH_QUERY))
  const firstRowId = firstSearchResultVirtualRowId(rows)
  if (!firstRowId) return null

  return firstSearchResultExcerptId(rows, firstRowId) ?? firstRowId
}

function currentSearchPerfMetrics(
  root: HTMLElement | null,
  longestTaskMs: number,
): SearchPerfMetrics {
  return {
    editorMountCount: editorMountStats.count,
    initialRenderMs: performance.now() - PERF_START,
    longestFrameMs: null,
    longestTaskMs,
    nativeAddRangeCount: nativeSelectionStats.addRangeCount,
    scrollFrames: 0,
    scrollSampleMs: null,
    totalEditorMountMs: editorMountStats.totalMs,
    visibleEditorHosts: root?.querySelectorAll('[role="treeitem"] .editor-virtualized').length ?? 0,
  }
}

function installNativeSelectionPerfProbe(): NativeSelectionPerfStats {
  const perfWindow = window as SearchPerfSelectionWindow
  if (perfWindow.__searchResultEditorSelectionProbe)
    return perfWindow.__searchResultEditorSelectionProbe

  const stats = { addRangeCount: 0 }
  const nativeAddRange = Selection.prototype.addRange
  Selection.prototype.addRange = function addRange(this: Selection, range: Range): void {
    stats.addRangeCount += 1
    nativeAddRange.call(this, range)
  }
  perfWindow.__searchResultEditorSelectionProbe = stats
  return stats
}

function observeLongTasks(onLongTask: (durationMs: number) => void) {
  if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    return undefined
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) onLongTask(entry.duration)
  })
  observer.observe({ type: 'longtask', buffered: true })

  return () => observer.disconnect()
}

function runSearchPerfScrollSample(
  root: HTMLElement | null,
  onDone: (sample: {
    readonly durationMs: number
    readonly frames: number
    readonly longestFrameMs: number
  }) => void,
) {
  const scroller = root?.querySelector<HTMLElement>('[role="tree"]')
  if (!scroller) return undefined

  const scrollerElement = scroller
  const start = performance.now()
  const durationMs = 1200
  let frame = 0
  let frames = 0
  let lastFrameAt = start
  let longestFrameMs = 0

  function step(now: number) {
    longestFrameMs = Math.max(longestFrameMs, now - lastFrameAt)
    lastFrameAt = now
    frames += 1

    const progress = Math.min(1, (now - start) / durationMs)
    const maxScrollTop = Math.max(0, scrollerElement.scrollHeight - scrollerElement.clientHeight)
    scrollerElement.scrollTop = progress * maxScrollTop

    if (progress < 1) {
      frame = window.requestAnimationFrame(step)
      return
    }

    onDone({ durationMs: now - start, frames, longestFrameMs })
  }

  frame = window.requestAnimationFrame(step)

  return () => window.cancelAnimationFrame(frame)
}

function runSearchPerfStreamingSample(onBatch: (matchesPerFile: number) => void) {
  let matchesPerFile = STREAM_INITIAL_MATCHES_PER_FILE
  const interval = globalThis.setInterval(() => {
    matchesPerFile = Math.min(MATCHES_PER_FILE, matchesPerFile + STREAM_MATCH_BATCH_SIZE)
    onBatch(matchesPerFile)

    if (matchesPerFile >= MATCHES_PER_FILE) {
      globalThis.clearInterval(interval)
    }
  }, STREAM_BATCH_DELAY_MS)

  return () => globalThis.clearInterval(interval)
}

function applyPerfTheme(theme: 'dark' | 'light') {
  document.documentElement.classList.remove('dark', 'light')
  document.documentElement.classList.add(theme)
}

function variantLabel(variant: SearchPerfVariant) {
  const replace = variant.replaceVisible ? 'replace' : 'hidden'
  const collapsed = variant.collapsed ? 'collapsed' : 'expanded'
  const stream = variant.streaming ? 'stream' : 'static'

  return `${replace}/${collapsed}/${stream}/${variant.theme}`
}

function formatMs(value: number | null) {
  if (value === null) return '-'

  return `${value.toFixed(1)}ms`
}

function handleOpenTarget() {
  return undefined
}

function handleReplaceGroup() {
  return undefined
}

function handleReplaceMatch() {
  return undefined
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider defaultTheme='dark' storageKey='search-result-perf-theme'>
    <EditorColorThemeProvider>
      <WorkspaceFocusProvider>
        <SearchResultEditorSurfacePerfFixture />
      </WorkspaceFocusProvider>
    </EditorColorThemeProvider>
  </ThemeProvider>,
)
