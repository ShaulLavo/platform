import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Shared resolution so every project reads the same `@/` paths as the app.
const workspaceRoot = path.resolve(__dirname, '../..')
const alias = {
  '@': path.resolve(__dirname, './src'),
  '@workspace/tiling': path.resolve(workspaceRoot, 'packages/tiling/src'),
}
const reactPlugin = () => react({ babel: { plugins: ['babel-plugin-react-compiler'] } })
const browserTestPort = process.env.VITEST_BROWSER_PORT ?? '5179'
const browserFileServerPort = process.env.VITEST_BROWSER_FILE_SERVER_PORT ?? '33201'
const browserFileServerUrl = `http://127.0.0.1:${browserFileServerPort}`
const browserProxyOrigin = `http://127.0.0.1:${browserTestPort}`

process.env.VITEST_BROWSER_PORT = browserTestPort
process.env.VITEST_BROWSER_FILE_SERVER_PORT = browserFileServerPort
process.env.VITEST_BROWSER_FILE_SERVER_URL = browserFileServerUrl

// Three test worlds, in the project's preferred order: real browser > happy-dom > node.
// Phase 1 stands these up in parallel to the existing `bun test` suite; the bun
// files keep running under `bun test` until the codemod migrates their imports.
export default defineConfig({
  test: {
    projects: [
      {
        // Pure logic + anything that talks to the in-process server. No DOM.
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          setupFiles: ['./test/env/msw.ts'],
        },
      },
      {
        // Hooks + light component/render tests. happy-dom, not jsdom.
        plugins: [reactPlugin()],
        resolve: { alias, dedupe: ['react', 'react-dom'] },
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['src/**/*.test.tsx', 'test/**/*.test.tsx'],
          exclude: ['src/**/*.browser.tsx'],
          setupFiles: ['./test/env/msw.ts', './test/env/dom.ts'],
        },
      },
      {
        // Real-paint / layout / visual tests in a real browser via Playwright.
        plugins: [reactPlugin(), tailwindcss()],
        resolve: { alias, dedupe: ['react', 'react-dom'] },
        define: {
          'import.meta.env.VITE_SERVER_URL': 'globalThis.location.origin',
        },
        optimizeDeps: {
          exclude: ['@singapor/tree-sitter-languages'],
          include: ['@phosphor-icons/react', '@tanstack/react-hotkeys'],
        },
        server: {
          host: '127.0.0.1',
          port: Number(browserTestPort),
          proxy: {
            '/_log': fileServerProxy(),
            '/fonts': fileServerProxy(),
            '/fs': fileServerProxy(),
            '/git': fileServerProxy(),
            '/health': fileServerProxy(),
            '/lsp': fileServerProxy(),
            '/orchestration': fileServerProxy(),
            '/provider': fileServerProxy(),
          },
          strictPort: true,
          watch: null,
        },
        test: {
          name: 'browser',
          globalSetup: ['./test/env/browser-file-server.ts'],
          include: ['src/**/*.browser.tsx'],
          setupFiles: ['./test/env/jest-dom.ts'],
          browser: {
            commands: {
              proofMouseDrag,
              proofMouseUp,
            },
            enabled: true,
            headless: true,
            provider: 'playwright',
            screenshotFailures: false,
            instances: [{ browser: 'chromium', viewport: { height: 700, width: 900 } }],
          },
        },
      },
    ],
  },
})

function fileServerProxy() {
  return {
    changeOrigin: true,
    headers: {
      origin: browserProxyOrigin,
    },
    target: browserFileServerUrl,
    ws: true,
  }
}

type ProofMouseCommandContext = {
  readonly frame: () => Promise<ProofMouseFrame>
  readonly page: {
    readonly mouse: {
      readonly down: () => Promise<void>
      readonly move: (x: number, y: number, options?: { readonly steps?: number }) => Promise<void>
      readonly up: () => Promise<void>
    }
  }
}

type ProofMouseFrame = {
  readonly locator: (selector: string) => {
    readonly boundingBox: () => Promise<ProofMouseBox | null>
  }
}

type ProofMouseBox = {
  readonly height: number
  readonly width: number
  readonly x: number
  readonly y: number
}

type ProofMousePoint = {
  readonly x: number
  readonly y: number
}

type ProofMouseDragInput = {
  readonly release?: boolean
  readonly sourceClientX?: number
  readonly sourceClientY?: number
  readonly sourceSelector: string
  readonly sourceX?: number
  readonly sourceY?: number
  readonly steps: readonly ProofMouseDragStep[]
}

type ProofMouseDragStep =
  | {
      readonly dx: number
      readonly dy: number
      readonly kind: 'move-by'
      readonly steps?: number
    }
  | {
      readonly kind: 'move-to-selector'
      readonly offsetX?: number
      readonly offsetY?: number
      readonly selector: string
      readonly steps?: number
      readonly x?: number
      readonly y?: number
    }
  | {
      readonly kind: 'pause'
      readonly ms?: number
    }

async function proofMouseDrag(context: ProofMouseCommandContext, input: ProofMouseDragInput) {
  const frame = await context.frame()
  let point = await sourcePointForProofMouseDrag(frame, input)

  await context.page.mouse.move(point.x, point.y)
  await context.page.mouse.down()

  for (const step of input.steps) {
    point = await runProofMouseStep(context, frame, point, step)
  }

  if (input.release === false) return

  await context.page.mouse.up()
}

async function sourcePointForProofMouseDrag(frame: ProofMouseFrame, input: ProofMouseDragInput) {
  if (typeof input.sourceClientX === 'number' && typeof input.sourceClientY === 'number') {
    return { x: input.sourceClientX, y: input.sourceClientY }
  }

  return pointForSelector(frame, input.sourceSelector, input.sourceX, input.sourceY)
}

async function proofMouseUp(context: ProofMouseCommandContext) {
  await context.page.mouse.up()
}

async function runProofMouseStep(
  context: ProofMouseCommandContext,
  frame: ProofMouseFrame,
  currentPoint: ProofMousePoint,
  step: ProofMouseDragStep,
) {
  if (step.kind === 'pause') {
    await delay(step.ms ?? 16)
    return currentPoint
  }

  const point = await nextProofMousePoint(frame, currentPoint, step)

  await context.page.mouse.move(point.x, point.y, { steps: step.steps ?? 8 })

  return point
}

async function nextProofMousePoint(
  frame: ProofMouseFrame,
  currentPoint: ProofMousePoint,
  step: Exclude<ProofMouseDragStep, { readonly kind: 'pause' }>,
) {
  if (step.kind === 'move-by') {
    return {
      x: currentPoint.x + step.dx,
      y: currentPoint.y + step.dy,
    }
  }

  return pointForSelector(frame, step.selector, step.x, step.y, step.offsetX, step.offsetY)
}

async function pointForSelector(
  frame: ProofMouseFrame,
  selector: string,
  xRatio = 0.5,
  yRatio = 0.5,
  offsetX = 0,
  offsetY = 0,
) {
  const box = await frame.locator(selector).boundingBox()
  if (!box) throw new Error(`Missing browser element for selector ${selector}`)

  return {
    x: box.x + box.width * xRatio + offsetX,
    y: box.y + box.height * yRatio + offsetY,
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}
