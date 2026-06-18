import path from 'node:path'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Shared resolution so every project reads the same `@/` paths as the app.
const workspaceRoot = path.resolve(__dirname, '../..')
const alias = {
  '@': path.resolve(__dirname, './src'),
}
const reactPlugin = () => react()
const reactCompilerPlugin = () => babel({ presets: [reactCompilerPreset()] })
const browserTestPort = process.env.VITEST_BROWSER_PORT ?? '5179'
const browserFileServerPort = process.env.VITEST_BROWSER_FILE_SERVER_PORT ?? '33201'
const browserFileServerUrl = `http://127.0.0.1:${browserFileServerPort}`

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
        plugins: [reactPlugin(), reactCompilerPlugin()],
        resolve: { alias, dedupe: ['react', 'react-dom'] },
        test: {
          name: 'dom',
          environment: './test/env/happy-dom-ssr.ts',
          include: ['src/**/*.test.tsx', 'test/**/*.test.tsx'],
          exclude: ['src/**/*.browser.tsx'],
          setupFiles: ['./test/env/msw.ts', './test/env/dom.ts'],
        },
      },
      {
        // Real-paint / layout / visual tests in a real browser via Playwright.
        plugins: [reactPlugin(), reactCompilerPlugin(), tailwindcss()],
        resolve: { alias, dedupe: ['react', 'react-dom'] },
        define: {
          // Browser tests talk to the spawned file server directly: the
          // Vitest browser runner serves tests from its own API server, so
          // the project-level `server.proxy` never applies to them.
          'import.meta.env.VITE_SERVER_URL': JSON.stringify(browserFileServerUrl),
        },
        optimizeDeps: {
          exclude: ['@singapor/tree-sitter', '@singapor/tree-sitter-languages'],
          include: ['@phosphor-icons/react', '@tanstack/react-hotkeys'],
        },
        test: {
          name: 'browser',
          globalSetup: ['./test/env/browser-file-server.ts'],
          include: ['src/**/*.browser.tsx'],
          setupFiles: ['./test/env/jest-dom.ts'],
          browser: {
            // Pin the runner origin so the file server's allowed-origins
            // list (built from this port) matches the real test origin.
            api: { host: '127.0.0.1', port: Number(browserTestPort) },
            commands: {
              proofMouseDrag,
              proofMouseUp,
            },
            enabled: true,
            headless: true,
            provider: playwright(),
            screenshotFailures: false,
            instances: [{ browser: 'chromium', viewport: { height: 700, width: 900 } }],
          },
        },
      },
    ],
  },
})

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
  readonly evaluate: <TResult>(callback: () => TResult) => Promise<TResult>
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

type ProofMouseFrameTransform = {
  readonly originX: number
  readonly originY: number
  readonly scaleX: number
  readonly scaleY: number
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
  const transform = await proofMouseFrameTransform(frame)
  let point = await sourcePointForProofMouseDrag(frame, transform, input)

  await context.page.mouse.move(point.x, point.y)
  await context.page.mouse.down()

  for (const step of input.steps) {
    point = await runProofMouseStep(context, frame, transform, point, step)
  }

  if (input.release === false) return

  await context.page.mouse.up()
}

async function sourcePointForProofMouseDrag(
  frame: ProofMouseFrame,
  transform: ProofMouseFrameTransform,
  input: ProofMouseDragInput,
) {
  if (typeof input.sourceClientX === 'number' && typeof input.sourceClientY === 'number') {
    return frameClientPointToPagePoint(transform, {
      x: input.sourceClientX,
      y: input.sourceClientY,
    })
  }

  return pointForSelector(frame, transform, input.sourceSelector, input.sourceX, input.sourceY)
}

async function proofMouseUp(context: ProofMouseCommandContext) {
  await context.page.mouse.up()
}

async function runProofMouseStep(
  context: ProofMouseCommandContext,
  frame: ProofMouseFrame,
  transform: ProofMouseFrameTransform,
  currentPoint: ProofMousePoint,
  step: ProofMouseDragStep,
) {
  if (step.kind === 'pause') {
    await delay(step.ms ?? 16)
    return currentPoint
  }

  const point = await nextProofMousePoint(frame, transform, currentPoint, step)

  await context.page.mouse.move(point.x, point.y, { steps: step.steps ?? 8 })

  return point
}

async function nextProofMousePoint(
  frame: ProofMouseFrame,
  transform: ProofMouseFrameTransform,
  currentPoint: ProofMousePoint,
  step: Exclude<ProofMouseDragStep, { readonly kind: 'pause' }>,
) {
  if (step.kind === 'move-by') {
    return {
      x: currentPoint.x + step.dx * transform.scaleX,
      y: currentPoint.y + step.dy * transform.scaleY,
    }
  }

  return pointForSelector(
    frame,
    transform,
    step.selector,
    step.x,
    step.y,
    step.offsetX,
    step.offsetY,
  )
}

async function pointForSelector(
  frame: ProofMouseFrame,
  transform: ProofMouseFrameTransform,
  selector: string,
  xRatio = 0.5,
  yRatio = 0.5,
  offsetX = 0,
  offsetY = 0,
) {
  const box = await frame.locator(selector).boundingBox()
  if (!box) throw new Error(`Missing browser element for selector ${selector}`)

  return {
    x: box.x + box.width * xRatio + offsetX * transform.scaleX,
    y: box.y + box.height * yRatio + offsetY * transform.scaleY,
  }
}

async function proofMouseFrameTransform(frame: ProofMouseFrame): Promise<ProofMouseFrameTransform> {
  const rootBox = await frame.locator('html').boundingBox()
  const viewport = await frame.evaluate(() => ({
    height: window.innerHeight,
    width: window.innerWidth,
  }))
  if (!rootBox) return identityProofMouseFrameTransform()
  if (viewport.width <= 0 || viewport.height <= 0) return identityProofMouseFrameTransform()

  return {
    originX: rootBox.x,
    originY: rootBox.y,
    scaleX: rootBox.width / viewport.width,
    scaleY: rootBox.height / viewport.height,
  }
}

function frameClientPointToPagePoint(
  transform: ProofMouseFrameTransform,
  point: ProofMousePoint,
): ProofMousePoint {
  return {
    x: transform.originX + point.x * transform.scaleX,
    y: transform.originY + point.y * transform.scaleY,
  }
}

function identityProofMouseFrameTransform(): ProofMouseFrameTransform {
  return {
    originX: 0,
    originY: 0,
    scaleX: 1,
    scaleY: 1,
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}
