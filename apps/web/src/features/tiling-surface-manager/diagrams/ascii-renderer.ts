import type { LayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import type {
  SurfaceType,
  WindowId,
  WorkspaceLayout,
  WorkspaceRecipeSlot,
} from '@/features/tiling-surface-manager/engine/layout-types'

import { CharGrid } from './char-grid'
import type {
  DiagramGroup,
  DiagramState,
  Engine,
  LayoutDiagramRenderer,
  RenderInput,
} from './renderer'
import {
  hasRailSurfaceType,
  hasVisibleSurfaceType,
  slotForSurface,
  surfaceIdLabel,
} from './renderer'

const COLS = 66
const ROWS = 22
const GAP = 1

// Compact slot tags shown inside each pane; mirrors SLOT_STYLES labels.
const SLOT_TAGS = {
  bottom: 'bot',
  'editor-center': 'edit',
  'left-tool-pane': 'side',
  rail: 'rail',
  'transient-preview': 'prev',
} satisfies Record<WorkspaceRecipeSlot, string>

export const asciiRenderer: LayoutDiagramRenderer = {
  name: 'ascii',
  render,
}

function render({ engine, groups }: RenderInput): string {
  const intro = [
    'Layout evolution (ASCII)',
    'rail legend: Name* visible · Name- minimized · Name absent',
  ]
  const body = groups.map((group) => renderGroup(engine, group)).join('\n\n')

  return `${intro.join('\n')}\n\n${body}\n`
}

// Renders a single layout state: heading, rail line, then the tiled grid.
export function renderStateAscii(engine: Engine, state: DiagramState): string {
  const grid = new CharGrid(COLS, ROWS)
  const nodeRects = engine.geometry.deriveNodeRects(
    state.layout,
    { height: ROWS, width: COLS, x: 0, y: 0 },
    { gapPx: GAP },
  )
  const windowRects = engine.geometry.deriveWindowRects(state.layout, nodeRects)

  for (const windowId of engine.normalize.visibleWindowIdsInOrder(state.layout)) {
    const windowRect = windowRects[windowId]
    if (!windowRect) continue

    drawPane(grid, state.layout, windowRect.rect, windowId)
  }

  const heading = state.transition ? `${state.title}  —  ${state.transition}` : state.title

  return [heading, railLine(engine, state.layout), grid.toString()].join('\n')
}

function renderGroup(engine: Engine, group: DiagramGroup): string {
  const header = [divider(), group.title]
  if (group.description) header.push(group.description)
  header.push(divider())

  const body = group.states.map((state) => renderStateAscii(engine, state)).join('\n\n')

  return `${header.join('\n')}\n\n${body}`
}

function divider(): string {
  return '═'.repeat(COLS)
}

function drawPane(grid: CharGrid, layout: WorkspaceLayout, rect: LayoutRect, windowId: WindowId) {
  const x0 = Math.round(rect.x)
  const y0 = Math.round(rect.y)
  const width = Math.round(rect.x + rect.width) - x0
  const height = Math.round(rect.y + rect.height) - y0
  if (width < 2 || height < 2) return

  grid.box(x0, y0, width, height)

  const window = layout.windowsById[windowId]
  if (!window) return

  const innerX = x0 + 1
  const innerWidth = width - 2
  if (innerWidth < 1) return

  const active = layout.activeWindowId === windowId
  drawTabs(grid, layout, window, innerX, y0 + 1, innerWidth)
  drawLabel(grid, layout, window, innerX, y0 + Math.floor(height / 2), innerWidth, active)
}

function drawTabs(
  grid: CharGrid,
  _layout: WorkspaceLayout,
  window: WorkspaceLayout['windowsById'][WindowId],
  x: number,
  y: number,
  width: number,
) {
  if (window.surfaceIds.length < 2) return

  const tabs = window.surfaceIds.map((surfaceId) => {
    const mark = surfaceId === window.activeSurfaceId ? '*' : ''

    return `${mark}${surfaceIdLabel(surfaceId)}`
  })
  grid.text(x, y, truncate(tabs.join(' '), width))
}

function drawLabel(
  grid: CharGrid,
  layout: WorkspaceLayout,
  window: WorkspaceLayout['windowsById'][WindowId],
  x: number,
  y: number,
  width: number,
  active: boolean,
) {
  const surface = layout.surfacesById[window.activeSurfaceId]
  const slot = slotForSurface(layout, window.activeSurfaceId)
  const name = surface?.title ?? surfaceIdLabel(window.activeSurfaceId)
  const marker = active ? '* ' : ''
  grid.text(x, y, truncate(`${marker}${name} [${SLOT_TAGS[slot]}]`, width))
}

function railLine(engine: Engine, layout: WorkspaceLayout): string {
  const icons = [
    railIcon(engine, layout, 'Files', 'file-navigator'),
    railIcon(engine, layout, 'Git', 'git-changes'),
    railIcon(engine, layout, 'Search', 'search-results'),
    railIcon(engine, layout, 'Term', 'terminal'),
  ]

  return `rail: ${icons.join('  ')}`
}

function railIcon(
  engine: Engine,
  layout: WorkspaceLayout,
  label: string,
  type: SurfaceType,
): string {
  if (hasVisibleSurfaceType(engine, layout, type)) return `${label}*`
  if (hasRailSurfaceType(engine, layout, type)) return `${label}-`

  return label
}

function truncate(value: string, width: number): string {
  if (value.length <= width) return value
  if (width <= 1) return value.slice(0, width)

  return `${value.slice(0, width - 1)}…`
}
