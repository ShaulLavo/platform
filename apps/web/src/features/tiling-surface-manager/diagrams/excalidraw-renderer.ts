import type { LayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import type {
  SurfaceId,
  SurfaceType,
  WindowId,
  WorkspaceLayout,
  WorkspaceRecipeSlot,
} from '@/features/tiling-surface-manager/engine/layout-types'

import type {
  DiagramGroup,
  DiagramState,
  Engine,
  LayoutDiagramRenderer,
  RenderInput,
  SlotStyle,
} from './renderer'
import {
  hasRailSurfaceType,
  hasVisibleSurfaceType,
  SLOT_STYLES,
  slotForSurface,
  surfaceIdLabel,
} from './renderer'

const FRAME_WIDTH = 560
const FRAME_HEIGHT = 360
const TITLE_BAR_HEIGHT = 34
const RAIL_WIDTH = 42
const WINDOW_PADDING = 12
const CONTENT_GAP = 8
const FONT_FAMILY = 5
const UPDATED_AT = 1_780_735_986_986
const EXPECTED_STATE_COUNT = 27

type DiagramElement = Record<string, unknown>

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

export const excalidrawRenderer: LayoutDiagramRenderer = {
  name: 'excalidraw',
  render,
}

function render({ engine, groups }: RenderInput): string {
  const diagram = buildDiagram(engine, groups)
  validateDiagram(diagram, groups)

  return `${JSON.stringify(diagram, null, 2)}\n`
}

function validateDiagram(
  diagram: { readonly elements: readonly unknown[] },
  groups: readonly DiagramGroup[],
) {
  const stateCount = groups.reduce((total, group) => total + group.states.length, 0)
  if (diagram.elements.length <= 200) throw new Error('Expected generated diagram elements')
  if (stateCount !== EXPECTED_STATE_COUNT) {
    throw new Error(`Expected ${EXPECTED_STATE_COUNT} captured layout states`)
  }
}

function buildDiagram(engine: Engine, groups: readonly DiagramGroup[]) {
  const builder = new DiagramBuilder()
  const mainGroup = groups[0]
  if (!mainGroup) throw new Error('Expected main diagram group')

  drawHeader(engine, builder)
  drawMainStates(engine, builder, mainGroup.states)
  drawScenarioGroups(engine, builder, groups.slice(1))

  return {
    appState: { gridSize: 20, viewBackgroundColor: '#ffffff' },
    elements: builder.elements,
    files: {},
    source: 'https://excalidraw.com',
    type: 'excalidraw',
    version: 2,
  }
}

function drawHeader(engine: Engine, builder: DiagramBuilder) {
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
  drawLegend(engine, builder, 120, 122)
}

function drawLegend(engine: Engine, builder: DiagramBuilder, x: number, y: number) {
  const recipe = engine.builders.classicWorkspaceRecipe()
  builder.addText(`${recipe.title} recipe slots`, x, y, {
    fontSize: 16,
    strokeColor: '#e8590c',
  })

  const slots: readonly WorkspaceRecipeSlot[] = ['editor-center', 'left-tool-pane', 'bottom']

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

function drawMainStates(engine: Engine, builder: DiagramBuilder, states: readonly DiagramState[]) {
  states.forEach((state, index) => {
    drawState(engine, builder, state, mainStatePosition(index))
  })

  for (let index = 1; index < states.length; index += 1) {
    const state = states[index]
    if (!state) continue

    drawTransitionArrow(builder, mainStatePosition(index - 1), mainStatePosition(index), state)
  }
}

function drawScenarioGroups(
  engine: Engine,
  builder: DiagramBuilder,
  groups: readonly DiagramGroup[],
) {
  groups.forEach((group, index) => {
    drawScenarioGroup(engine, builder, group, 1280 + index * 520)
  })
}

function drawScenarioGroup(
  engine: Engine,
  builder: DiagramBuilder,
  group: DiagramGroup,
  y: number,
) {
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
    drawState(engine, builder, state, scenarioStatePosition(index, y))
  })

  for (let index = 1; index < group.states.length; index += 1) {
    const state = group.states[index]
    if (!state) continue

    drawTransitionArrow(
      builder,
      scenarioStatePosition(index - 1, y),
      scenarioStatePosition(index, y),
      state,
    )
  }
}

function mainStatePosition(index: number): Point {
  const column = index % 4
  const row = Math.floor(index / 4)

  return { x: 120 + column * 720, y: 230 + row * 520 }
}

function scenarioStatePosition(index: number, groupY: number): Point {
  return { x: 120 + index * 720, y: groupY + 88 }
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

function drawState(engine: Engine, builder: DiagramBuilder, state: DiagramState, position: Point) {
  const frame = { height: FRAME_HEIGHT, width: FRAME_WIDTH, x: position.x, y: position.y }
  const rootRect = contentRectForFrame(frame)
  const nodeRects = engine.geometry.deriveNodeRects(state.layout, rootRect, { gapPx: CONTENT_GAP })
  const windowRects = engine.geometry.deriveWindowRects(state.layout, nodeRects)

  builder.addText(state.title, position.x, position.y - 34, {
    fontSize: 17,
    strokeColor: '#212529',
  })
  drawWindowFrame(engine, builder, frame, state)

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

function drawWindowFrame(
  engine: Engine,
  builder: DiagramBuilder,
  frame: LayoutRect,
  state: DiagramState,
) {
  builder.addRect(frame, {
    backgroundColor: 'transparent',
    strokeColor: '#1e1e1e',
    strokeWidth: 2,
  })
  builder.addRect(
    { height: 1, width: frame.width - 20, x: frame.x + 10, y: frame.y + TITLE_BAR_HEIGHT },
    { backgroundColor: '#1e1e1e', roundness: null, strokeColor: '#1e1e1e', strokeWidth: 1 },
  )
  drawActivityRail(engine, builder, frame, state.layout)
}

function drawActivityRail(
  engine: Engine,
  builder: DiagramBuilder,
  frame: LayoutRect,
  layout: WorkspaceLayout,
) {
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

  activityIcons(engine, layout).forEach((icon, index) => {
    const y = railRect.y + 14 + index * 31
    drawActivityIcon(builder, railRect.x + 7, y, icon)
  })
}

type ActivityIcon = {
  readonly letter: string
  readonly minimized: boolean
  readonly slot: WorkspaceRecipeSlot
  readonly visible: boolean
}

function activityIcons(engine: Engine, layout: WorkspaceLayout): readonly ActivityIcon[] {
  return [
    activityIcon(engine, layout, 'F', 'file-navigator', 'left-tool-pane'),
    activityIcon(engine, layout, 'G', 'git-changes', 'left-tool-pane'),
    activityIcon(engine, layout, 's', 'search-results', 'left-tool-pane'),
    activityIcon(engine, layout, 'T', 'terminal', 'bottom'),
  ]
}

function activityIcon(
  engine: Engine,
  layout: WorkspaceLayout,
  letter: string,
  type: SurfaceType,
  slot: WorkspaceRecipeSlot,
): ActivityIcon {
  return {
    letter,
    minimized: hasRailSurfaceType(engine, layout, type),
    slot,
    visible: hasVisibleSurfaceType(engine, layout, type),
  }
}

function drawActivityIcon(builder: DiagramBuilder, x: number, y: number, icon: ActivityIcon) {
  const style = SLOT_STYLES[icon.slot]
  const backgroundColor = icon.visible ? style.backgroundColor : 'transparent'
  const strokeColor = icon.visible || icon.minimized ? style.strokeColor : '#1e1e1e'

  builder.addRect({ height: 19, width: 20, x, y }, { backgroundColor, strokeColor })
  builder.addText(icon.letter, x + 6, y + 1, {
    fontSize: 13,
    strokeColor,
  })
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

function activeWindowStrokeWidth(layout: WorkspaceLayout, windowId: WindowId): number {
  if (layout.activeWindowId === windowId) return 3

  return 2
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

// The Excalidraw helper's main export pulls browser modules that this script
// does not need, so this mirrors the generated element JSON directly.
class DiagramBuilder {
  readonly elements: DiagramElement[] = []

  private counter = 0

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

function stableElementId(type: string, index: number): string {
  return `layout-evolution-${type}-${index.toString(36).padStart(4, '0')}`
}

function stableSeed(input: string): number {
  let hash = 2_166_136_261

  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 16_777_619)
  }

  return ((hash >>> 0) % 2_147_483_646) + 1
}
