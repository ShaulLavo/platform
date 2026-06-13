import { chromium, firefox, webkit } from 'playwright'
import { statSync } from 'node:fs'
import { basename, relative, resolve, sep } from 'node:path'
import { createBenchmarkError } from './structured-errors.mjs'

export const browserTypes = { chromium, firefox, webkit }

const cachePrefix = 'platform.workspace-state.v12'

export function launchOptions(browserName) {
  if (browserName !== 'chromium') return { headless: true }

  // The default chromium headless shell stalls its frame pipeline ~2x vsync
  // under sustained editor repaint, inflating frame means to ~27ms. The
  // 'chromium' channel runs new headless on the real browser instead.
  // Frames run uncapped so benchmarks measure real frame throughput
  // (~5ms/frame) rather than vsync cadence; regressions surface directly
  // instead of hiding inside the 16.7ms vsync budget.
  return {
    args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'],
    channel: 'chromium',
    headless: true,
  }
}

// Reproducible "under load" benching via DevTools CPU throttling. Applied
// after the editor is ready so setup stays fast and only the measured
// interaction runs degraded. Chromium-only; other browsers run unthrottled.
export async function applyCpuThrottle(page, browserName, rate) {
  if (rate <= 1) return false
  if (browserName !== 'chromium') return false

  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setCPUThrottlingRate', { rate })
  return true
}

// Fixed deterministic workload timed in-page right before sampling. Reported
// with every trial so runs are comparable across machine states: an inflated
// value means the machine (or --cpu-throttle) was slow, and by how much.
export async function measureCpuCalibration(page) {
  return page.evaluate(() => {
    const start = performance.now()
    let acc = 0
    for (let index = 0; index < 20_000_000; index += 1) {
      acc = (acc + index * 31) % 1000003
    }
    if (acc === -1) console.log(acc)
    return Math.round((performance.now() - start) * 100) / 100
  })
}

export function browserList(value) {
  if (!value) return []

  return value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name in browserTypes)
}

export function numberOption(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback

  return Math.floor(parsed)
}

export function fractionOption(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 1) return fallback

  return parsed
}

export async function jumpToScrollFraction(page, fraction, expectHighlights = true) {
  if (fraction <= 0) return

  await page.evaluate(async (targetFraction) => {
    const scroller = document.querySelector('.editor-virtualized')
    scroller.scrollTop = Math.floor(
      (scroller.scrollHeight - scroller.clientHeight) * targetFraction,
    )
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }, fraction)
  if (expectHighlights) await waitForHighlightRanges(page)
  await page.waitForTimeout(250)
}

export async function createWorkspaceContext({ appUrl, serverUrl, workspaceRoot, filePath }) {
  const health = await fetchServerHealth(appUrl, serverUrl)
  const absoluteRootPath = resolve(workspaceRoot)
  const absoluteFilePath = resolve(absoluteRootPath, filePath)
  const rootPath = clientPathForAbsolutePath(absoluteRootPath, health.workspaceRoot)
  const clientFilePath = clientPathForAbsolutePath(absoluteFilePath, health.workspaceRoot)
  const rootStat = statSync(absoluteRootPath)

  return {
    absoluteRootPath,
    filePath: clientFilePath,
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

async function fetchServerHealth(appUrl, serverUrl) {
  const response = await fetch(new URL('/health', serverUrl), {
    headers: { Origin: new URL(appUrl).origin },
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

export async function seedWorkspaceCache(context, workspace) {
  await context.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      window.localStorage.setItem(key, JSON.stringify(value))
    }
  }, workspaceCacheEntries(workspace))
}

export function workspaceCacheEntries(workspace) {
  return {
    [`${cachePrefix}.diffViewMode`]: 'split',
    [`${cachePrefix}.editorHistory`]: [workspace.filePath],
    [`${cachePrefix}.recentlyClosedEditorPaths`]: [],
    [`${cachePrefix}.rootFolder`]: workspace.rootFolder,
    [`${cachePrefix}.searchBuffer`]: null,
    [`${cachePrefix}.workspaceLayout`]: workspaceLayoutEntry(workspace),
  }
}

function workspaceLayoutEntry(workspace) {
  return {
    activeSurfaceId: 'surface-bench',
    activeWindowId: 'window-bench',
    customWindowCommands: [],
    hotkeyPresets: [],
    layoutCommands: [],
    mruSurfaceIds: ['surface-bench'],
    mruWindowIds: ['window-bench'],
    nodes: [{ id: 'node-bench', kind: 'window', windowId: 'window-bench' }],
    policies: [],
    rail: {
      backgroundSurfaceIds: [],
      pinnedSurfaceIds: [],
      recipeIds: [],
      runningSurfaceIds: [],
      visibleSingletonSurfaceIds: [],
    },
    recipes: [],
    rootNodeId: 'node-bench',
    surfaceRegistryVersion: 1,
    surfaces: [
      {
        id: 'surface-bench',
        surface: {
          lifecycle: 'durable',
          resourceKey: workspace.filePath,
          serializedState: { editorGroupId: 'group-bench', editorTabId: 'tab-bench' },
          title: basename(workspace.filePath),
          type: 'file-editor',
          version: 1,
        },
      },
    ],
    version: 1,
    windows: [
      {
        activeSurfaceId: 'surface-bench',
        id: 'window-bench',
        mode: 'normal',
        pinnedSurfaceIds: [],
        surfaceIds: ['surface-bench'],
      },
    ],
  }
}

export function traceUrl(appUrl) {
  const url = new URL(appUrl)
  url.searchParams.set('editorPerfTrace', '1')
  return String(url)
}

export async function waitForHighlightedEditor(page, expectHighlights = true) {
  await page.waitForSelector('.editor-virtualized-row')
  await page.waitForFunction(() => Boolean(window.__editorPerfTrace))
  if (expectHighlights) await waitForHighlightRanges(page)
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

function waitForHighlightRanges(page) {
  return page.waitForFunction(() => {
    const registry = window.CSS?.highlights
    if (!registry) return false

    let ranges = 0
    for (const [, highlight] of registry) ranges += highlight.size
    return ranges >= 200
  })
}

export function average(values) {
  return round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length))
}

export function minimum(values) {
  if (values.length === 0) return 0

  return round(Math.min(...values))
}

export function maximum(values) {
  if (values.length === 0) return 0

  return round(Math.max(...values))
}

export function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const midpoint = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return round(sorted[midpoint])

  return average([sorted[midpoint - 1], sorted[midpoint]])
}

export function percentile(values, fraction) {
  if (values.length === 0) return 0

  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
  return round(sorted[Math.max(0, index)])
}

export function round(value) {
  return Math.round(value * 100) / 100
}
