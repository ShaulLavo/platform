type EditorPerformanceDiagnostic = {
  readonly name: string
  readonly durationMs?: number
  readonly detail?: Readonly<Record<string, unknown>>
}

type EditorPerformanceDiagnosticSink = {
  enabled: boolean
  record(diagnostic: EditorPerformanceDiagnostic): void
}

type EditorPerformanceTraceEvent =
  | {
      readonly kind: 'diagnostic'
      readonly at: number
      readonly diagnostic: EditorPerformanceDiagnostic
    }
  | {
      readonly kind: 'long-task'
      readonly at: number
      readonly durationMs: number
      readonly name: string
    }

type EditorPerformanceTraceReport = {
  readonly durationMs: number
  readonly disabledFeatures: readonly string[]
  readonly dom: Readonly<Record<string, number>>
  readonly events: Readonly<Record<string, number>>
  readonly frameStats: Readonly<Record<string, number>>
  readonly topDiagnostics: readonly EditorPerformanceTraceSummary[]
  readonly topTargets: readonly EditorPerformanceTraceTargetSummary[]
  readonly traceEvents: readonly EditorPerformanceTraceEvent[]
  readonly url: string
  readonly userAgent: string
}

type EditorPerformanceTraceSummary = {
  readonly count: number
  readonly maxMs: number
  readonly meanMs: number
  readonly name: string
  readonly totalMs: number
}

type EditorPerformanceTraceTargetSummary = {
  readonly count: number
  readonly target: string
  readonly type: string
}

type EditorPerformanceTraceHandle = {
  download(): EditorPerformanceTraceReport
  mark(name: string, detail?: Readonly<Record<string, unknown>>): void
  print(): EditorPerformanceTraceReport
  report(): EditorPerformanceTraceReport
  reset(): void
  stop(): void
}

type EditorPerformanceTraceGlobal = typeof globalThis & {
  __EDITOR_PERFORMANCE_DIAGNOSTICS__?: EditorPerformanceDiagnosticSink | null
  __editorPerfTrace?: EditorPerformanceTraceHandle
}

const TRACE_PARAM = 'editorPerfTrace'
const DISABLE_PARAM = 'editorPerfDisable'
const SLOW_FRAME_MS = 16.7
const LONG_FRAME_MS = 50
const MAX_TRACE_EVENTS = 5000

let disabledFeatureSet: ReadonlySet<string> | null = null

export function installEditorPerformanceTraceFromUrl(): void {
  if (typeof window === 'undefined') return

  installDisabledFeatureStyles(editorPerformanceDisabledFeatures())
  if (!editorPerformanceTraceEnabled(window.location.search)) return

  const trace = createEditorPerformanceTrace(window)
  editorPerformanceTraceGlobal().__EDITOR_PERFORMANCE_DIAGNOSTICS__ = trace.sink
  editorPerformanceTraceGlobal().__editorPerfTrace = trace.handle

  console.info(
    '[editor-perf] trace enabled. Use window.__editorPerfTrace.print() or .download() after scrolling.',
  )
}

export function editorPerformanceFeatureDisabled(feature: string): boolean {
  return editorPerformanceDisabledFeatures().has(feature)
}

function createEditorPerformanceTrace(view: Window): {
  readonly handle: EditorPerformanceTraceHandle
  readonly sink: EditorPerformanceDiagnosticSink
} {
  let stopped = false
  let frame = 0
  let lastFrameTime = view.performance.now()
  let traceEvents: EditorPerformanceTraceEvent[] = []
  let frameDurations: number[] = []
  let startedAt = view.performance.now()
  const eventCounts = new Map<string, number>()
  const targetCounts = new Map<string, number>()
  const observer = createLongTaskObserver(view, (event) => {
    traceEvents = boundedAppend(traceEvents, event)
  })

  const sink: EditorPerformanceDiagnosticSink = {
    enabled: true,
    record: (diagnostic) => {
      if (stopped) return

      traceEvents = boundedAppend(traceEvents, {
        at: view.performance.now(),
        diagnostic,
        kind: 'diagnostic',
      })
    },
  }

  const recordInputEvent = (event: Event) => {
    if (stopped) return

    increment(eventCounts, event.type)
    increment(targetCounts, `${event.type}:${targetLabel(event.target)}`)
  }

  view.addEventListener('scroll', recordInputEvent, { capture: true, passive: true })
  view.addEventListener('wheel', recordInputEvent, { capture: true, passive: true })

  const tick = (now: number) => {
    if (stopped) return

    const duration = now - lastFrameTime
    lastFrameTime = now
    frameDurations.push(duration)
    frame = view.requestAnimationFrame(tick)
  }
  frame = view.requestAnimationFrame(tick)

  const handle: EditorPerformanceTraceHandle = {
    download: () => {
      const report = createReport()
      downloadJson(view, report)
      return report
    },
    mark: (name, detail) => {
      sink.record({ detail, name })
    },
    print: () => {
      const report = createReport()
      console.table(report.topDiagnostics)
      console.table(report.topTargets)
      console.info('[editor-perf] report', report)
      return report
    },
    report: () => createReport(),
    reset: () => {
      traceEvents = []
      frameDurations = []
      eventCounts.clear()
      targetCounts.clear()
      startedAt = view.performance.now()
      lastFrameTime = startedAt
    },
    stop: () => {
      if (stopped) return

      stopped = true
      sink.enabled = false
      view.cancelAnimationFrame(frame)
      view.removeEventListener('scroll', recordInputEvent, { capture: true })
      view.removeEventListener('wheel', recordInputEvent, { capture: true })
      observer?.disconnect()
    },
  }

  function createReport(): EditorPerformanceTraceReport {
    return {
      disabledFeatures: Array.from(editorPerformanceDisabledFeatures()),
      dom: domSnapshot(view.document),
      durationMs: view.performance.now() - startedAt,
      events: Object.fromEntries(eventCounts),
      frameStats: frameStats(frameDurations),
      topDiagnostics: summarizeDiagnostics(traceEvents),
      topTargets: summarizeTargets(targetCounts),
      traceEvents,
      url: view.location.href,
      userAgent: view.navigator.userAgent,
    }
  }

  return { handle, sink }
}

function createLongTaskObserver(
  view: Window,
  record: (event: EditorPerformanceTraceEvent) => void,
): PerformanceObserver | null {
  if (!('PerformanceObserver' in view)) return null

  try {
    const observer = new view.PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        record({
          at: entry.startTime,
          durationMs: entry.duration,
          kind: 'long-task',
          name: entry.name,
        })
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
    return observer
  } catch {
    return null
  }
}

function summarizeDiagnostics(
  events: readonly EditorPerformanceTraceEvent[],
): readonly EditorPerformanceTraceSummary[] {
  const summaries = new Map<string, { count: number; maxMs: number; totalMs: number }>()
  for (const event of events) {
    if (event.kind !== 'diagnostic') continue

    const durationMs = event.diagnostic.durationMs ?? 0
    const current = summaries.get(event.diagnostic.name) ?? {
      count: 0,
      maxMs: 0,
      totalMs: 0,
    }
    current.count += 1
    current.maxMs = Math.max(current.maxMs, durationMs)
    current.totalMs += durationMs
    summaries.set(event.diagnostic.name, current)
  }

  return Array.from(summaries, ([name, summary]) => ({
    count: summary.count,
    maxMs: round(summary.maxMs),
    meanMs: round(summary.totalMs / Math.max(1, summary.count)),
    name,
    totalMs: round(summary.totalMs),
  })).sort((left, right) => right.totalMs - left.totalMs)
}

function summarizeTargets(
  targetCounts: ReadonlyMap<string, number>,
): readonly EditorPerformanceTraceTargetSummary[] {
  return Array.from(targetCounts, ([key, count]) => {
    const separator = key.indexOf(':')
    return {
      count,
      target: key.slice(separator + 1),
      type: key.slice(0, separator),
    }
  })
    .sort((left, right) => right.count - left.count)
    .slice(0, 20)
}

function frameStats(durations: readonly number[]): Readonly<Record<string, number>> {
  if (durations.length === 0) {
    return {
      count: 0,
      longFrames: 0,
      maxMs: 0,
      meanMs: 0,
      slowFrames: 0,
    }
  }

  const total = durations.reduce((sum, duration) => sum + duration, 0)
  return {
    count: durations.length,
    longFrames: durations.filter((duration) => duration >= LONG_FRAME_MS).length,
    maxMs: round(Math.max(...durations)),
    meanMs: round(total / durations.length),
    slowFrames: durations.filter((duration) => duration >= SLOW_FRAME_MS).length,
  }
}

function domSnapshot(document: Document): Readonly<Record<string, number>> {
  return {
    editorRows: document.querySelectorAll('.editor-virtualized-row').length,
    editorScrollers: document.querySelectorAll('.editor-virtualized').length,
    minimapCanvases: document.querySelectorAll('.editor-minimap-canvas').length,
    minimaps: document.querySelectorAll('.editor-minimap').length,
    scopeLines: document.querySelectorAll('.editor-scope-line').length,
  }
}

function targetLabel(target: EventTarget | null): string {
  if (!(target instanceof Element)) return 'unknown'

  const classes = Array.from(target.classList).slice(0, 3).join('.')
  if (target.id) return `${target.tagName.toLowerCase()}#${target.id}`
  if (classes) return `${target.tagName.toLowerCase()}.${classes}`
  return target.tagName.toLowerCase()
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function boundedAppend<T>(items: readonly T[], item: T): T[] {
  if (items.length < MAX_TRACE_EVENTS) return [...items, item]
  return items.slice(1).concat(item)
}

function downloadJson(view: Window, report: EditorPerformanceTraceReport): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const link = view.document.createElement('a')
  link.download = `editor-perf-trace-${Date.now()}.json`
  link.href = view.URL.createObjectURL(blob)
  link.click()
  view.URL.revokeObjectURL(link.href)
}

function installDisabledFeatureStyles(features: ReadonlySet<string>): void {
  if (typeof document === 'undefined') return
  if (features.size === 0) return

  document.documentElement.dataset.editorPerfDisable = Array.from(features).join(' ')
  if (document.getElementById('editor-performance-trace-styles')) return

  const style = document.createElement('style')
  style.id = 'editor-performance-trace-styles'
  style.textContent = [
    "[data-editor-perf-disable~='caret'] .editor-virtualized-caret-layer { animation: none !important; }",
    [
      "[data-editor-perf-disable~='text'] .editor-virtualized-row",
      "[data-editor-perf-disable~='text'] .editor-virtualized-fold-placeholder",
      "[data-editor-perf-disable~='text'] .editor-virtualized-hidden-character-marker",
    ].join(', ') + ' { color: transparent !important; }',
  ].join('\n')
  document.head.appendChild(style)
}

function editorPerformanceTraceEnabled(search: string): boolean {
  const value = new URLSearchParams(search).get(TRACE_PARAM)
  if (value === null) return false
  if (value === '') return true
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function editorPerformanceDisabledFeatures(): ReadonlySet<string> {
  if (disabledFeatureSet) return disabledFeatureSet
  if (typeof window === 'undefined') {
    disabledFeatureSet = new Set()
    return disabledFeatureSet
  }

  const params = new URLSearchParams(window.location.search)
  disabledFeatureSet = new Set(
    params
      .getAll(DISABLE_PARAM)
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean),
  )
  return disabledFeatureSet
}

function editorPerformanceTraceGlobal(): EditorPerformanceTraceGlobal {
  return globalThis as EditorPerformanceTraceGlobal
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
