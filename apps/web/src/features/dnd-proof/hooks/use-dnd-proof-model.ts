import { useRef, useState } from 'react'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/react'

import {
  activateProofSurface,
  addProofTab,
  addProofWindow,
  createInitialProofModel,
  createProofScenarioModel,
  moveProofSurfaceToDestination,
  moveProofSurfaceToTab,
  moveProofSurfaceToWindowEnd,
  moveProofWindowNextToWindow,
  moveProofWindowToDestination,
  removeProofSurface,
  removeProofWindow,
  type ProofModel,
  type ProofScenario,
} from '@/features/dnd-proof/utils/model'
import {
  proofDragData,
  proofDropData,
  type DndProofDragData,
  type DndProofDropData,
} from '@/features/dnd-proof/utils/drag-data'
import type {
  SnapDestination,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'
import {
  resolveTabStripDropTarget,
  tabStripDropTargetMatchesPoint,
} from '@/features/dnd-proof/utils/tab-strip-hit-test'
import { resolveSnapDropTarget } from '@/features/dnd-proof/utils/snap-destination-hit-test'

type ProofDragTarget = {
  readonly source: DndProofDragData
  readonly target: DndProofDropData
}

export function useDndProofModel() {
  const [model, setModel] = useState(createInitialProofModel)
  const [activeDrag, setActiveDrag] = useState<DndProofDragData | null>(null)
  const dragStartModelRef = useRef<ProofModel | null>(null)
  const lastDragTargetRef = useRef<ProofDragTarget | null>(null)

  function handleDragStart(event: DragStartEvent) {
    const source = proofDragData(event.operation.source?.data)
    dragStartModelRef.current = model
    lastDragTargetRef.current = null
    setActiveDrag(source)
  }

  function handleDragOver(event: DragOverEvent) {
    const source = proofDragData(event.operation.source?.data) ?? activeDrag
    const rawTarget = proofDropData(event.operation.target?.data)
    if (!source) return

    const target = resolveDropTarget(source, rawTarget, event.operation.position.current)
    if (!target) return
    const baseModel = dragStartModelRef.current ?? model
    if (dropTargetCanCommit(baseModel.layout, target)) {
      lastDragTargetRef.current = { source, target }
    }
    setModel((current) => previewModelForTarget(current, source, target, dragStartModelRef.current))
  }

  function handleDragEnd(event: DragEndEvent) {
    const source = proofDragData(event.operation.source?.data) ?? activeDrag
    const rawTarget = proofDropData(event.operation.target?.data)
    const currentTarget = source
      ? resolveDropTarget(source, rawTarget, event.operation.position.current)
      : rawTarget
    const baseModel = dragStartModelRef.current ?? model
    const target = dragEndTarget(
      source,
      currentTarget,
      baseModel.layout,
      event.operation.position.current,
    )
    if (event.canceled || !source || !target) {
      restoreDragStartModel()
      return
    }

    dragStartModelRef.current = null
    lastDragTargetRef.current = null
    setActiveDrag(null)
    setModel(proofDragTargetModel(baseModel, source, target))
  }

  function addWindow() {
    dragStartModelRef.current = null
    lastDragTargetRef.current = null
    setModel((current) => addProofWindow(current))
  }

  function addTab(windowId?: WindowId) {
    dragStartModelRef.current = null
    lastDragTargetRef.current = null
    setModel((current) => addProofTab(current, windowId))
  }

  function activateSurface(surfaceId: SurfaceId) {
    setModel((current) => activateProofSurface(current, surfaceId))
  }

  function removeSurface(surfaceId: SurfaceId) {
    dragStartModelRef.current = null
    lastDragTargetRef.current = null
    setModel((current) => removeProofSurface(current, surfaceId))
  }

  function removeWindow(windowId: WindowId) {
    dragStartModelRef.current = null
    lastDragTargetRef.current = null
    setModel((current) => removeProofWindow(current, windowId))
  }

  function reset() {
    dragStartModelRef.current = null
    lastDragTargetRef.current = null
    setActiveDrag(null)
    setModel(createInitialProofModel())
  }

  function setScenario(scenario: ProofScenario) {
    dragStartModelRef.current = null
    lastDragTargetRef.current = null
    setActiveDrag(null)
    setModel(createProofScenarioModel(scenario))
  }

  function restoreDragStartModel() {
    const dragStartModel = dragStartModelRef.current
    dragStartModelRef.current = null
    lastDragTargetRef.current = null
    setActiveDrag(null)
    if (!dragStartModel) return

    setModel(dragStartModel)
  }

  function dragEndTarget(
    source: DndProofDragData | null,
    currentTarget: DndProofDropData | null,
    baseLayout: WorkspaceLayout,
    point: { readonly x: number; readonly y: number },
  ) {
    return dragEndTargetForLayout(
      source,
      currentTarget,
      baseLayout,
      lastDragTargetRef.current,
      point,
    )
  }

  return {
    activateSurface,
    activeDrag,
    addTab,
    addWindow,
    handleDragEnd,
    handleDragOver,
    handleDragStart,
    model,
    removeSurface,
    removeWindow,
    reset,
    snapLayout:
      activeDrag && dragStartModelRef.current ? dragStartModelRef.current.layout : model.layout,
    setScenario,
  }
}

function resolveDropTarget(
  source: DndProofDragData,
  target: DndProofDropData | null,
  point: { readonly x: number; readonly y: number },
) {
  const tabStripTarget = target ? resolveTabStripDropTarget(source, target, point) : null
  if (
    tabStripTarget &&
    targetBelongsToTabStrip(tabStripTarget) &&
    tabStripDropTargetMatchesPoint(tabStripTarget, point) &&
    !windowSourceOwnsTabStrip(source, tabStripTarget)
  ) {
    return tabStripTarget
  }

  return resolveSnapDropTarget(source, tabStripTarget, point)
}

function targetBelongsToTabStrip(
  target: DndProofDropData,
): target is Extract<DndProofDropData, { readonly kind: 'tab' | 'tab-strip' }> {
  return target.kind === 'tab' || target.kind === 'tab-strip'
}

function windowSourceOwnsTabStrip(
  source: DndProofDragData,
  target: Extract<DndProofDropData, { readonly kind: 'tab' | 'tab-strip' }>,
) {
  if (source.kind !== 'window') return false

  return target.windowId === source.windowId
}

function dragEndTargetForLayout(
  source: DndProofDragData | null,
  currentTarget: DndProofDropData | null,
  baseLayout: WorkspaceLayout,
  lastDragTarget: ProofDragTarget | null,
  point: { readonly x: number; readonly y: number },
) {
  if (currentTarget && dropTargetCanCommit(baseLayout, currentTarget)) return currentTarget
  if (!source) return null

  if (!lastDragTarget) return null
  if (!sameDragSource(source, lastDragTarget.source)) return null
  if (!lastDragTargetMatchesPoint(lastDragTarget, point)) return null

  return lastDragTarget.target
}

function lastDragTargetMatchesPoint(
  lastDragTarget: ProofDragTarget,
  point: { readonly x: number; readonly y: number },
) {
  if (lastDragTarget.source.kind !== 'tab') return true

  return tabStripDropTargetMatchesPoint(lastDragTarget.target, point)
}

function sameDragSource(left: DndProofDragData, right: DndProofDragData) {
  if (left.kind !== right.kind) return false
  if (left.kind === 'tab' && right.kind === 'tab') return left.surfaceId === right.surfaceId
  if (left.kind === 'window' && right.kind === 'window') return left.windowId === right.windowId

  return false
}

function previewModelForTarget(
  current: ProofModel,
  source: DndProofDragData,
  target: DndProofDropData,
  dragStartModel: ProofModel | null,
) {
  const baseModel = dragStartModel ?? current
  if (!dropTargetCanCommit(baseModel.layout, target)) return current
  if (targetMergesWindowIntoTabs(source, target)) return baseModel

  return proofDragTargetModel(baseModel, source, target)
}

function targetMergesWindowIntoTabs(source: DndProofDragData, target: DndProofDropData) {
  if (source.kind !== 'window') return false
  if (target.kind === 'tab' || target.kind === 'tab-strip') return true

  return target.kind === 'snap-destination' && target.destination.kind === 'window-center'
}

function proofDragTargetModel(
  model: ProofModel,
  source: DndProofDragData,
  target: DndProofDropData,
) {
  if (source.kind === 'tab') return tabDragTargetModel(model, source, target)
  if (target.kind === 'snap-destination') {
    return moveProofWindowToDestination(model, source.windowId, target.destination)
  }
  if (target.kind === 'window') {
    return moveProofWindowNextToWindow(model, source.windowId, target.windowId)
  }
  if (target.kind === 'tab' || target.kind === 'tab-strip') {
    return moveProofWindowToDestination(model, source.windowId, {
      kind: 'window-center',
      tabIndex: target.index,
      windowId: target.windowId,
    })
  }

  return model
}

function tabDragTargetModel(
  model: ProofModel,
  source: Extract<DndProofDragData, { readonly kind: 'tab' }>,
  target: DndProofDropData,
) {
  if (target.kind === 'tab') {
    return moveProofSurfaceToTab(model, source.surfaceId, target.windowId, target.index)
  }
  if (target.kind === 'tab-strip') {
    return moveProofSurfaceToTab(model, source.surfaceId, target.windowId, target.index)
  }
  if (target.kind === 'snap-destination') {
    return moveProofSurfaceToDestination(model, source.surfaceId, target.destination)
  }
  if (target.kind === 'window') {
    return moveProofSurfaceToWindowEnd(model, source.surfaceId, target.windowId)
  }

  return model
}

function targetExistsInLayout(layout: WorkspaceLayout, target: DndProofDropData) {
  if (target.kind === 'tab') return Boolean(layout.surfacesById[target.surfaceId])
  if (target.kind === 'tab-strip') return Boolean(layout.windowsById[target.windowId])
  if (target.kind === 'window') return Boolean(layout.windowsById[target.windowId])

  return true
}

function dropTargetCanCommit(layout: WorkspaceLayout, target: DndProofDropData) {
  if (target.kind !== 'snap-destination') return targetExistsInLayout(layout, target)

  return snapDestinationCanCommit(layout, target.destination)
}

function snapDestinationCanCommit(layout: WorkspaceLayout, destination: SnapDestination) {
  if (destination.kind === 'root-edge') return Boolean(layout.rootNodeId)
  if (destination.kind === 'window-edge') return Boolean(layout.windowsById[destination.windowId])
  if (destination.kind === 'window-center') return Boolean(layout.windowsById[destination.windowId])
  if (destination.kind === 'parent-edge') return Boolean(layout.nodesById[destination.nodeId])

  return true
}
