import { chromium } from 'playwright'
import { statSync } from 'node:fs'
import { basename, relative, resolve, sep } from 'node:path'

const appUrl = 'http://localhost:5173/'
const serverUrl = 'http://localhost:3001'
const rootPathAbs = resolve('/Users/shaul/Desktop/D/platform')
const filePathAbs = resolve(rootPathAbs, 'apps/web/src/features/editor/components/editor.tsx')
const cachePrefix = 'platform.workspace-state.v12'

const health = await (
  await fetch(new URL('/health', serverUrl), { headers: { Origin: new URL(appUrl).origin } })
).json()

function clientPath(abs) {
  const wsRoot = resolve(health.workspaceRoot)
  if (wsRoot === sep) return abs.startsWith(sep) ? abs.slice(1) : abs
  return relative(wsRoot, abs).split(sep).join('/')
}

const rootStat = statSync(rootPathAbs)
const filePath = clientPath(filePathAbs)
const entries = {
  [`${cachePrefix}.diffViewMode`]: 'split',
  [`${cachePrefix}.editorHistory`]: [filePath],
  [`${cachePrefix}.recentlyClosedEditorPaths`]: [],
  [`${cachePrefix}.rootFolder`]: {
    birthtimeMs: rootStat.birthtimeMs,
    mtimeMs: rootStat.mtimeMs,
    name: basename(rootPathAbs),
    path: clientPath(rootPathAbs),
    size: rootStat.size,
    type: 'directory',
    version: '',
  },
  [`${cachePrefix}.searchBuffer`]: null,
  [`${cachePrefix}.workspaceLayout`]: {
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
          resourceKey: filePath,
          serializedState: { editorGroupId: 'group-bench', editorTabId: 'tab-bench' },
          title: basename(filePath),
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
  },
}

function stats(durations) {
  const sorted = [...durations].sort((a, b) => a - b)
  const mean = durations.reduce((s, d) => s + d, 0) / durations.length
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return {
    meanMs: Math.round(mean * 100) / 100,
    fps: Math.round(1000 / mean),
    p50: Math.round(pick(0.5) * 100) / 100,
    p90: Math.round(pick(0.9) * 100) / 100,
    p99: Math.round(pick(0.99) * 100) / 100,
    maxMs: Math.round(sorted[sorted.length - 1] * 100) / 100,
    under8_33: durations.filter((d) => d <= 8.33).length,
    count: durations.length,
  }
}

const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await context.addInitScript((payload) => {
  for (const [key, value] of Object.entries(payload)) {
    window.localStorage.setItem(key, JSON.stringify(value))
  }
}, entries)
const page = await context.newPage()
page.setDefaultTimeout(25_000)
const url = new URL(appUrl)
url.searchParams.set('editorPerfTrace', '1')
await page.goto(String(url), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.editor-virtualized-row')
await page.waitForFunction(() => {
  const registry = window.CSS?.highlights
  if (!registry) return false
  let ranges = 0
  for (const [, highlight] of registry) ranges += highlight.size
  return ranges >= 200
})
await page.evaluate(() => document.fonts?.ready ?? Promise.resolve())
await page.waitForTimeout(800)

const idle = await page.evaluate(async () => {
  const durations = []
  let last = performance.now()
  for (let i = 0; i < 120; i += 1) {
    await new Promise((r) => requestAnimationFrame(r))
    const now = performance.now()
    durations.push(now - last)
    last = now
  }
  return durations
})
console.log('idle uncapped   ', JSON.stringify(stats(idle)))

for (let trial = 1; trial <= 3; trial += 1) {
  const scroll = await page.evaluate(async () => {
    const scroller = document.querySelector('.editor-virtualized')
    scroller.scrollTop = 0
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const durations = []
    let last = performance.now()
    for (let i = 0; i < 160; i += 1) {
      scroller.scrollTop += 18
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
      await new Promise((r) => requestAnimationFrame(r))
      const now = performance.now()
      durations.push(now - last)
      last = now
    }
    return durations
  })
  console.log(`scroll trial ${trial}  `, JSON.stringify(stats(scroll)))
}

await browser.close()
