import { createClientInvariantError } from '@/lib/structured-errors'

import type {
  LayoutOperation,
  Surface,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

import type { DiagramGroup, DiagramState, Engine } from './renderer'

export function buildDiagramGroups(engine: Engine): readonly DiagramGroup[] {
  return [
    {
      states: mainEvolutionStates(engine),
      title: 'Workbench tiling layout evolution',
    },
    {
      description:
        'Rail-clicking visible Files collapses it; Search stays in the left tool-pane group.',
      states: spatialMemoryStates(engine),
      title: '1. Memory C, click Files again',
    },
    {
      description: 'Closing Files repairs the tool column using the remaining Git/Chat/Logs stack.',
      states: busyCloseFilesStates(engine),
      title: '2. Busy final, close Files',
    },
    {
      description: 'Closing Git removes its node and the remaining secondary stack rebalances.',
      states: closeGitFromToolStackStates(engine),
      title: '3. Search + Git + Chat + Logs, close Git',
    },
    {
      description:
        'Dragging Files into the editor records sticky center placement, so reopening ignores Search.',
      states: draggedFilesReopenWithSearchStates(engine),
      title: '4. Drag Files into editor, close, reopen',
    },
    {
      description: 'Problems targets the existing bottom slot, so it becomes a bottom tab.',
      states: problemsWithBottomAndSplitEditorsStates(engine),
      title: '5. Bottom dock + split editors, open Problems',
    },
    {
      description: 'Chat opens under the resized Git window and splits Git current tall share.',
      states: resizedGitThenChatStates(engine),
      title: '6. Resize Git tall, then open Chat',
    },
    {
      description:
        'Terminal is the first root surface; opening an editor afterward should move content above it instead of hiding or tabbing into the bottom pane.',
      states: terminalFirstThenEditorStates(engine),
      title: '7. Terminal first, then editor',
    },
  ]
}

// The main-evolution group's final entry is the richest single layout, so the
// generator reuses it for the ASCII console preview.
export function previewState(groups: readonly DiagramGroup[]): DiagramState {
  const main = groups[0]
  const state = main?.states.at(-1)
  if (!state) throw createClientInvariantError('Expected a main-evolution state to preview')

  return state
}

function mainEvolutionStates(engine: Engine): readonly DiagramState[] {
  const fileA = engine.builders.createFileEditorSurface({ path: '/repo/src/app.ts' })
  const fileB = engine.builders.createFileEditorSurface({ path: '/repo/src/router.ts' })
  const terminalOne = engine.builders.createTerminalSurface({ sessionId: 'terminal-1' })
  const terminalTwo = engine.builders.createTerminalSurface({
    sessionId: 'terminal-2',
    title: 'Terminal 2',
  })
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(engine, layout, fileA)
  states.push(
    captureState(engine, layout, '1. One editor', 'open file-editor -> editor-center root'),
  )

  layout = openSurface(engine, layout, engine.builders.createFileNavigatorSurface())
  states.push(captureState(engine, layout, '2. Files | Editor', 'left-tool-pane -> left root edge'))

  layout = openSurface(engine, layout, terminalOne)
  states.push(captureState(engine, layout, '3. Bottom dock', 'slot=bottom -> wrap root in V-split'))

  layout = openSurface(engine, layout, fileB)
  states.push(captureState(engine, layout, '4. Editor tab', 'editor-center is multi -> new TAB'))

  layout = splitSurfaceRight(engine, layout, fileA.id, fileB.id)
  states.push(
    captureState(engine, layout, '5. Split editor', 'splitWindow right -> editor H-split'),
  )

  layout = openSurface(engine, layout, engine.builders.createGitChangesSurface())
  states.push(
    captureState(engine, layout, '6. Git dock', 'left-tool-pane -> balanced columns by arrival'),
  )

  layout = openSurface(engine, layout, engine.builders.createChatSurface())
  layout = openSurface(engine, layout, engine.builders.createLogsSurface())
  states.push(
    captureState(engine, layout, '7. Secondary grid', 'same slot -> fill shortest column'),
  )

  layout = openSurface(engine, layout, engine.builders.createDiagnosticsSurface())
  layout = openSurface(engine, layout, terminalTwo)
  states.push(
    captureState(
      engine,
      layout,
      '8. Busy final state',
      'bottom exists -> Problems + Terminal tabs',
    ),
  )

  return states
}

function spatialMemoryStates(engine: Engine): readonly DiagramState[] {
  const editor = engine.builders.createFileEditorSurface({ path: '/repo/src/memory.ts' })
  const files = engine.builders.createFileNavigatorSurface()
  const search = engine.builders.createSearchResultsSurface()
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(engine, layout, editor)
  layout = openSurface(engine, layout, files)
  layout = moveSurfaceToEditorRight(engine, layout, files.id, editor.id)
  states.push(
    captureState(engine, layout, 'Memory A. Files moved', 'moveSurface right -> sticky recorded'),
  )

  layout = clickRailSurface(engine, layout, files.id)
  layout = openSurface(engine, layout, search)
  states.push(
    captureState(
      engine,
      layout,
      'Memory B. Search opens',
      'Files minimized; Search uses recipe slot',
    ),
  )

  layout = openSurface(engine, layout, files)
  states.push(
    captureState(engine, layout, 'Memory C. Files restored', 'sticky placement wins over recipe'),
  )

  layout = clickRailSurface(engine, layout, files.id)
  states.push(
    captureState(engine, layout, 'Memory D. Files clicked', 'visible rail item -> minimize Files'),
  )

  return states
}

function busyCloseFilesStates(engine: Engine): readonly DiagramState[] {
  const files = engine.builders.createFileNavigatorSurface()
  let layout = busyFinalLayout(engine)
  const states: DiagramState[] = []

  states.push(captureState(engine, layout, 'Before close Files', 'busy final state'))

  layout = closeSurface(engine, layout, files.id)
  states.push(
    captureState(engine, layout, 'After close Files', 'closeSurface Files -> repair side stack'),
  )

  return states
}

function closeGitFromToolStackStates(engine: Engine): readonly DiagramState[] {
  const git = engine.builders.createGitChangesSurface()
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(engine, layout, engine.builders.createSearchResultsSurface())
  layout = openSurface(engine, layout, git)
  layout = openSurface(engine, layout, engine.builders.createChatSurface())
  layout = openSurface(engine, layout, engine.builders.createLogsSurface())
  states.push(captureState(engine, layout, 'Tool stack before close', 'Search + Git + Chat + Logs'))

  layout = closeSurface(engine, layout, git.id)
  states.push(
    captureState(
      engine,
      layout,
      'Tool stack after close Git',
      'close Git -> remaining stack rebalances',
    ),
  )

  return states
}

function draggedFilesReopenWithSearchStates(engine: Engine): readonly DiagramState[] {
  const editor = engine.builders.createFileEditorSurface({ path: '/repo/src/drag-target.ts' })
  const files = engine.builders.createFileNavigatorSurface()
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(engine, layout, editor)
  layout = openSurface(engine, layout, engine.builders.createSearchResultsSurface())
  layout = openSurface(engine, layout, files)
  layout = moveSurfaceToEditorCenter(engine, layout, files.id, editor.id)
  states.push(
    captureState(engine, layout, 'Files in editor zone', 'drag Files -> editor window-center'),
  )

  layout = closeSurface(engine, layout, files.id)
  states.push(
    captureState(engine, layout, 'Files closed', 'Search still exists in the left tool-pane'),
  )

  layout = openSurface(engine, layout, files)
  states.push(
    captureState(engine, layout, 'Files reopened', 'sticky center beats left tool-pane recipe'),
  )

  return states
}

function problemsWithBottomAndSplitEditorsStates(engine: Engine): readonly DiagramState[] {
  const fileA = engine.builders.createFileEditorSurface({ path: '/repo/src/left.ts' })
  const fileB = engine.builders.createFileEditorSurface({ path: '/repo/src/right.ts' })
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(engine, layout, fileA)
  layout = openSurface(
    engine,
    layout,
    engine.builders.createTerminalSurface({ sessionId: 'terminal-1' }),
  )
  layout = openSurface(engine, layout, fileB)
  layout = splitSurfaceRight(engine, layout, fileA.id, fileB.id)
  states.push(
    captureState(engine, layout, 'Bottom + split editors', 'Terminal bottom, two editor groups'),
  )

  layout = openSurface(engine, layout, engine.builders.createDiagnosticsSurface())
  states.push(
    captureState(engine, layout, 'Problems opened', 'bottom slot exists -> tab, no split'),
  )

  return states
}

function resizedGitThenChatStates(engine: Engine): readonly DiagramState[] {
  const git = engine.builders.createGitChangesSurface()
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(
    engine,
    layout,
    engine.builders.createFileEditorSurface({ path: '/repo/src/git.ts' }),
  )
  layout = openSurface(engine, layout, engine.builders.createFileNavigatorSurface())
  layout = openSurface(engine, layout, git)
  layout = resizeSurfaceShare(engine, layout, git.id, 320)
  states.push(
    captureState(engine, layout, 'Git manually tall', 'resizeSplit -> Git gets taller side share'),
  )

  layout = openSurface(engine, layout, engine.builders.createChatSurface())
  states.push(
    captureState(engine, layout, 'Chat opens under Git', 'same slot -> split Git current share'),
  )

  return states
}

function terminalFirstThenEditorStates(engine: Engine): readonly DiagramState[] {
  let layout = engine.builders.createEmptyWorkspaceLayout()
  const states: DiagramState[] = []

  layout = openSurface(
    engine,
    layout,
    engine.builders.createTerminalSurface({ sessionId: 'terminal-first' }),
  )
  states.push(
    captureState(engine, layout, 'Terminal first', 'empty -> bottom surface becomes root'),
  )

  layout = openSurface(
    engine,
    layout,
    engine.builders.createPlaceholderSurface({
      contextKey: 'terminal-first-empty-editor',
      title: 'Empty editor',
    }),
  )
  states.push(
    captureState(
      engine,
      layout,
      'Then open editor',
      'editor-center placeholder after bottom-first root',
    ),
  )

  layout = openSurface(
    engine,
    layout,
    engine.builders.createFileEditorSurface({ path: '/repo/src/after-terminal.ts' }),
  )
  states.push(
    captureState(engine, layout, 'Then open a file', 'file-editor opens into editor-center'),
  )

  layout = openSurface(engine, layout, engine.builders.createSearchResultsSurface())
  layout = openSurface(engine, layout, engine.builders.createGitChangesSurface())
  states.push(
    captureState(
      engine,
      layout,
      'Then open Search + Git',
      'primary + secondary after terminal-first root',
    ),
  )

  return states
}

function busyFinalLayout(engine: Engine): WorkspaceLayout {
  const fileA = engine.builders.createFileEditorSurface({ path: '/repo/src/app.ts' })
  const fileB = engine.builders.createFileEditorSurface({ path: '/repo/src/router.ts' })
  let layout = engine.builders.createEmptyWorkspaceLayout()

  layout = openSurface(engine, layout, fileA)
  layout = openSurface(engine, layout, engine.builders.createFileNavigatorSurface())
  layout = openSurface(
    engine,
    layout,
    engine.builders.createTerminalSurface({ sessionId: 'terminal-1' }),
  )
  layout = openSurface(engine, layout, fileB)
  layout = splitSurfaceRight(engine, layout, fileA.id, fileB.id)
  layout = openSurface(engine, layout, engine.builders.createGitChangesSurface())
  layout = openSurface(engine, layout, engine.builders.createChatSurface())
  layout = openSurface(engine, layout, engine.builders.createLogsSurface())
  layout = openSurface(engine, layout, engine.builders.createDiagnosticsSurface())
  layout = openSurface(
    engine,
    layout,
    engine.builders.createTerminalSurface({ sessionId: 'terminal-2', title: 'Terminal 2' }),
  )

  return layout
}

function clickRailSurface(
  engine: Engine,
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
): WorkspaceLayout {
  const item = engine.rail
    .selectWorkbenchRailSurfaceItems(layout)
    .find((candidate) => candidate.surface.id === surfaceId)
  if (!item) throw createClientInvariantError(`Expected rail item for ${surfaceId}`)

  return engine.operations.applyLayoutOperation(layout, engine.rail.railItemOperation(layout, item))
}

function closeSurface(
  engine: Engine,
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
): WorkspaceLayout {
  return engine.operations.applyLayoutOperation(layout, { surfaceId, type: 'closeSurface' })
}

function moveSurfaceToEditorCenter(
  engine: Engine,
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  editorSurfaceId: SurfaceId,
): WorkspaceLayout {
  const editorWindowId = mustFindWindowId(engine, layout, editorSurfaceId)

  return engine.operations.applyLayoutOperation(layout, {
    destination: { kind: 'window-center', windowId: editorWindowId },
    surfaceId,
    type: 'moveSurface',
  } satisfies LayoutOperation)
}

function moveSurfaceToEditorRight(
  engine: Engine,
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  editorSurfaceId: SurfaceId,
): WorkspaceLayout {
  const editorWindowId = mustFindWindowId(engine, layout, editorSurfaceId)

  return engine.operations.applyLayoutOperation(layout, {
    destination: { edge: 'right', kind: 'window-edge', windowId: editorWindowId },
    surfaceId,
    type: 'moveSurface',
  } satisfies LayoutOperation)
}

function resizeSurfaceShare(
  engine: Engine,
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  amountPx: number,
): WorkspaceLayout {
  const windowId = mustFindWindowId(engine, layout, surfaceId)
  const nodeId = engine.normalize.findNodeIdForWindow(layout, windowId)
  if (!nodeId) throw createClientInvariantError(`Expected node for ${surfaceId}`)

  const parentNodeId = engine.normalize.findParentNodeId(layout, nodeId)
  if (!parentNodeId) throw createClientInvariantError(`Expected parent split for ${surfaceId}`)

  const split = layout.nodesById[parentNodeId]
  if (split?.kind !== 'split')
    throw createClientInvariantError(`Expected split parent for ${surfaceId}`)

  const nodeIndex = split.childIds.indexOf(nodeId)
  if (nodeIndex < 0) throw createClientInvariantError(`Expected split child for ${surfaceId}`)

  return engine.operations.applyLayoutOperation(layout, {
    deltaPx: resizeDeltaForChildIndex(nodeIndex, amountPx),
    handleIndex: resizeHandleIndexForChildIndex(nodeIndex),
    splitId: parentNodeId,
    type: 'resizeSplit',
  })
}

function resizeHandleIndexForChildIndex(index: number): number {
  if (index === 0) return 0

  return index - 1
}

function resizeDeltaForChildIndex(index: number, amountPx: number): number {
  if (index === 0) return amountPx

  return -amountPx
}

function openSurface(engine: Engine, layout: WorkspaceLayout, surface: Surface): WorkspaceLayout {
  return engine.operations.applyLayoutOperation(layout, { surface, type: 'openSurface' })
}

function splitSurfaceRight(
  engine: Engine,
  layout: WorkspaceLayout,
  anchorSurfaceId: SurfaceId,
  surfaceId: SurfaceId,
): WorkspaceLayout {
  const targetWindowId = mustFindWindowId(engine, layout, anchorSurfaceId)

  return engine.operations.applyLayoutOperation(layout, {
    edge: 'right',
    surfaceId,
    type: 'splitWindow',
    windowId: targetWindowId,
  })
}

function mustFindWindowId(engine: Engine, layout: WorkspaceLayout, surfaceId: SurfaceId): WindowId {
  const windowId = engine.normalize.findWindowIdContainingSurface(layout, surfaceId)
  if (windowId) return windowId

  throw createClientInvariantError(`Expected ${surfaceId} to be visible`)
}

function captureState(
  engine: Engine,
  layout: WorkspaceLayout,
  title: string,
  transition: string,
): DiagramState {
  if (!engine.selectors.selectMaterializedLayoutTree(layout)) {
    throw createClientInvariantError(`Expected materialized layout tree for ${title}`)
  }

  return { layout, title, transition }
}
