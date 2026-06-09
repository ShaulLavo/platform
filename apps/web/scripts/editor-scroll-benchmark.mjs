import { chromium, firefox, webkit } from 'playwright'
import { statSync } from 'node:fs'
import { basename, relative, resolve, sep } from 'node:path'
import { createBenchmarkError } from './structured-errors.mjs'

const browserTypes = { chromium, firefox, webkit }
const cacheKey = 'platform.workspace-state.v1'
const defaultAppUrl = 'http://localhost:5173/'
const defaultServerUrl = process.env.VITE_SERVER_URL ?? 'http://localhost:3001'
const defaultFilePath = 'apps/web/src/features/editor/components/editor.tsx'
const defaultRootPath = resolve(process.cwd(), '../..')
const options = parseOptions(process.argv.slice(2))

const gateThresholds = {
  chromium: {
    maxCssHighlightRanges: 270,
    maxMedianFrameMeanMs: 25,
    maxMeanRangesCount: 12,
    maxMeanRangesTotalMs: 15,
    maxMeanSegmentsCount: 12,
    maxMeanSegmentsTotalMs: 8,
  },
  firefox: {
    maxCssHighlightRanges: 270,
    maxBestFrameMeanMs: 30,
    maxMeanRangesCount: 12,
    maxMeanSegmentsCount: 12,
  },
  webkit: {
    maxCssHighlightRanges: 270,
    maxBestFrameMeanMs: 60,
    maxMeanRangesCount: 12,
    maxMeanRangesTotalMs: 20,
    maxMeanSegmentsCount: 12,
  },
}

const browserNames = options.browsers.length > 0 ? options.browsers : defaultBrowsers(options.gate)
const workspace = await createWorkspaceContext()
const results = {}

for (const browserName of browserNames) {
  results[browserName] = await runBrowserSamples(browserName, workspace)
}

console.log(`EDITOR_SCROLL_BENCHMARK_SUMMARY ${JSON.stringify(results, null, 2)}`)

if (options.gate) {
  const failures = gateFailures(results)
  if (failures.length > 0) {
    console.error(`EDITOR_SCROLL_BENCHMARK_GATE_FAILED ${JSON.stringify(failures, null, 2)}`)
    process.exit(1)
  }

  console.log('EDITOR_SCROLL_BENCHMARK_GATE_PASSED')
}

function parseOptions(args) {
  const parsed = {
    appUrl: process.env.EDITOR_SCROLL_BENCH_APP_URL ?? defaultAppUrl,
    browsers: [],
    filePath: process.env.EDITOR_SCROLL_BENCH_FILE ?? defaultFilePath,
    gate: false,
    serverUrl: process.env.EDITOR_SCROLL_BENCH_SERVER_URL ?? defaultServerUrl,
    stepPx: numberOption(process.env.EDITOR_SCROLL_BENCH_STEP_PX, 36),
    steps: numberOption(process.env.EDITOR_SCROLL_BENCH_STEPS, 80),
    trials: numberOption(process.env.EDITOR_SCROLL_BENCH_TRIALS, 3),
    workspaceRoot: process.env.EDITOR_SCROLL_BENCH_ROOT ?? defaultRootPath,
  }

  for (const arg of args) {
    applyOption(parsed, arg)
  }

  return parsed
}

function applyOption(parsed, arg) {
  if (arg === '--gate') {
    parsed.gate = true
    return
  }

  const [name, value] = arg.split('=')
  if (name === '--app-url') parsed.appUrl = value ?? parsed.appUrl
  if (name === '--browsers') parsed.browsers = browserList(value)
  if (name === '--file') parsed.filePath = value ?? parsed.filePath
  if (name === '--server-url') parsed.serverUrl = value ?? parsed.serverUrl
  if (name === '--step-px') parsed.stepPx = numberOption(value, parsed.stepPx)
  if (name === '--steps') parsed.steps = numberOption(value, parsed.steps)
  if (name === '--trials') parsed.trials = numberOption(value, parsed.trials)
  if (name === '--workspace-root') parsed.workspaceRoot = value ?? parsed.workspaceRoot
}

function browserList(value) {
  if (!value) return []

  return value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name in browserTypes)
}

function numberOption(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback

  return Math.floor(parsed)
}

function defaultBrowsers(gate) {
  if (gate) return ['chromium']

  return ['chromium', 'webkit', 'firefox']
}

async function createWorkspaceContext() {
  const health = await fetchServerHealth()
  const absoluteRootPath = resolve(options.workspaceRoot)
  const absoluteFilePath = resolve(absoluteRootPath, options.filePath)
  const rootPath = clientPathForAbsolutePath(absoluteRootPath, health.workspaceRoot)
  const filePath = clientPathForAbsolutePath(absoluteFilePath, health.workspaceRoot)
  const rootStat = statSync(absoluteRootPath)

  return {
    absoluteRootPath,
    filePath,
    rootFolder: {
      birthtimeMs: rootStat.birthtimeMs,
      mtimeMs: rootStat.mtimeMs,
      name: basename(absoluteRootPath),
      path: rootPath,
      size: rootStat.size,
      type: 'directory',
      version: '',
    },
  }
}

async function fetchServerHealth() {
  const response = await fetch(new URL('/health', options.serverUrl), {
    headers: { Origin: new URL(options.appUrl).origin },
  })
  if (!response.ok) throw createBenchmarkError(`Server health failed: ${response.status}`)

  return response.json()
}

function clientPathForAbsolutePath(absolutePath, workspaceRoot) {
  const absoluteWorkspaceRoot = resolve(workspaceRoot)
  if (absoluteWorkspaceRoot === sep) return stripLeadingSlash(absolutePath)

  return relative(absoluteWorkspaceRoot, absolutePath).split(sep).join('/')
}

function stripLeadingSlash(path) {
  return path.startsWith(sep) ? path.slice(1) : path
}

async function runBrowserSamples(browserName, workspace) {
  const samples = []
  for (let trial = 1; trial <= options.trials; trial += 1) {
    const sample = await runTrial(browserName, trial, workspace)
    samples.push(sample)
    console.log(JSON.stringify({ type: 'editor-scroll-benchmark-trial', ...sample }))
  }

  return summarizeSamples(samples)
}

async function runTrial(browserName, trial, workspace) {
  const browser = await browserTypes[browserName].launch({ headless: true })
  try {
    return await runTrialInBrowser(browser, browserName, trial, workspace)
  } finally {
    await browser.close().catch(() => {})
  }
}

async function runTrialInBrowser(browser, browserName, trial, workspace) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(
    (payload) => {
      window.localStorage.setItem(payload.cacheKey, JSON.stringify(payload.cache))
    },
    {
      cache: workspaceCache(workspace),
      cacheKey,
    },
  )

  const page = await context.newPage()
  page.setDefaultTimeout(25_000)
  await page.goto(traceUrl(), { waitUntil: 'domcontentloaded' })
  await waitForHighlightedEditor(page)
  const report = await runScrollSample(page)
  return trialSample(browserName, trial, report)
}

function workspaceCache(workspace) {
  return {
    diffViewMode: 'split',
    editorHistory: [workspace.filePath],
    editorPaneLayout: {
      activePaneId: 'pane-bench',
      root: {
        activeTabId: 'tab-bench',
        id: 'pane-bench',
        kind: 'leaf',
        tabs: [{ id: 'tab-bench', path: workspace.filePath }],
      },
    },
    gitPanelOpen: true,
    recentlyClosedEditorPaths: [],
    rootFolder: workspace.rootFolder,
    searchBuffer: null,
    sidebarVisible: true,
    version: 7,
    workspacePanelTab: 'files',
  }
}

function traceUrl() {
  const url = new URL(options.appUrl)
  url.searchParams.set('editorPerfTrace', '1')
  return String(url)
}

async function waitForHighlightedEditor(page) {
  await page.waitForSelector('.editor-virtualized-row')
  await page.waitForFunction(() => Boolean(window.__editorPerfTrace))
  await page.waitForFunction(() => {
    const registry = window.CSS?.highlights
    if (!registry) return false

    let ranges = 0
    for (const [, highlight] of registry) ranges += highlight.size
    return ranges >= 200
  })
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve())
  await page.evaluate(
    async () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve)
        }),
      ),
  )
}

async function runScrollSample(page) {
  const report = await page.evaluate(
    async ({ stepPx, steps }) => {
      const scroller = document.querySelector('.editor-virtualized')
      if (!scroller) return { error: 'Missing .editor-virtualized' }

      scroller.scrollTop = 0
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      window.__editorPerfTrace.reset()
      for (let index = 0; index < steps; index += 1) {
        scroller.scrollTop += stepPx
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }

      await new Promise((resolve) => setTimeout(resolve, 250))
      return window.__editorPerfTrace.report()
    },
    {
      stepPx: options.stepPx,
      steps: options.steps,
    },
  )
  if (report?.error) throw createBenchmarkError(report.error)

  return report
}

function trialSample(browserName, trial, report) {
  const ranges = diagnostic(report, 'editor.tokenHighlights.ranges')
  const segments = diagnostic(report, 'editor.tokenHighlights.segments')
  return {
    browserName,
    trial,
    cssHighlightRanges: report.dom.cssHighlightRanges,
    editorRows: report.dom.editorRows,
    frameMaxMs: report.frameStats.maxMs,
    frameMeanMs: report.frameStats.meanMs,
    longFrames: report.frameStats.longFrames,
    rangesCount: ranges.count,
    rangesTotalMs: ranges.totalMs,
    segmentsCount: segments.count,
    segmentsTotalMs: segments.totalMs,
    slowFrames: report.frameStats.slowFrames,
  }
}

function diagnostic(report, name) {
  return (
    report.topDiagnostics.find((item) => item.name === name) ?? {
      count: 0,
      maxMs: 0,
      meanMs: 0,
      totalMs: 0,
    }
  )
}

function summarizeSamples(samples) {
  return {
    trials: samples.length,
    bestFrameMeanMs: minimum(samples.map((sample) => sample.frameMeanMs)),
    cssHighlightRanges: samples.at(-1)?.cssHighlightRanges ?? 0,
    editorRows: samples.at(-1)?.editorRows ?? 0,
    meanFrameMaxMs: average(samples.map((sample) => sample.frameMaxMs)),
    meanFrameMeanMs: average(samples.map((sample) => sample.frameMeanMs)),
    meanLongFrames: average(samples.map((sample) => sample.longFrames)),
    meanRangesCount: average(samples.map((sample) => sample.rangesCount)),
    meanRangesTotalMs: average(samples.map((sample) => sample.rangesTotalMs)),
    meanSegmentsCount: average(samples.map((sample) => sample.segmentsCount)),
    meanSegmentsTotalMs: average(samples.map((sample) => sample.segmentsTotalMs)),
    meanSlowFrames: average(samples.map((sample) => sample.slowFrames)),
    medianFrameMeanMs: median(samples.map((sample) => sample.frameMeanMs)),
    samples,
  }
}

function average(values) {
  return round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length))
}

function minimum(values) {
  if (values.length === 0) return 0

  return round(Math.min(...values))
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const midpoint = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return round(sorted[midpoint])

  return average([sorted[midpoint - 1], sorted[midpoint]])
}

function round(value) {
  return Math.round(value * 100) / 100
}

function gateFailures(results) {
  return Object.entries(results).flatMap(([browserName, summary]) => {
    const thresholds = gateThresholds[browserName]
    if (!thresholds) return []

    return thresholdFailures(browserName, summary, thresholds)
  })
}

function thresholdFailures(browserName, summary, thresholds) {
  return Object.entries(thresholds).flatMap(([key, threshold]) => {
    const metric = metricForThreshold(summary, key)
    if (metric <= threshold) return []

    return [{ browserName, key, metric, threshold }]
  })
}

function metricForThreshold(summary, key) {
  const metricName = key.replace(/^max/, '')
  return summary[lowercaseFirst(metricName)] ?? Number.POSITIVE_INFINITY
}

function lowercaseFirst(value) {
  return value.charAt(0).toLowerCase() + value.slice(1)
}
