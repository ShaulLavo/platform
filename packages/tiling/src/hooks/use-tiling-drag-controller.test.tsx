import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/react'

import type { TilingDragData, TilingDropData } from '@workspace/tiling/utils/drag-data'
import { deriveLayoutGeometry, type LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import { checkWorkspaceLayoutInvariants } from '@workspace/tiling/utils/layout-invariants'
import { visibleWindowIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import { createTilingInvariantError } from '@workspace/tiling/utils/structured-errors'
import type { SurfaceId, WindowId, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'
import {
  useTilingDragController,
  type UseTilingDragControllerInput,
} from '@workspace/tiling/hooks/use-tiling-drag-controller'
import {
  mountTestTabStrip,
  testDomRect,
  testTabRect,
} from '@workspace/tiling/utils/tests/dom-test-elements'
import {
  createMultiWindowTestLayout,
  firstSurfaceIdForWindow,
} from '@workspace/tiling/utils/tests/test-layouts'

type ControllerValue = ReturnType<typeof useTilingDragController>
type CommitSpy = ReturnType<typeof vi.fn>

const ROOT_RECT: LayoutRect = { height: 600, width: 1000, x: 0, y: 0 }

describe('useTilingDragController', () => {
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrameId = 1

  beforeEach(() => {
    frames.clear()
    nextFrameId = 1
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelFrame)
    setReactActEnvironment(true)
  })

  afterEach(() => {
    frames.clear()
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    setReactActEnvironment(false)
  })

  it('exposes active snap destinations and previews window drags', () => {
    const layout = createMultiWindowTestLayout()
    const sourceWindowId = firstWindowId(layout)
    const source = { kind: 'window', windowId: sourceWindowId } as const
    const rendered = renderController(layout)

    act(() => {
      rendered.controller().handleDragStart(dragStartEvent(source, { x: 500, y: 300 }))
    })
    act(() => {
      rendered.controller().handleDragMove(dragMoveEvent(source, { x: 5, y: 300 }))
    })

    expect(rendered.controller().activeDrag).toEqual(source)
    expect(
      rendered
        .controller()
        .snapDestinations.some((candidate) => candidate.kind === 'source-return'),
    ).toBe(true)
    expect(rendered.controller().activeResolvedTarget?.target.kind).toBe('snap-destination')
    expect(rendered.controller().previewLayout).not.toBeNull()

    rendered.unmount()
  })

  it('commits the resolved drag target on the next animation frame', () => {
    const layout = createMultiWindowTestLayout()
    const sourceWindowId = firstWindowId(layout)
    const source = { kind: 'window', windowId: sourceWindowId } as const
    const rendered = renderController(layout)

    act(() => {
      rendered.controller().handleDragStart(dragStartEvent(source, { x: 500, y: 300 }))
    })
    act(() => {
      rendered.controller().handleDragMove(dragMoveEvent(source, { x: 995, y: 300 }))
    })
    const resolvedTarget = rendered.controller().activeResolvedTarget?.target
    expect(resolvedTarget?.kind).toBe('snap-destination')
    act(() => {
      rendered.controller().handleDragEnd(dragEndEvent(source, { x: 995, y: 300 }))
    })

    expect(rendered.commitSpy).not.toHaveBeenCalled()

    act(() => {
      runFrame(1)
    })

    const [committedLayout, event] = rendered.commitSpy.mock.calls[0] ?? []
    expect(event).toEqual({
      source,
      target: resolvedTarget,
    })
    expect(checkWorkspaceLayoutInvariants(committedLayout)).toEqual({
      ok: true,
      violations: [],
    })

    rendered.unmount()
  })

  it('computes package tab insertion previews for detached tab drags', () => {
    const layout = createMultiWindowTestLayout()
    const [sourceWindowId, targetWindowId] = visibleWindowIdsInOrder(layout)
    if (!sourceWindowId) throw createTilingInvariantError('Expected source window')
    if (!targetWindowId) throw createTilingInvariantError('Expected target window')

    const sourceSurfaceId = firstSurfaceIdForWindow(layout, sourceWindowId)
    const sourceTabElement = mountSourceStrip(sourceWindowId, sourceSurfaceId)
    mountTargetStrip(targetWindowId, layout.windowsById[targetWindowId].surfaceIds)
    const source = tabSource(sourceSurfaceId, sourceWindowId, 0)
    const rendered = renderController(layout)

    act(() => {
      rendered
        .controller()
        .handleDragStart(dragStartEvent(source, { x: 20, y: 120 }, sourceTabElement))
    })
    act(() => {
      rendered.controller().handleDragMove(dragMoveEvent(source, { x: 20, y: 20 }))
    })

    expect(rendered.controller().activeResolvedTarget?.target).toEqual({
      index: 0,
      kind: 'tab-strip',
      windowId: targetWindowId,
    })
    expect(rendered.controller().insertionPreview).toEqual({
      insertionIndex: 0,
      kind: 'tab-insertion',
      sourceSurfaceIds: [sourceSurfaceId],
      sourceWindowId,
      targetWindowId,
    })

    rendered.unmount()
  })

  function requestFrame(callback: FrameRequestCallback) {
    const frameId = nextFrameId
    frames.set(frameId, callback)
    nextFrameId += 1

    return frameId
  }

  function cancelFrame(frameId: number) {
    frames.delete(frameId)
  }

  function runFrame(frameId: number) {
    const callback = frames.get(frameId)
    frames.delete(frameId)
    callback?.(performance.now())
  }
})

function renderController(layout: WorkspaceLayout): {
  readonly commitSpy: CommitSpy
  readonly controller: () => ControllerValue
  readonly unmount: () => void
} {
  const container = document.createElement('main')
  container.getBoundingClientRect = () => testDomRect(ROOT_RECT)
  document.body.append(container)

  const geometry = deriveLayoutGeometry(layout, ROOT_RECT)
  const commitSpy = vi.fn()
  const root = createRoot(container)
  let controller: ControllerValue | null = null
  const input: UseTilingDragControllerInput = {
    coordinateRootRef: { current: container },
    layout,
    onCommitLayout: commitSpy,
    rootRect: ROOT_RECT,
    snapDestinationRects: geometry.snapDestinationRects,
    windowRectsById: geometry.windowRectsById,
  }

  act(() => {
    root.render(<HookHarness input={input} onValue={(value) => (controller = value)} />)
  })

  return {
    commitSpy,
    controller: () => currentController(controller),
    unmount: () => unmountRoot(root),
  }
}

function HookHarness({
  input,
  onValue,
}: {
  readonly input: UseTilingDragControllerInput
  readonly onValue: (value: ControllerValue) => void
}) {
  const value = useTilingDragController(input)
  onValue(value)

  return null
}

function currentController(controller: ControllerValue | null) {
  if (!controller) throw createTilingInvariantError('Expected hook controller')

  return controller
}

function unmountRoot(root: Root) {
  act(() => {
    root.unmount()
  })
}

function firstWindowId(layout: WorkspaceLayout): WindowId {
  const [windowId] = visibleWindowIdsInOrder(layout)
  if (!windowId) throw createTilingInvariantError('Expected visible window')

  return windowId
}

function mountSourceStrip(windowId: WindowId, surfaceId: SurfaceId) {
  const element = mountTestTabStrip({
    rect: { height: 40, width: 200, x: 0, y: 100 },
    tabs: [testTabRect(surfaceId, { height: 40, width: 100, x: 0, y: 100 })],
    windowId,
  })
  const sourceElement = element.querySelector<HTMLElement>('[data-tiling-tab-id]')
  if (!sourceElement) throw createTilingInvariantError('Expected source tab element')

  return sourceElement
}

function mountTargetStrip(windowId: WindowId, surfaceIds: readonly SurfaceId[]) {
  mountTestTabStrip({
    rect: { height: 40, width: 240, x: 0, y: 0 },
    tabs: surfaceIds.map((surfaceId, index) =>
      testTabRect(surfaceId, { height: 40, width: 120, x: index * 120, y: 0 }),
    ),
    windowId,
  })
}

function dragStartEvent(
  sourceData: TilingDragData,
  point: { readonly x: number; readonly y: number },
  sourceElement?: Element,
): DragStartEvent {
  return dragEvent({ point, sourceData, sourceElement }) as unknown as DragStartEvent
}

function dragMoveEvent(
  sourceData: TilingDragData,
  point: { readonly x: number; readonly y: number },
): DragMoveEvent {
  return dragEvent({ point, sourceData }) as unknown as DragMoveEvent
}

function dragEndEvent(
  sourceData: TilingDragData,
  point: { readonly x: number; readonly y: number },
  targetData: TilingDropData | null = null,
): DragEndEvent {
  return {
    ...dragEvent({ point, sourceData, targetData }),
    canceled: false,
  } as unknown as DragEndEvent
}

function dragEvent({
  point,
  sourceData,
  sourceElement,
  targetData = null,
}: {
  readonly point: { readonly x: number; readonly y: number }
  readonly sourceData: TilingDragData
  readonly sourceElement?: Element
  readonly targetData?: TilingDropData | null
}) {
  return {
    nativeEvent: new MouseEvent('pointermove', {
      clientX: point.x,
      clientY: point.y,
    }),
    operation: {
      activatorEvent: new MouseEvent('pointerdown', {
        clientX: point.x,
        clientY: point.y,
      }),
      position: {
        current: point,
      },
      source: {
        data: sourceData,
        element: sourceElement,
      },
      target: targetData ? { data: targetData } : null,
    },
    to: point,
  }
}

function tabSource(
  surfaceId: SurfaceId,
  windowId: WindowId,
  index: number,
): TilingDragData & Extract<TilingDropData, { readonly kind: 'tab' }> {
  return {
    index,
    kind: 'tab',
    surfaceId,
    windowId,
  }
}

function setReactActEnvironment(value: boolean) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = value
}
