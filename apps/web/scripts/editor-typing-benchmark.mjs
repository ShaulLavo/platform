import { resolve } from 'node:path'
import { createBenchmarkError } from './structured-errors.mjs'
import {
  average,
  browserList,
  browserTypes,
  createWorkspaceContext,
  fractionOption,
  jumpToScrollFraction,
  launchOptions,
  maximum,
  numberOption,
  percentile,
  round,
  seedWorkspaceCache,
  traceUrl,
  waitForHighlightedEditor,
} from './bench-workspace.mjs'

const defaultAppUrl = 'http://localhost:5173/'
const defaultServerUrl = process.env.VITE_SERVER_URL ?? 'http://localhost:3001'
const defaultFilePath = 'apps/web/src/features/editor/components/editor.tsx'
const defaultRootPath = resolve(process.cwd(), '../..')
const typedText = 'abcdefghijklmnopqrstuvwxyz0123456789abcd'
const options = parseOptions(process.argv.slice(2))

// Keystroke latency: keydown event timestamp to the first animation frame
// that runs after the editor applied the edit. Steady approximates human
// typing; burst removes inter-key delay so queueing and per-edit cost
// dominate. Chromium runs uncapped (see launchOptions), so its latencies
// reflect raw processing; webkit and firefox include vsync wait (~8ms p50).
const gateThresholds = {
  chromium: {
    maxSteadyP95Ms: 12,
    maxBurstP95Ms: 12,
    maxApplyEditMeanMs: 3,
  },
  firefox: {
    maxSteadyP95Ms: 20,
    // Firefox queues key events under burst input; p95 23-29ms measured.
    maxBurstP95Ms: 45,
    maxApplyEditMeanMs: 6,
  },
  webkit: {
    maxSteadyP95Ms: 25,
    maxBurstP95Ms: 25,
    maxApplyEditMeanMs: 6,
  },
}

const browserNames = options.browsers.length > 0 ? options.browsers : defaultBrowsers(options.gate)
const workspace = await createWorkspaceContext(options)
const results = {}

for (const browserName of browserNames) {
  results[browserName] = await runBrowserSamples(browserName, workspace)
}

console.log(`EDITOR_TYPING_BENCHMARK_SUMMARY ${JSON.stringify(results, null, 2)}`)

if (options.gate) {
  const failures = gateFailures(results)
  if (failures.length > 0) {
    console.error(`EDITOR_TYPING_BENCHMARK_GATE_FAILED ${JSON.stringify(failures, null, 2)}`)
    process.exit(1)
  }

  console.log('EDITOR_TYPING_BENCHMARK_GATE_PASSED')
}

function parseOptions(args) {
  const parsed = {
    appUrl: process.env.EDITOR_TYPING_BENCH_APP_URL ?? defaultAppUrl,
    browsers: [],
    filePath: process.env.EDITOR_TYPING_BENCH_FILE ?? defaultFilePath,
    gate: false,
    keyDelayMs: numberOption(process.env.EDITOR_TYPING_BENCH_KEY_DELAY_MS, 40),
    pageTimeoutMs: numberOption(process.env.EDITOR_TYPING_BENCH_PAGE_TIMEOUT_MS, 25_000),
    serverUrl: process.env.EDITOR_TYPING_BENCH_SERVER_URL ?? defaultServerUrl,
    startFraction: fractionOption(process.env.EDITOR_TYPING_BENCH_START_FRACTION, 0),
    trials: numberOption(process.env.EDITOR_TYPING_BENCH_TRIALS, 3),
    workspaceRoot: process.env.EDITOR_TYPING_BENCH_ROOT ?? defaultRootPath,
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
  if (name === '--key-delay-ms') parsed.keyDelayMs = numberOption(value, parsed.keyDelayMs)
  if (name === '--page-timeout-ms') parsed.pageTimeoutMs = numberOption(value, parsed.pageTimeoutMs)
  if (name === '--server-url') parsed.serverUrl = value ?? parsed.serverUrl
  if (name === '--start-fraction')
    parsed.startFraction = fractionOption(value, parsed.startFraction)
  if (name === '--trials') parsed.trials = numberOption(value, parsed.trials)
  if (name === '--workspace-root') parsed.workspaceRoot = value ?? parsed.workspaceRoot
}

function defaultBrowsers(gate) {
  if (gate) return ['chromium']

  return ['chromium', 'webkit', 'firefox']
}

async function runBrowserSamples(browserName, workspace) {
  const samples = []
  for (let trial = 1; trial <= options.trials; trial += 1) {
    const sample = await runTrial(browserName, trial, workspace)
    samples.push(sample)
    console.log(JSON.stringify({ type: 'editor-typing-benchmark-trial', ...sample }))
  }

  return summarizeSamples(samples)
}

async function runTrial(browserName, trial, workspace) {
  const browser = await browserTypes[browserName].launch(launchOptions(browserName))
  try {
    return await runTrialInBrowser(browser, browserName, trial, workspace)
  } finally {
    await browser.close().catch(() => {})
  }
}

async function runTrialInBrowser(browser, browserName, trial, workspace) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await seedWorkspaceCache(context, workspace)

  const page = await context.newPage()
  page.setDefaultTimeout(options.pageTimeoutMs)
  await page.goto(traceUrl(options.appUrl), { waitUntil: 'domcontentloaded' })
  await waitForHighlightedEditor(page)
  await jumpToScrollFraction(page, options.startFraction)
  await placeCaret(page)
  await installCollector(page)

  const steady = await runScenario(page, 'steady', options.keyDelayMs)
  const burst = await runScenario(page, 'burst', 0)

  return {
    browserName,
    trial,
    steady,
    burst,
  }
}

async function placeCaret(page) {
  const row = page.locator('.editor-virtualized-row').nth(20)
  await row.click({ position: { x: 40, y: 8 } })
  await page.keyboard.press('End')
}

async function installCollector(page) {
  await page.evaluate(() => {
    const keydowns = []
    const frames = []
    let raf = 0
    const tick = () => {
      frames.push(performance.now())
      raf = requestAnimationFrame(tick)
    }

    window.__typingBench = {
      start() {
        keydowns.length = 0
        frames.length = 0
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(tick)
      },
      stop() {
        cancelAnimationFrame(raf)
      },
      data() {
        return { frames: [...frames], keydowns: [...keydowns] }
      },
    }
    window.addEventListener(
      'keydown',
      (event) => {
        keydowns.push(event.timeStamp)
      },
      { capture: true },
    )
  })
}

async function runScenario(page, scenario, keyDelayMs) {
  await page.evaluate(() => {
    window.__editorPerfTrace.reset()
    window.__typingBench.start()
  })

  await page.keyboard.type(typedText, { delay: keyDelayMs })
  await page.waitForTimeout(300)

  const raw = await page.evaluate(() => {
    window.__typingBench.stop()
    return {
      collected: window.__typingBench.data(),
      report: window.__editorPerfTrace.report(),
    }
  })

  return scenarioSample(scenario, raw)
}

function scenarioSample(scenario, raw) {
  const latencies = keystrokeLatencies(raw.collected)
  const applyEdit = diagnostic(raw.report, 'editor.view.applyEdit')
  const render = diagnostic(raw.report, 'editor.renderSessionChange')
  if (applyEdit.count < typedText.length) {
    throw createBenchmarkError(
      `Editor applied ${applyEdit.count}/${typedText.length} edits in ${scenario}; input focus was lost.`,
    )
  }

  return {
    scenario,
    keystrokes: latencies.length,
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP95Ms: percentile(latencies, 0.95),
    latencyMaxMs: maximum(latencies),
    slowKeystrokes: latencies.filter((latency) => latency > 16.7).length,
    longKeystrokes: latencies.filter((latency) => latency > 50).length,
    applyEditCount: applyEdit.count,
    applyEditMeanMs: applyEdit.meanMs,
    applyEditMaxMs: applyEdit.maxMs,
    renderMeanMs: render.meanMs,
    renderMaxMs: render.maxMs,
  }
}

function keystrokeLatencies(collected) {
  const latencies = []
  let frameIndex = 0
  for (const keydown of collected.keydowns) {
    while (frameIndex < collected.frames.length && collected.frames[frameIndex] <= keydown) {
      frameIndex += 1
    }
    if (frameIndex >= collected.frames.length) break

    latencies.push(round(collected.frames[frameIndex] - keydown))
  }

  return latencies
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
    steady: scenarioSummary(samples.map((sample) => sample.steady)),
    burst: scenarioSummary(samples.map((sample) => sample.burst)),
    samples,
  }
}

function scenarioSummary(scenarios) {
  return {
    meanP50Ms: average(scenarios.map((scenario) => scenario.latencyP50Ms)),
    meanP95Ms: average(scenarios.map((scenario) => scenario.latencyP95Ms)),
    maxP95Ms: maximum(scenarios.map((scenario) => scenario.latencyP95Ms)),
    maxLatencyMs: maximum(scenarios.map((scenario) => scenario.latencyMaxMs)),
    meanSlowKeystrokes: average(scenarios.map((scenario) => scenario.slowKeystrokes)),
    meanLongKeystrokes: average(scenarios.map((scenario) => scenario.longKeystrokes)),
    meanApplyEditMeanMs: average(scenarios.map((scenario) => scenario.applyEditMeanMs)),
    maxApplyEditMaxMs: maximum(scenarios.map((scenario) => scenario.applyEditMaxMs)),
  }
}

function gateFailures(results) {
  return Object.entries(results).flatMap(([browserName, summary]) => {
    const thresholds = gateThresholds[browserName]
    if (!thresholds) return []

    return thresholdFailures(browserName, summary, thresholds)
  })
}

function thresholdFailures(browserName, summary, thresholds) {
  const metrics = {
    maxApplyEditMeanMs: Math.max(
      summary.steady.meanApplyEditMeanMs,
      summary.burst.meanApplyEditMeanMs,
    ),
    maxBurstP95Ms: summary.burst.maxP95Ms,
    maxSteadyP95Ms: summary.steady.maxP95Ms,
  }

  return Object.entries(thresholds).flatMap(([key, threshold]) => {
    const metric = metrics[key] ?? Number.POSITIVE_INFINITY
    if (metric <= threshold) return []

    return [{ browserName, key, metric, threshold }]
  })
}
