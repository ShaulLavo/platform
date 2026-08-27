import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  browserTypes,
  createWorkspaceContext,
  launchOptions,
  numberOption,
  percentile,
  round,
  traceUrl,
} from './bench-workspace.mjs'
import { createBenchmarkError } from './structured-errors.mjs'

const defaultAppUrl = 'http://localhost:5173/'
const defaultServerUrl = process.env.VITE_SERVER_URL ?? 'http://localhost:3001'
const defaultFilePath = 'apps/web/src/features/editor/components/editor.tsx'
const defaultRootPath = resolve(process.cwd(), '../..')
const options = parseOptions(process.argv.slice(2))
const workspace = await createWorkspaceContext(options)
const cachePrefix = currentWorkspaceCachePrefix()
const snapshotKey = `${cachePrefix}.editorVisibleSnapshot`
const browser = await browserTypes.chromium.launch(launchOptions('chromium'))

try {
  const calibration = await captureCalibrationSnapshot(browser, workspace)
  const warmupModes = randomizedModes(options.warmupsPerMode, options.seed ^ 0x0600)
  for (let index = 0; index < warmupModes.length; index += 1) {
    await runSample(browser, workspace, calibration.serialized, warmupModes[index], index, true)
  }

  const modes = randomizedModes(options.samplesPerMode, options.seed)
  const samples = []
  for (let index = 0; index < modes.length; index += 1) {
    const sample = await runSample(
      browser,
      workspace,
      calibration.serialized,
      modes[index],
      index,
      false,
    )
    samples.push(sample)
    console.log(JSON.stringify({ type: 'editor-open-benchmark-sample', ...sample }))
  }

  const summary = summarize(samples, calibration)
  console.log(`EDITOR_OPEN_BENCHMARK_SUMMARY ${JSON.stringify(summary, null, 2)}`)
} finally {
  await browser.close().catch(() => {})
}

function parseOptions(args) {
  const parsed = {
    appUrl: process.env.EDITOR_OPEN_BENCH_APP_URL ?? defaultAppUrl,
    filePath: process.env.EDITOR_OPEN_BENCH_FILE ?? defaultFilePath,
    pageTimeoutMs: numberOption(process.env.EDITOR_OPEN_BENCH_PAGE_TIMEOUT_MS, 30_000),
    samplesPerMode: numberOption(process.env.EDITOR_OPEN_BENCH_SAMPLES, 30),
    seed: numberOption(process.env.EDITOR_OPEN_BENCH_SEED, 60_061),
    serverUrl: process.env.EDITOR_OPEN_BENCH_SERVER_URL ?? defaultServerUrl,
    warmupsPerMode: numberOption(process.env.EDITOR_OPEN_BENCH_WARMUPS, 5),
    workspaceRoot: process.env.EDITOR_OPEN_BENCH_ROOT ?? defaultRootPath,
  }

  for (const arg of args) applyOption(parsed, arg)
  if (parsed.warmupsPerMode < 5) {
    throw createBenchmarkError('editor-open benchmark requires at least five warmups per mode')
  }
  return parsed
}

function applyOption(parsed, arg) {
  const [name, value] = arg.split('=')
  if (name === '--app-url') parsed.appUrl = value ?? parsed.appUrl
  if (name === '--file') parsed.filePath = value ?? parsed.filePath
  if (name === '--page-timeout-ms') parsed.pageTimeoutMs = numberOption(value, parsed.pageTimeoutMs)
  if (name === '--samples') parsed.samplesPerMode = numberOption(value, parsed.samplesPerMode)
  if (name === '--seed') parsed.seed = numberOption(value, parsed.seed)
  if (name === '--server-url') parsed.serverUrl = value ?? parsed.serverUrl
  if (name === '--warmups') parsed.warmupsPerMode = numberOption(value, parsed.warmupsPerMode)
  if (name === '--workspace-root') parsed.workspaceRoot = value ?? parsed.workspaceRoot
}

async function captureCalibrationSnapshot(browser, workspace) {
  const context = await isolatedContext(browser, workspace, null)
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(options.pageTimeoutMs)
    await page.goto(traceUrl(options.appUrl), { waitUntil: 'domcontentloaded' })
    try {
      await waitForAuthoritativePaint(page)
    } catch (error) {
      const debug = await paintDebugSnapshot(page)
      throw createBenchmarkError(
        `calibration paint timeout: ${JSON.stringify(debug)}; ${String(error)}`,
      )
    }
    await page.waitForFunction((key) => typeof localStorage.getItem(key) === 'string', snapshotKey)
    const calibration = await page.evaluate((key) => {
      const serialized = localStorage.getItem(key)
      if (!serialized) return null

      const record = JSON.parse(serialized)
      const report = window.__editorPerfTrace?.report()
      return {
        capture: diagnosticEvent(report, 'editor.visible_snapshot.capture'),
        materialize: diagnosticEvent(report, 'editor.visible_snapshot.materialize'),
        record,
        serialized,
      }

      function diagnosticEvent(report, name) {
        return [...(report?.traceEvents ?? [])]
          .reverse()
          .find((event) => event.kind === 'diagnostic' && event.diagnostic.name === name)
          ?.diagnostic
      }
    }, snapshotKey)
    if (!calibration) throw createBenchmarkError('calibration did not persist a visible snapshot')
    return calibration
  } finally {
    await context.close().catch(() => {})
  }
}

async function runSample(browser, workspace, serializedSnapshot, mode, order, warmup) {
  const context = await isolatedContext(
    browser,
    workspace,
    mode === 'seeded' ? serializedSnapshot : null,
  )
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(options.pageTimeoutMs)
    await page.goto(traceUrl(options.appUrl), { waitUntil: 'domcontentloaded' })
    await waitForAuthoritativePaint(page)
    if (mode === 'seeded') {
      await page.waitForFunction(
        () => performance.getEntriesByName('editor.cached_visible_paint').length === 1,
      )
    }
    await page.waitForTimeout(425)
    const measured = await page.evaluate((referenceSnapshot) => {
      const report = window.__editorPerfTrace?.report()
      const cached = mark('editor.cached_visible_paint')
      const text = mark('editor.authoritative_text_paint')
      const highlight = mark('editor.authoritative_highlight_paint')
      const capture = diagnostic('editor.visible_snapshot.capture')
      const materialize = diagnostic('editor.visible_snapshot.materialize')
      const render = diagnostic('editor.visible_snapshot.render')
      const json = jsonCosts(referenceSnapshot, 25)
      const longTasks = (report?.traceEvents ?? []).filter((event) => event.kind === 'long-task')

      return {
        authoritativeHighlightCount: performance.getEntriesByName(
          'editor.authoritative_highlight_paint',
        ).length,
        authoritativeHighlightMs: highlight?.startTime ?? null,
        authoritativeTextCount: performance.getEntriesByName('editor.authoritative_text_paint')
          .length,
        authoritativeTextMs: text?.startTime ?? null,
        cachedFrameCount: performance.getEntriesByName('editor.cached_visible_paint').length,
        cachedFrameMs: cached?.startTime ?? null,
        captureDurationMs: capture?.durationMs ?? null,
        chunks: capture?.detail?.chunks ?? null,
        encodeMs: json.encodeMs,
        longTaskCount: longTasks.length,
        longTaskMaxMs: Math.max(0, ...longTasks.map((event) => event.durationMs)),
        longTaskTotalMs: longTasks.reduce((sum, event) => sum + event.durationMs, 0),
        materializeMs: materialize?.durationMs ?? null,
        parseMs: json.parseMs,
        parts: capture?.detail?.parts ?? null,
        renderMs: render?.durationMs ?? null,
        rows: capture?.detail?.rows ?? null,
        runs: capture?.detail?.runs ?? null,
        serializedBytes: capture?.detail?.serializedBytes ?? referenceSnapshot.length * 2,
      }

      function mark(name) {
        return performance.getEntriesByName(name, 'mark')[0] ?? null
      }

      function diagnostic(name) {
        return [...(report?.traceEvents ?? [])]
          .reverse()
          .find((event) => event.kind === 'diagnostic' && event.diagnostic.name === name)
          ?.diagnostic
      }

      function jsonCosts(serialized, iterations) {
        let parsed
        const parseStartedAt = performance.now()
        for (let index = 0; index < iterations; index += 1) parsed = JSON.parse(serialized)
        const parseMs = (performance.now() - parseStartedAt) / iterations
        const encodeStartedAt = performance.now()
        for (let index = 0; index < iterations; index += 1) JSON.stringify(parsed)
        const encodeMs = (performance.now() - encodeStartedAt) / iterations
        return { encodeMs, parseMs }
      }
    }, serializedSnapshot)
    validateSample(mode, measured)
    return { mode, order, warmup, ...roundSample(measured) }
  } finally {
    await context.close().catch(() => {})
  }
}

async function isolatedContext(browser, workspace, serializedSnapshot) {
  const context = await browser.newContext({
    colorScheme: 'dark',
    viewport: { height: 900, width: 1440 },
  })
  await context.addInitScript(
    ({ entries, snapshotKey: key, snapshot }) => {
      localStorage.clear()
      for (const [entryKey, value] of Object.entries(entries)) {
        localStorage.setItem(entryKey, JSON.stringify(value))
      }
      if (snapshot) localStorage.setItem(key, snapshot)
    },
    {
      entries: workspaceCacheEntries(workspace),
      snapshot: serializedSnapshot,
      snapshotKey,
    },
  )
  return context
}

function workspaceCacheEntries(workspace) {
  const rootPath = workspace.rootFolder.path
  return {
    [`${cachePrefix}.rootFolder`]: workspace.rootFolder,
    [`${cachePrefix}.uiMode`]: 'workbench',
    [`${cachePrefix}.workbenchLayout`]: {
      mainLayout: { bottom: 30, editor: 70 },
      outerLayout: { main: 76, sidebar: 24 },
    },
    [`${cachePrefix}.workspaces`]: [rootPath],
    [`${cachePrefix}.workspace:${rootPath}`]: {
      editorHistory: [workspace.filePath],
      recentlyClosedEditorPaths: [],
      scrollPositionByPath: {},
      workbenchPanels: {
        activeBottomTab: 'terminal',
        activeEditorTabId: 'editor-open-benchmark-tab',
        activeSidebarTab: 'files',
        bottomPanelOpen: false,
        editorTabs: [{ id: 'editor-open-benchmark-tab', path: workspace.filePath }],
        sidebarOpen: true,
      },
    },
  }
}

async function waitForAuthoritativePaint(page) {
  await page.waitForFunction(
    () =>
      performance.getEntriesByName('editor.authoritative_text_paint').length === 1 &&
      performance.getEntriesByName('editor.authoritative_highlight_paint').length === 1,
  )
}

function paintDebugSnapshot(page) {
  return page.evaluate(() => ({
    bodyText: document.body.innerText.slice(0, 1_000),
    marks: performance.getEntriesByType('mark').map((entry) => ({
      detail: entry.detail,
      name: entry.name,
      startTime: entry.startTime,
    })),
    rows: document.querySelectorAll('.editor-virtualized-row').length,
    storageKeys: Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)),
    traceEvents:
      window.__editorPerfTrace
        ?.report()
        .traceEvents.filter((event) => event.kind === 'diagnostic')
        .map((event) => event.diagnostic.name) ?? [],
  }))
}

function validateSample(mode, sample) {
  if (sample.authoritativeTextCount !== 1 || sample.authoritativeHighlightCount !== 1) {
    throw createBenchmarkError(`${mode} sample did not emit one authoritative paint per phase`)
  }
  if (mode === 'seeded' && sample.cachedFrameCount !== 1) {
    throw createBenchmarkError('seeded sample did not paint exactly one cached frame')
  }
  if (mode === 'unseeded' && sample.cachedFrameCount !== 0) {
    throw createBenchmarkError('unseeded sample painted a cached frame')
  }
  if (
    mode === 'seeded' &&
    sample.cachedFrameMs !== null &&
    sample.authoritativeHighlightMs !== null &&
    sample.cachedFrameMs > sample.authoritativeHighlightMs
  ) {
    throw createBenchmarkError('cached frame landed after authoritative highlight paint')
  }
}

function randomizedModes(samplesPerMode, seed) {
  const modes = Array.from({ length: samplesPerMode }, () => ['seeded', 'unseeded']).flat()
  const random = seededRandom(seed)
  for (let index = modes.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    const value = modes[index]
    modes[index] = modes[target]
    modes[target] = value
  }
  return modes
}

function seededRandom(seed) {
  let value = seed >>> 0
  return () => {
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    return (value >>> 0) / 0x1_0000_0000
  }
}

function summarize(samples, calibration) {
  const seeded = samples.filter((sample) => sample.mode === 'seeded')
  const unseeded = samples.filter((sample) => sample.mode === 'unseeded')
  const seededSummary = summarizeMode(seeded)
  const unseededSummary = summarizeMode(unseeded)
  return {
    calibration: {
      captureDurationMs: calibration.capture?.durationMs ?? null,
      chunks: calibration.capture?.detail?.chunks ?? null,
      materializeMs: calibration.materialize?.durationMs ?? null,
      parts: calibration.capture?.detail?.parts ?? null,
      rows: calibration.capture?.detail?.rows ?? null,
      runs: calibration.capture?.detail?.runs ?? null,
      serializedBytes: calibration.serialized.length * 2,
    },
    config: {
      filePath: options.filePath,
      samplesPerMode: options.samplesPerMode,
      seed: options.seed,
      warmupsPerMode: options.warmupsPerMode,
    },
    paired: {
      cachedVisualBeforeAuthoritativeHighlightP50Ms: difference(
        seededSummary.authoritativeHighlightMs.p50,
        seededSummary.cachedFrameMs.p50,
      ),
      seededMinusUnseededAuthoritativeHighlightP50Ms: difference(
        seededSummary.authoritativeHighlightMs.p50,
        unseededSummary.authoritativeHighlightMs.p50,
      ),
      seededMinusUnseededAuthoritativeTextP50Ms: difference(
        seededSummary.authoritativeTextMs.p50,
        unseededSummary.authoritativeTextMs.p50,
      ),
    },
    seeded: seededSummary,
    unseeded: unseededSummary,
  }
}

function summarizeMode(samples) {
  return {
    samples: samples.length,
    authoritativeHighlightMs: distribution(samples, 'authoritativeHighlightMs'),
    authoritativeTextMs: distribution(samples, 'authoritativeTextMs'),
    cachedFrameMs: distribution(samples, 'cachedFrameMs'),
    captureDurationMs: distribution(samples, 'captureDurationMs'),
    encodeMs: distribution(samples, 'encodeMs'),
    longTaskCount: distribution(samples, 'longTaskCount'),
    longTaskMaxMs: distribution(samples, 'longTaskMaxMs'),
    longTaskTotalMs: distribution(samples, 'longTaskTotalMs'),
    materializeMs: distribution(samples, 'materializeMs'),
    parseMs: distribution(samples, 'parseMs'),
    renderMs: distribution(samples, 'renderMs'),
    serializedBytes: distribution(samples, 'serializedBytes'),
    counts: {
      chunks: lastPresent(samples, 'chunks'),
      parts: lastPresent(samples, 'parts'),
      rows: lastPresent(samples, 'rows'),
      runs: lastPresent(samples, 'runs'),
    },
  }
}

function distribution(samples, key) {
  const values = samples.map((sample) => sample[key]).filter((value) => value !== null)
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  }
}

function lastPresent(samples, key) {
  return samples.findLast((sample) => sample[key] !== null)?.[key] ?? null
}

function difference(left, right) {
  return round(left - right)
}

function roundSample(sample) {
  return Object.fromEntries(
    Object.entries(sample).map(([key, value]) => [
      key,
      typeof value === 'number' ? round(value) : value,
    ]),
  )
}

function currentWorkspaceCachePrefix() {
  const source = readFileSync(
    new URL('../src/lib/workspace-cache-storage.ts', import.meta.url),
    'utf8',
  )
  const match = source.match(/WORKSPACE_CACHE_VERSION\s*=\s*(\d+)/)
  if (!match) throw createBenchmarkError('could not read workspace cache version')
  return `platform.workspace-state.v${match[1]}`
}
