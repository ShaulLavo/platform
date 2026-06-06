import fs from 'node:fs/promises'
import path from 'node:path'

import { createServer } from 'vite'

import type { LayoutRect } from '../src/features/tiling-surface-manager/utils/layout-geometry'
import type {
  LayoutOperation,
  Surface,
  SurfaceId,
  SurfaceType,
  WindowId,
  WorkspaceLayout,
  WorkspaceRecipeSlot,
} from '../src/features/tiling-surface-manager/utils/layout-types'

const OUTPUT_PATH = path.resolve(
  import.meta.dirname,
  '../src/features/tiling-surface-manager/diagrams/layout-evolution.excalidraw',
)
const FRAME_WIDTH = 560
const FRAME_HEIGHT = 360
const TITLE_BAR_HEIGHT = 34
const RAIL_WIDTH = 42
const WINDOW_PADDING = 12
const CONTENT_GAP = 8
const FONT_FAMILY = 5
const UPDATED_AT = 1_780_735_986_986
const EXPECTED_STATE_COUNT = 27

type SlotStyle = {
  readonly backgroundColor: string
  readonly label: string
  readonly strokeColor: string
}

type DiagramElement = Record<string, unknown>

type DiagramState = {
  readonly layout: WorkspaceLayout
  readonly title: string
  readonly transition?: string
}

type DiagramGroup = {
  readonly description?: string
  readonly states: readonly DiagramState[]
  readonly title: string
}

type Point = {
  readonly x: number
  readonly y: number
}

type RectStyle = {
  readonly backgroundColor?: string
  readonly opacity?: number
  readonly roughness?: number
  readonly roundness?: null | { readonly type: number }
  readonly strokeColor?: string
  readonly strokeWidth?: number
}

const SLOT_STYLES = {
  bottom: {
    backgroundColor: '#c5f6fa',
    label: 'bottom: Terminal / Problems',
    strokeColor: '#0c8599',
  },
  'editor-center': {
    backgroundColor: '#ffec99',
    label: 'editor-center: file-editor / diff',
    strokeColor: '#f08c00',
  },
  'primary-side': {
    backgroundColor: '#a5d8ff',
    label: 'primary-side: Files / Search',
    strokeColor: '#1971c2',
  },
  rail: {
    backgroundColor: '#f1f3f5',
    label: 'rail',
    strokeColor: '#495057',
  },
  'secondary-side': {
    backgroundColor: '#b2f2bb',
    label: 'secondary-side: Git / Chat / Logs',
    strokeColor: '#2f9e44',
  },
  'transient-preview': {
    backgroundColor: '#e5dbff',
    label: 'transient-preview',
    strokeColor: '#7048e8',
  },
} satisfies Record<WorkspaceRecipeSlot, SlotStyle>

const engine = await loadEngine()

try {
  await main()
} finally {
  await engine.close()
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
      server.ssrLoadModule('/src/features/tiling-surface-manager/utils/layout-builders.ts'),
      server.ssrLoadModule('/src/features/tiling-surface-manager/utils/layout-geometry.ts'),
      server.ssrLoadModule('/src/features/tiling-surface-manager/utils/layout-normalize.ts'),
      server.ssrLoadModule('/src/features/tiling-surface-manager/utils/layout-operations.ts'),
      server.ssrLoadModule('/src/features/tiling-surface-manager/utils/rail-model.ts'),
      server.ssrLoadModule('/src/features/tiling-surface-manager/utils/layout-selectors.ts'),
    ])

    return {
      builders,
      close: () => server.close(),
      geometry,
      normalize,
      operations,
      rail,
      selectors,
    }
  } catch (error) {
    await server.close()
    throw error
  }
}

async function main() {
  const groups = diagramGroups()
  const states = groups.flatMap((group) => group.states)
  const diagram = buildDiagram(groups)
  const json = JSON.stringify(diagram, null, 2)

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(OUTPUT_PATH, `${json}\n`, 'utf8')

  const written = JSON.parse(await fs.readFile(OUTPUT_PATH, 'utf8')) as {
    readonly elements?: readonly unknown[]
    readonly type?: string
    readonly version?: number
  }

  validateGeneratedDiagram(written, states)
  console.log(`Generated ${OUTPUT_PATH}`)
  console.log(
    `Captured ${states.length} layout states and ${written.elements?.length ?? 0} elements.`,
  )
}

function validateGeneratedDiagram(
  written: {
    readonly elements?: readonly unknown[]
    readonly type?: string
    readonly version?: number
  },
  states: readonly DiagramState[],
) {
  if (written.type !== 'excalidraw') throw new Error('Expected Excalidraw file type')
  if (written.version !== 2) throw new Error('Expected Excalidraw file version 2')
  if ((written.elements?.length ?? 0) <= 200) throw new Error('Expected generated diagram elements')
  if (states.length !== EXPECTED_STATE_COUNT) {
    throw new Error(`Expected ${EXPECTED_STATE_COUNT} captured layout states`)
  }
}

function diagramGroups(): readonly DiagramGroup[] {
  return [
    {
      states: mainEvolutionStates(),
      title: 'Workbench tiling layout evolution',
    },
    {
      description:
        'Rail-clicking visible Files minimizes it; Search stays in its primary-side window.',
      states: spatialMemoryStates(),
      title: '1. Memory C, click Files again',
    },
    {
      description: 'Closing Files repairs the tool column using the remaining Git/Chat/Logs stack.',
      states: busyCloseFilesStates(),
      title: '2. Busy final, close Files',
    },
    {
      description: 'Closing Git removes its node and the remaining secondary stack rebalances.',
      states: closeGitFromToolStackStates(),
      title: '3. Search + Git + Chat + Logs, close Git',
    },
    {
      description:
        'Dragging Files into the editor records sticky center placement, so reopening ignores Search.',
      states: draggedFilesReopenWithSearchStates(),
      title: '4. Drag Files into editor, close, reopen',
    },
    {
      description: 'Problems targets the existing bottom slot, so it becomes a bottom tab.',
      states: problemsWithBottomAndSplitEditorsStates(),
      title: '5. Bottom dock + split editors, open Problems',
    },
    {
      description: 'Chat opens under the resized Git window and splits Git current tall share.',
      states: resizedGitThenChatStates(),
      title: '6. Resize Git tall, then open Chat',
    },
    {
      description:
        'Terminal is the first root surface; opening an editor afterward should move content above it instead of hiding or tabbing into the bottom pane.',
      states: terminalFirstThenEditorStates(),
      title: '7. Terminal first, then editor',
    },
  ]
}

function mainEvolutionStates(): readonly DiagramState[] {
  const fileA = engine.builders.createFileEditorSurface({ path: '/repo/src/app.ts' })
  const fileB = engine.builders.createFileEditorSurface({ path: '/repo/src/router.ts' })
  const terminalOne = engine.builders.createTerminalSurface({ sessionId: 'terminal-1' })
  const terminalTwo = engine.builders.createTerminalSurface({
    sessionId: 'terminal-2',
    title: 'Terminal 2',
  })
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(layout, fileA)
  states.push(captureState(layout, '1. One editor', 'open file-editor -> editor-center root'))

  layout = openSurface(layout, engine.builders.createFileNavigatorSurface())
  states.push(captureState(layout, '2. Files | Editor', 'primary-side -> left root edge'))

  layout = openSurface(layout, terminalOne)
  states.push(captureState(layout, '3. Bottom dock', 'slot=bottom -> wrap root in V-split'))

  layout = openSurface(layout, fileB)
  states.push(captureState(layout, '4. Editor tab', 'editor-center is multi -> new TAB'))

  layout = splitSurfaceRight(layout, fileA.id, fileB.id)
  states.push(captureState(layout, '5. Split editor', 'splitWindow right -> editor H-split'))

  layout = openSurface(layout, engine.builders.createGitChangesSurface())
  states.push(captureState(layout, '6. Git dock', 'secondary-side -> dock under Files'))

  layout = openSurface(layout, engine.builders.createChatSurface())
  layout = openSurface(layout, engine.builders.createLogsSurface())
  states.push(captureState(layout, '7. Secondary stack', 'same secondary slot -> flat V-split'))

  layout = openSurface(layout, engine.builders.createDiagnosticsSurface())
  layout = openSurface(layout, terminalTwo)
  states.push(
    captureState(layout, '8. Busy final state', 'bottom exists -> Problems + Terminal tabs'),
  )

  return states
}

function spatialMemoryStates(): readonly DiagramState[] {
  const editor = engine.builders.createFileEditorSurface({ path: '/repo/src/memory.ts' })
  const files = engine.builders.createFileNavigatorSurface()
  const search = engine.builders.createSearchResultsSurface()
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(layout, editor)
  layout = openSurface(layout, files)
  layout = moveSurfaceToEditorRight(layout, files.id, editor.id)
  states.push(captureState(layout, 'Memory A. Files moved', 'moveSurface right -> sticky recorded'))

  layout = engine.operations.applyLayoutOperation(layout, {
    surfaceId: files.id,
    type: 'minimizeSurface',
  })
  layout = openSurface(layout, search)
  states.push(
    captureState(layout, 'Memory B. Search opens', 'Files minimized; Search uses recipe slot'),
  )

  layout = openSurface(layout, files)
  states.push(captureState(layout, 'Memory C. Files restored', 'sticky placement wins over recipe'))

  layout = clickRailSurface(layout, files.id)
  states.push(
    captureState(layout, 'Memory D. Files clicked', 'visible rail item -> minimize Files'),
  )

  return states
}

function busyCloseFilesStates(): readonly DiagramState[] {
  const files = engine.builders.createFileNavigatorSurface()
  let layout = busyFinalLayout()
  const states: DiagramState[] = []

  states.push(captureState(layout, 'Before close Files', 'busy final state'))

  layout = closeSurface(layout, files.id)
  states.push(captureState(layout, 'After close Files', 'closeSurface Files -> repair side stack'))

  return states
}

function closeGitFromToolStackStates(): readonly DiagramState[] {
  const git = engine.builders.createGitChangesSurface()
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(layout, engine.builders.createSearchResultsSurface())
  layout = openSurface(layout, git)
  layout = openSurface(layout, engine.builders.createChatSurface())
  layout = openSurface(layout, engine.builders.createLogsSurface())
  states.push(captureState(layout, 'Tool stack before close', 'Search + Git + Chat + Logs'))

  layout = closeSurface(layout, git.id)
  states.push(
    captureState(layout, 'Tool stack after close Git', 'close Git -> remaining stack rebalances'),
  )

  return states
}

function draggedFilesReopenWithSearchStates(): readonly DiagramState[] {
  const editor = engine.builders.createFileEditorSurface({ path: '/repo/src/drag-target.ts' })
  const files = engine.builders.createFileNavigatorSurface()
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(layout, editor)
  layout = openSurface(layout, engine.builders.createSearchResultsSurface())
  layout = openSurface(layout, files)
  layout = moveSurfaceToEditorCenter(layout, files.id, editor.id)
  states.push(captureState(layout, 'Files in editor zone', 'drag Files -> editor window-center'))

  layout = closeSurface(layout, files.id)
  states.push(captureState(layout, 'Files closed', 'Search still exists in primary-side'))

  layout = openSurface(layout, files)
  states.push(captureState(layout, 'Files reopened', 'sticky center beats primary-side recipe'))

  return states
}

function problemsWithBottomAndSplitEditorsStates(): readonly DiagramState[] {
  const fileA = engine.builders.createFileEditorSurface({ path: '/repo/src/left.ts' })
  const fileB = engine.builders.createFileEditorSurface({ path: '/repo/src/right.ts' })
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(layout, fileA)
  layout = openSurface(layout, engine.builders.createTerminalSurface({ sessionId: 'terminal-1' }))
  layout = openSurface(layout, fileB)
  layout = splitSurfaceRight(layout, fileA.id, fileB.id)
  states.push(captureState(layout, 'Bottom + split editors', 'Terminal bottom, two editor groups'))

  layout = openSurface(layout, engine.builders.createDiagnosticsSurface())
  states.push(captureState(layout, 'Problems opened', 'bottom slot exists -> tab, no split'))

  return states
}

function resizedGitThenChatStates(): readonly DiagramState[] {
  const git = engine.builders.createGitChangesSurface()
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(
    layout,
    engine.builders.createFileEditorSurface({ path: '/repo/src/git.ts' }),
  )
  layout = openSurface(layout, engine.builders.createFileNavigatorSurface())
  layout = openSurface(layout, git)
  layout = resizeSurfaceShare(layout, git.id, 320)
  states.push(
    captureState(layout, 'Git manually tall', 'resizeSplit -> Git gets taller side share'),
  )

  layout = openSurface(layout, engine.builders.createChatSurface())
  states.push(captureState(layout, 'Chat opens under Git', 'same slot -> split Git current share'))

  return states
}

function terminalFirstThenEditorStates(): readonly DiagramState[] {
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(
    layout,
    engine.builders.createTerminalSurface({ sessionId: 'terminal-first' }),
  )
  states.push(captureState(layout, 'Terminal first', 'empty -> bottom surface becomes root'))

  layout = openSurface(
    layout,
    engine.builders.createPlaceholderSurface({
      contextKey: 'terminal-first-empty-editor',
      title: 'Empty editor',
    }),
  )
  states.push(
    captureState(layout, 'Then open editor', 'editor-center placeholder after bottom-first root'),
  )

  layout = openSurface(
    layout,
    engine.builders.createFileEditorSurface({ path: '/repo/src/after-terminal.ts' }),
  )
  states.push(captureState(layout, 'Then open a file', 'file-editor opens into editor-center'))

  layout = openSurface(layout, engine.builders.createSearchResultsSurface())
  layout = openSurface(layout, engine.builders.createGitChangesSurface())
  states.push(
    captureState(layout, 'Then open Search + Git', 'primary + secondary after terminal-first root'),
  )

  return states
}

function busyFinalLayout(): WorkspaceLayout {
  const fileA = engine.builders.createFileEditorSurface({ path: '/repo/src/app.ts' })
  const fileB = engine.builders.createFileEditorSurface({ path: '/repo/src/router.ts' })
  let layout = engine.builders.createEmptyWorkspaceLayout()

  layout = openSurface(layout, fileA)
  layout = openSurface(layout, engine.builders.createFileNavigatorSurface())
  layout = openSurface(layout, engine.builders.createTerminalSurface({ sessionId: 'terminal-1' }))
  layout = openSurface(layout, fileB)
  layout = splitSurfaceRight(layout, fileA.id, fileB.id)
  layout = openSurface(layout, engine.builders.createGitChangesSurface())
  layout = openSurface(layout, engine.builders.createChatSurface())
  layout = openSurface(layout, engine.builders.createLogsSurface())
  layout = openSurface(layout, engine.builders.createDiagnosticsSurface())
  layout = openSurface(
    layout,
    engine.builders.createTerminalSurface({ sessionId: 'terminal-2', title: 'Terminal 2' }),
  )

  return layout
}

function clickRailSurface(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  const item = engine.rail
    .selectWorkbenchRailSurfaceItems(layout)
    .find((candidate: { readonly surface: Surface }) => candidate.surface.id === surfaceId)
  if (!item) throw new Error(`Expected rail item for ${surfaceId}`)

  return engine.operations.applyLayoutOperation(layout, engine.rail.railItemOperation(layout, item))
}

function closeSurface(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  return engine.operations.applyLayoutOperation(layout, { surfaceId, type: 'closeSurface' })
}

function moveSurfaceToEditorCenter(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  editorSurfaceId: SurfaceId,
): WorkspaceLayout {
  const editorWindowId = mustFindWindowId(layout, editorSurfaceId)

  return engine.operations.applyLayoutOperation(layout, {
    destination: {
      kind: 'window-center',
      windowId: editorWindowId,
    },
    surfaceId,
    type: 'moveSurface',
  } satisfies LayoutOperation)
}

function resizeSurfaceShare(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  amountPx: number,
): WorkspaceLayout {
  const windowId = mustFindWindowId(layout, surfaceId)
  const nodeId = engine.normalize.findNodeIdForWindow(layout, windowId)
  if (!nodeId) throw new Error(`Expected node for ${surfaceId}`)

  const parentNodeId = engine.normalize.findParentNodeId(layout, nodeId)
  if (!parentNodeId) throw new Error(`Expected parent split for ${surfaceId}`)

  const split = layout.nodesById[parentNodeId]
  if (split?.kind !== 'split') throw new Error(`Expected split parent for ${surfaceId}`)

  const nodeIndex = split.childIds.indexOf(nodeId)
  if (nodeIndex < 0) throw new Error(`Expected split child for ${surfaceId}`)

  return engine.operations.applyLayoutOperation(layout, {
    deltaPx: resizeDeltaForChildIndex(nodeIndex, amountPx),
    handleIndex: resizeHandleIndexForChildIndex(nodeIndex),
    splitId: parentNodeId,
    type: 'resizeSplit',
  })
}

function resizeHandleIndexForChildIndex(index: number) {
  if (index === 0) return 0

  return index - 1
}

function resizeDeltaForChildIndex(index: number, amountPx: number) {
  if (index === 0) return amountPx

  return -amountPx
}

function openSurface(layout: WorkspaceLayout, surface: Surface): WorkspaceLayout {
  return engine.operations.applyLayoutOperation(layout, { surface, type: 'openSurface' })
}

function splitSurfaceRight(
  layout: WorkspaceLayout,
  anchorSurfaceId: SurfaceId,
  surfaceId: SurfaceId,
): WorkspaceLayout {
  const targetWindowId = mustFindWindowId(layout, anchorSurfaceId)

  return engine.operations.applyLayoutOperation(layout, {
    edge: 'right',
    surfaceId,
    type: 'splitWindow',
    windowId: targetWindowId,
  })
}

function moveSurfaceToEditorRight(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  editorSurfaceId: SurfaceId,
): WorkspaceLayout {
  const editorWindowId = mustFindWindowId(layout, editorSurfaceId)

  return engine.operations.applyLayoutOperation(layout, {
    destination: {
      edge: 'right',
      kind: 'window-edge',
      windowId: editorWindowId,
    },
    surfaceId,
    type: 'moveSurface',
  } satisfies LayoutOperation)
}

function mustFindWindowId(layout: WorkspaceLayout, surfaceId: SurfaceId): WindowId {
  const windowId = engine.normalize.findWindowIdContainingSurface(layout, surfaceId)
  if (windowId) return windowId

  throw new Error(`Expected ${surfaceId} to be visible`)
}

function captureState(layout: WorkspaceLayout, title: string, transition: string): DiagramState {
  if (!engine.selectors.selectMaterializedLayoutTree(layout)) {
    throw new Error(`Expected materialized layout tree for ${title}`)
  }

  return { layout, title, transition }
}

function buildDiagram(groups: readonly DiagramGroup[]) {
  const builder = new DiagramBuilder()
  const mainGroup = groups[0]
  if (!mainGroup) throw new Error('Expected main diagram group')

  drawHeader(builder)
  drawMainStates(builder, mainGroup.states)
  drawScenarioGroups(builder, groups.slice(1))

  return {
    appState: { gridSize: 20, viewBackgroundColor: '#ffffff' },
    elements: builder.elements,
    files: {},
    source: 'https://excalidraw.com',
    type: 'excalidraw',
    version: 2,
  }
}

function drawHeader(builder: DiagramBuilder) {
  builder.addText('Workbench tiling layout evolution', 120, 44, {
    fontSize: 30,
    strokeColor: '#e8590c',
  })
  builder.addText(
    'All pane rectangles are derived from deriveNodeRects() + deriveWindowRects(); placement priority is sticky memory -> surface hint -> recipe slot.',
    120,
    86,
    { fontSize: 16, strokeColor: '#868e96' },
  )
  drawLegend(builder, 120, 122)
}

function drawLegend(builder: DiagramBuilder, x: number, y: number) {
  const recipe = engine.builders.classicWorkspaceRecipe()
  builder.addText(`${recipe.title} recipe slots`, x, y, {
    fontSize: 16,
    strokeColor: '#e8590c',
  })

  const slots: readonly WorkspaceRecipeSlot[] = [
    'editor-center',
    'primary-side',
    'secondary-side',
    'bottom',
  ]

  slots.forEach((slot, index) => {
    const style = SLOT_STYLES[slot]
    const itemX = x + index * 290
    builder.addRect({ height: 28, width: 34, x: itemX, y: y + 32 }, style)
    builder.addText(style.label, itemX + 44, y + 36, {
      fontSize: 13,
      strokeColor: style.strokeColor,
    })
  })
}

function drawMainStates(builder: DiagramBuilder, states: readonly DiagramState[]) {
  states.forEach((state, index) => {
    const position = mainStatePosition(index)
    drawState(builder, state, position)
  })

  for (let index = 1; index < states.length; index += 1) {
    drawTransitionArrow(
      builder,
      mainStatePosition(index - 1),
      mainStatePosition(index),
      states[index],
    )
  }
}

function drawScenarioGroups(builder: DiagramBuilder, groups: readonly DiagramGroup[]) {
  groups.forEach((group, index) => {
    drawScenarioGroup(builder, group, 1280 + index * 520)
  })
}

function drawScenarioGroup(builder: DiagramBuilder, group: DiagramGroup, y: number) {
  builder.addText(group.title, 120, y, {
    fontSize: 24,
    strokeColor: '#e8590c',
  })
  if (group.description) {
    builder.addText(group.description, 120, y + 34, {
      fontSize: 15,
      strokeColor: '#868e96',
      width: 1120,
    })
  }

  group.states.forEach((state, index) => {
    const position = scenarioStatePosition(index, y)
    drawState(builder, state, position)
  })

  for (let index = 1; index < group.states.length; index += 1) {
    drawTransitionArrow(
      builder,
      scenarioStatePosition(index - 1, y),
      scenarioStatePosition(index, y),
      group.states[index],
    )
  }
}

function mainStatePosition(index: number): Point {
  const column = index % 4
  const row = Math.floor(index / 4)

  return {
    x: 120 + column * 720,
    y: 230 + row * 520,
  }
}

function scenarioStatePosition(index: number, groupY: number): Point {
  return {
    x: 120 + index * 720,
    y: groupY + 88,
  }
}

function drawTransitionArrow(builder: DiagramBuilder, from: Point, to: Point, state: DiagramState) {
  if (from.y === to.y) {
    drawHorizontalTransition(builder, from, to, state.transition ?? '')
    return
  }

  drawVerticalTransition(builder, from, to, state.transition ?? '')
}

function drawHorizontalTransition(
  builder: DiagramBuilder,
  from: Point,
  to: Point,
  caption: string,
) {
  const start = { x: from.x + FRAME_WIDTH + 16, y: from.y + FRAME_HEIGHT / 2 }
  const end = { x: to.x - 24, y: to.y + FRAME_HEIGHT / 2 }
  builder.addArrow(start, end, { strokeColor: '#868e96' })
  builder.addText(caption, start.x + 10, start.y - 34, {
    fontSize: 12,
    strokeColor: '#868e96',
    width: Math.max(120, end.x - start.x - 20),
  })
}

function drawVerticalTransition(builder: DiagramBuilder, from: Point, to: Point, caption: string) {
  const start = { x: from.x + FRAME_WIDTH / 2, y: from.y + FRAME_HEIGHT + 20 }
  const end = { x: to.x + FRAME_WIDTH / 2, y: to.y - 28 }
  builder.addArrow(start, end, { strokeColor: '#868e96' })
  builder.addText(caption, start.x + 20, start.y + 36, {
    fontSize: 12,
    strokeColor: '#868e96',
    width: 360,
  })
}

function drawState(builder: DiagramBuilder, state: DiagramState, position: Point) {
  const frame = { height: FRAME_HEIGHT, width: FRAME_WIDTH, x: position.x, y: position.y }
  const rootRect = contentRectForFrame(frame)
  const nodeRects = engine.geometry.deriveNodeRects(state.layout, rootRect, { gapPx: CONTENT_GAP })
  const windowRects = engine.geometry.deriveWindowRects(state.layout, nodeRects)

  builder.addText(state.title, position.x, position.y - 34, {
    fontSize: 17,
    strokeColor: '#212529',
  })
  drawWindowFrame(builder, frame, state)

  for (const windowId of engine.normalize.visibleWindowIdsInOrder(state.layout)) {
    const windowRect = windowRects[windowId]
    if (!windowRect) continue

    drawPane(builder, state.layout, windowRect.rect, windowId, windowRect.nodeId)
  }
}

function contentRectForFrame(frame: LayoutRect): LayoutRect {
  return {
    height: frame.height - TITLE_BAR_HEIGHT - WINDOW_PADDING * 2,
    width: frame.width - RAIL_WIDTH - WINDOW_PADDING * 2,
    x: frame.x + RAIL_WIDTH + WINDOW_PADDING,
    y: frame.y + TITLE_BAR_HEIGHT + WINDOW_PADDING,
  }
}

function drawWindowFrame(builder: DiagramBuilder, frame: LayoutRect, state: DiagramState) {
  builder.addRect(frame, {
    backgroundColor: 'transparent',
    strokeColor: '#1e1e1e',
    strokeWidth: 2,
  })
  builder.addRect(
    { height: 1, width: frame.width - 20, x: frame.x + 10, y: frame.y + TITLE_BAR_HEIGHT },
    { backgroundColor: '#1e1e1e', roundness: null, strokeColor: '#1e1e1e', strokeWidth: 1 },
  )
  drawActivityRail(builder, frame, state.layout)
}

function drawActivityRail(builder: DiagramBuilder, frame: LayoutRect, layout: WorkspaceLayout) {
  const railRect = {
    height: frame.height - TITLE_BAR_HEIGHT - WINDOW_PADDING,
    width: RAIL_WIDTH - 10,
    x: frame.x + WINDOW_PADDING,
    y: frame.y + TITLE_BAR_HEIGHT + 6,
  }
  builder.addRect(railRect, {
    backgroundColor: 'transparent',
    strokeColor: '#1e1e1e',
    strokeWidth: 2,
  })

  const icons = activityIcons(layout)
  icons.forEach((icon, index) => {
    const y = railRect.y + 14 + index * 31
    drawActivityIcon(builder, railRect.x + 7, y, icon)
  })
}

function activityIcons(layout: WorkspaceLayout) {
  return [
    activityIcon(layout, 'F', 'file-navigator', 'primary-side'),
    activityIcon(layout, 'G', 'git-changes', 'secondary-side'),
    activityIcon(layout, 's', 'search-results', 'primary-side'),
    activityIcon(layout, 'T', 'terminal', 'bottom'),
  ] as const
}

function activityIcon(
  layout: WorkspaceLayout,
  letter: string,
  type: SurfaceType,
  slot: WorkspaceRecipeSlot,
) {
  return {
    letter,
    minimized: hasRailSurfaceType(layout, type),
    slot,
    visible: hasVisibleSurfaceType(layout, type),
  }
}

function drawActivityIcon(
  builder: DiagramBuilder,
  x: number,
  y: number,
  icon: ReturnType<typeof activityIcon>,
) {
  const style = SLOT_STYLES[icon.slot]
  const backgroundColor = icon.visible ? style.backgroundColor : 'transparent'
  const strokeColor = icon.visible || icon.minimized ? style.strokeColor : '#1e1e1e'

  builder.addRect({ height: 19, width: 20, x, y }, { backgroundColor, strokeColor })
  builder.addText(icon.letter, x + 6, y + 1, {
    fontSize: 13,
    strokeColor,
  })
}

function hasVisibleSurfaceType(layout: WorkspaceLayout, type: SurfaceType) {
  for (const windowId of engine.normalize.visibleWindowIdsInOrder(layout)) {
    const window = layout.windowsById[windowId]
    if (!windowContainsType(layout, window?.surfaceIds ?? [], type)) continue

    return true
  }

  return false
}

function hasRailSurfaceType(layout: WorkspaceLayout, type: SurfaceType) {
  const railSurfaceIds = [
    ...layout.rail.minimizedSurfaceIds,
    ...layout.rail.runningSurfaceIds,
    ...layout.rail.pinnedSurfaceIds,
  ]

  return windowContainsType(layout, railSurfaceIds, type)
}

function windowContainsType(
  layout: WorkspaceLayout,
  surfaceIds: readonly SurfaceId[],
  type: SurfaceType,
) {
  for (const surfaceId of surfaceIds) {
    const surface = layout.surfacesById[surfaceId]
    if (surface?.type !== type) continue

    return true
  }

  return false
}

function drawPane(
  builder: DiagramBuilder,
  layout: WorkspaceLayout,
  rect: LayoutRect,
  windowId: WindowId,
  nodeId: string,
) {
  if (rect.width <= 0 || rect.height <= 0) return

  const window = layout.windowsById[windowId]
  if (!window) return

  const slot = slotForSurface(layout, window.activeSurfaceId)
  const style = SLOT_STYLES[slot]
  builder.addRect(
    rect,
    {
      backgroundColor: style.backgroundColor,
      strokeColor: style.strokeColor,
      strokeWidth: activeWindowStrokeWidth(layout, windowId),
    },
    {
      nodeId,
      source: 'deriveWindowRects',
      surfaceIds: window.surfaceIds,
      windowId,
    },
  )
  drawTabs(builder, layout, rect, window)
  drawActivePaneLabel(builder, layout, rect, window.activeSurfaceId, style)
}

function activeWindowStrokeWidth(layout: WorkspaceLayout, windowId: WindowId) {
  if (layout.activeWindowId === windowId) return 3

  return 2
}

function slotForSurface(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceRecipeSlot {
  const surface = layout.surfacesById[surfaceId]
  if (!surface) return 'editor-center'

  return (
    layout.recipesById[layout.activeRecipeId]?.surfaceSlots[surface.type] ??
    surface.capabilities.defaultRecipeSlot
  )
}

function drawTabs(
  builder: DiagramBuilder,
  layout: WorkspaceLayout,
  rect: LayoutRect,
  window: WorkspaceLayout['windowsById'][WindowId],
) {
  const tabHeight = Math.min(22, Math.max(14, rect.height * 0.24))
  const tabWidth = rect.width / Math.max(1, window.surfaceIds.length)

  window.surfaceIds.forEach((surfaceId, index) => {
    const slot = slotForSurface(layout, surfaceId)
    const style = SLOT_STYLES[slot]
    const active = surfaceId === window.activeSurfaceId
    const tabRect = {
      height: tabHeight,
      width: tabWidth,
      x: rect.x + index * tabWidth,
      y: rect.y,
    }
    builder.addRect(tabRect, {
      backgroundColor: active ? style.backgroundColor : 'transparent',
      strokeColor: style.strokeColor,
      strokeWidth: active ? 2 : 1,
    })
    builder.addText(surfaceIdLabel(surfaceId), tabRect.x + 5, tabRect.y + 4, {
      fontSize: 8,
      strokeColor: style.strokeColor,
      width: Math.max(20, tabRect.width - 8),
    })
  })
}

function drawActivePaneLabel(
  builder: DiagramBuilder,
  layout: WorkspaceLayout,
  rect: LayoutRect,
  surfaceId: SurfaceId,
  style: SlotStyle,
) {
  if (rect.width < 54 || rect.height < 48) return

  const surface = layout.surfacesById[surfaceId]
  const label = surface?.title ?? surfaceIdLabel(surfaceId)
  const fontSize = rect.width < 90 ? 10 : 14
  const textWidth = Math.max(38, rect.width - 18)
  const textHeight = fontSize * 1.25

  builder.addText(label, rect.x + 9, rect.y + rect.height / 2 - textHeight / 2, {
    fontSize,
    strokeColor: style.strokeColor,
    width: textWidth,
  })
}

function surfaceIdLabel(surfaceId: SurfaceId) {
  const rawId = String(surfaceId)
  const match = /^surface:([^:]+):(.*)$/.exec(rawId)
  if (!match) return rawId

  return compactSurfaceLabel(match[1], decodeURIComponent(match[2] ?? ''))
}

function compactSurfaceLabel(type: string, key: string) {
  if (type === 'file-editor') return `file:${path.basename(key)}`
  if (type === 'file-navigator') return 'files'
  if (type === 'git-changes') return 'git'
  if (type === 'search-results') return 'search'
  if (type === 'diagnostics') return 'problems'
  if (type === 'terminal') return `term:${key.replace(/^terminal-/, '')}`

  return type
}

class DiagramBuilder {
  readonly elements: DiagramElement[] = []

  private counter = 0

  // The Excalidraw helper's main export pulls browser modules that this script
  // does not need, so this mirrors the generated element JSON directly.
  addRect(rect: LayoutRect, style: RectStyle = {}, customData?: Record<string, unknown>) {
    this.elements.push({
      ...this.baseElement('rectangle', rect, style),
      customData,
      type: 'rectangle',
    })
  }

  addText(
    text: string,
    x: number,
    y: number,
    options: {
      readonly fontSize?: number
      readonly strokeColor?: string
      readonly width?: number
    } = {},
  ) {
    const fontSize = options.fontSize ?? 14
    const size = textSize(text, fontSize, options.width)
    this.elements.push({
      ...this.baseElement(
        'text',
        { height: size.height, width: size.width, x, y },
        {
          backgroundColor: 'transparent',
          roughness: 1,
          roundness: null,
          strokeColor: options.strokeColor ?? '#1e1e1e',
          strokeWidth: 1,
        },
      ),
      autoResize: options.width === undefined,
      containerId: null,
      fontFamily: FONT_FAMILY,
      fontSize,
      lineHeight: 1.25,
      originalText: text,
      text,
      textAlign: 'left',
      type: 'text',
      verticalAlign: 'top',
    })
  }

  addArrow(from: Point, to: Point, style: RectStyle = {}) {
    const width = to.x - from.x
    const height = to.y - from.y
    this.elements.push({
      ...this.baseElement(
        'arrow',
        { height, width, x: from.x, y: from.y },
        {
          backgroundColor: 'transparent',
          roundness: { type: 2 },
          strokeColor: style.strokeColor ?? '#868e96',
          strokeWidth: style.strokeWidth ?? 2,
        },
      ),
      elbowed: false,
      endArrowhead: 'arrow',
      endBinding: null,
      lastCommittedPoint: null,
      points: [
        [0, 0],
        [width, height],
      ],
      startArrowhead: null,
      startBinding: null,
      type: 'arrow',
    })
  }

  private baseElement(type: string, rect: LayoutRect, style: RectStyle) {
    const id = stableElementId(type, this.counter)
    const index = `a${this.counter.toString(36)}`
    this.counter += 1

    return {
      angle: 0,
      backgroundColor: style.backgroundColor ?? 'transparent',
      boundElements: [],
      fillStyle: 'solid',
      frameId: null,
      groupIds: [],
      height: rect.height,
      id,
      index,
      isDeleted: false,
      link: null,
      locked: false,
      opacity: style.opacity ?? 100,
      roughness: style.roughness ?? 1,
      roundness: style.roundness === undefined ? { type: 3 } : style.roundness,
      seed: stableSeed(id),
      strokeColor: style.strokeColor ?? '#1e1e1e',
      strokeStyle: 'solid',
      strokeWidth: style.strokeWidth ?? 2,
      updated: UPDATED_AT,
      version: 1,
      versionNonce: stableSeed(`${id}:nonce`),
      width: rect.width,
      x: rect.x,
      y: rect.y,
    }
  }
}

function textSize(text: string, fontSize: number, width?: number) {
  const lines = text.split('\n')
  const longestLine = lines.reduce((longest, line) => Math.max(longest, line.length), 0)
  const measuredWidth = Math.max(1, longestLine * fontSize * 0.56)

  return {
    height: Math.max(fontSize * 1.25, lines.length * fontSize * 1.25),
    width: width ?? measuredWidth,
  }
}

function stableElementId(type: string, index: number) {
  return `layout-evolution-${type}-${index.toString(36).padStart(4, '0')}`
}

function stableSeed(input: string) {
  let hash = 2_166_136_261

  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 16_777_619)
  }

  return ((hash >>> 0) % 2_147_483_646) + 1
}
