import fs from 'node:fs/promises'
import path from 'node:path'

import { createServer } from 'vite'

import {
  asciiRenderer,
  renderStateAscii,
} from '../src/features/tiling-surface-manager/diagrams/ascii-renderer'
import { excalidrawRenderer } from '../src/features/tiling-surface-manager/diagrams/excalidraw-renderer'
import type { Engine } from '../src/features/tiling-surface-manager/diagrams/renderer'
import {
  buildDiagramGroups,
  previewState,
} from '../src/features/tiling-surface-manager/diagrams/states'

const DIAGRAMS_DIR = path.resolve(
  import.meta.dirname,
  '../src/features/tiling-surface-manager/diagrams',
)
const EXCALIDRAW_PATH = path.join(DIAGRAMS_DIR, 'layout-evolution.excalidraw')
const ASCII_PATH = path.join(DIAGRAMS_DIR, 'layout-evolution.txt')

const engine = await loadEngine()

try {
  await main(engine)
} finally {
  await engine.close()
}

async function main(engine: Engine) {
  const groups = buildDiagramGroups(engine)
  const stateCount = groups.reduce((total, group) => total + group.states.length, 0)

  const excalidraw = excalidrawRenderer.render({ engine, groups })
  const ascii = asciiRenderer.render({ engine, groups })

  await fs.mkdir(DIAGRAMS_DIR, { recursive: true })
  await fs.writeFile(EXCALIDRAW_PATH, excalidraw, 'utf8')
  await fs.writeFile(ASCII_PATH, ascii, 'utf8')

  console.log(renderStateAscii(engine, previewState(groups)))
  console.log('')
  console.log(`Generated ${EXCALIDRAW_PATH}`)
  console.log(`Generated ${ASCII_PATH}`)
  console.log(`Captured ${stateCount} layout states across ${groups.length} scenarios.`)
}

async function loadEngine() {
  const appRoot = path.resolve(import.meta.dirname, '..')
  const server = await createServer({
    configFile: path.resolve(appRoot, 'vite.config.ts'),
    logLevel: 'error',
    optimizeDeps: { entries: [], noDiscovery: true },
    root: appRoot,
    server: { middlewareMode: true },
  })

  try {
    const [builders, geometry, normalize, operations, rail, selectors] = await Promise.all([
      server.ssrLoadModule('/src/features/tiling-surface-manager/engine/layout-builders.ts'),
      server.ssrLoadModule('/src/features/tiling-surface-manager/engine/layout-geometry.ts'),
      server.ssrLoadModule('/src/features/tiling-surface-manager/engine/layout-normalize.ts'),
      server.ssrLoadModule('/src/features/tiling-surface-manager/engine/layout-operations.ts'),
      server.ssrLoadModule('/src/features/tiling-surface-manager/engine/rail-model.ts'),
      server.ssrLoadModule('/src/features/tiling-surface-manager/engine/layout-selectors.ts'),
    ])

    return {
      builders,
      close: () => server.close(),
      geometry,
      normalize,
      operations,
      rail,
      selectors,
    } as unknown as Engine & { close: () => Promise<void> }
  } catch (error) {
    await server.close()
    throw error
  }
}
