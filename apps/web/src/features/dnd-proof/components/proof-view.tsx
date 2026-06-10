import { PointerActivationConstraints } from '@dnd-kit/dom'
import { DragDropProvider, PointerSensor } from '@dnd-kit/react'
import { useState } from 'react'

import { ProofDragOverlay } from '@/features/dnd-proof/components/proof-drag-overlay'
import { ProofEventLog } from '@/features/dnd-proof/components/proof-event-log'
import { ProofPreviewWindow } from '@/features/dnd-proof/components/proof-preview-window'
import { ProofSnapDestination } from '@/features/dnd-proof/components/proof-snap-destination'
import { ProofToolbar } from '@/features/dnd-proof/components/proof-toolbar'
import { ProofWindow } from '@/features/dnd-proof/components/proof-window'
import { useTilingDragController } from '@workspace/tiling/hooks/use-tiling-drag-controller'
import {
  activateProofSurface,
  addProofTab,
  addProofWindow,
  commitProofLayout,
  createInitialProofModel,
  createProofScenarioModel,
  dispatchProofLayoutOperation,
  removeProofSurface,
  removeProofWindow,
} from '@/features/dnd-proof/utils/model'
import {
  deriveLayoutGeometry,
  insetLayoutRect,
  type LayoutGeometryOptions,
  type LayoutRect,
} from '@workspace/tiling/utils/layout-geometry'
import { visibleWindowIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import type {
  LayoutEdge,
  LayoutOperation,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'
import { useLayoutRootRect } from '@/features/workbench/hooks/use-layout-root-rect'
import { ResizeOverlay } from '@/features/workbench/components/resize-overlay'

const PROOF_SENSORS = [
  PointerSensor.configure({
    activationConstraints: () => [
      new PointerActivationConstraints.Distance({
        value: 4,
      }),
    ],
  }),
]

const DEFAULT_LAYOUT_RECT: LayoutRect = {
  height: 720,
  width: 1080,
  x: 0,
  y: 0,
}

const GEOMETRY_OPTIONS: LayoutGeometryOptions = {
  gapPx: 8,
  minSnapDestinationPx: 44,
  resizeHandleThicknessPx: 8,
  snapEdgeRatio: 0.18,
}

export function DndProofView() {
  const [model, setModel] = useState(createInitialProofModel)
  const [dropZonesVisible, setDropZonesVisible] = useState(false)
  const [resizingWindows, setResizingWindows] = useState(false)
  const { rect, rootRef } = useLayoutRootRect(DEFAULT_LAYOUT_RECT)
  const rootRect = rect ?? DEFAULT_LAYOUT_RECT
  const surfaceRect = insetLayoutRect(rootRect, GEOMETRY_OPTIONS.gapPx ?? 0)
  const committedGeometry = deriveLayoutGeometry(model.layout, surfaceRect, GEOMETRY_OPTIONS)
  const {
    activeDrag,
    activeResolvedTarget,
    flushPendingCommit,
    handleDragEnd,
    handleDragMove,
    handleDragOver,
    handleDragStart,
    insertionPreview,
    previewLayout,
    resetInteraction,
    resetStateLog,
    snapDestinations,
    snapLayout,
    stateEvents,
    tabStripRenderEpoch,
  } = useTilingDragController({
    coordinateRootRef: rootRef,
    layout: model.layout,
    rootRect: surfaceRect,
    snapDestinationRects: committedGeometry.snapDestinationRects,
    windowRectsById: committedGeometry.windowRectsById,
    onCommitLayout: (layout, event) => {
      setModel((current) => commitProofLayout(current, layout, event))
    },
  })
  const renderLayout = previewLayout ?? model.layout
  const previewGeometry = previewLayout
    ? deriveLayoutGeometry(previewLayout, surfaceRect, GEOMETRY_OPTIONS)
    : committedGeometry
  const visibleWindowIds = visibleWindowIdsInOrder(model.layout)
  const renderedWindowIds =
    insertionPreview?.kind === 'window-merge' && previewLayout
      ? visibleWindowIdsInOrder(previewLayout)
      : visibleWindowIds
  const optimisticTabSorting = !visibleWindowIds.some((windowId) => {
    return model.layout.windowsById[windowId]?.mode === 'collapsed'
  })
  const previewOnlyWindowIds = previewLayout
    ? visibleWindowIdsInOrder(previewLayout).filter(
        (windowId) => !model.layout.windowsById[windowId],
      )
    : []
  const surfaceCount = visibleWindowIds.reduce((count, windowId) => {
    const window = model.layout.windowsById[windowId]
    if (!window) return count

    return count + window.surfaceIds.length
  }, 0)

  function addWindow() {
    flushPendingCommit()
    resetInteraction()
    setModel((current) => addProofWindow(current))
  }

  function addTab(windowId?: WorkspaceLayout['activeWindowId']) {
    flushPendingCommit()
    resetInteraction()
    setModel((current) => addProofTab(current, windowId ?? undefined))
  }

  function activateSurface(surfaceId: WorkspaceLayout['activeSurfaceId']) {
    if (!surfaceId) return

    flushPendingCommit()
    setModel((current) => activateProofSurface(current, surfaceId))
  }

  function dispatchLayoutOperation(operation: LayoutOperation) {
    flushPendingCommit()
    if (operation.type !== 'resizeSplit') resetInteraction()

    setModel((current) => dispatchProofLayoutOperation(current, operation))
  }

  function removeSurface(surfaceId: WorkspaceLayout['activeSurfaceId']) {
    if (!surfaceId) return

    flushPendingCommit()
    resetInteraction()
    setModel((current) => removeProofSurface(current, surfaceId))
  }

  function removeWindow(windowId: WorkspaceLayout['activeWindowId']) {
    if (!windowId) return

    flushPendingCommit()
    resetInteraction()
    setModel((current) => removeProofWindow(current, windowId))
  }

  function reset() {
    resetInteraction()
    resetStateLog()
    setModel(createInitialProofModel())
  }

  function setScenario(windowCount: Parameters<typeof createProofScenarioModel>[0]) {
    resetInteraction()
    resetStateLog()
    setModel(createProofScenarioModel(windowCount))
  }

  function collapseWindowToRow(windowId: WorkspaceLayout['activeWindowId']) {
    if (!windowId) return

    const window = model.layout.windowsById[windowId]
    if (!window) return

    dispatchLayoutOperation({
      edge: rowCollapseEdge(windowId),
      type: 'collapseWindow',
      windowId,
    })
  }

  function collapseWindowToRail(windowId: WorkspaceLayout['activeWindowId']) {
    if (!windowId) return

    const window = model.layout.windowsById[windowId]
    if (!window) return

    dispatchLayoutOperation({
      edge: railCollapseEdge(windowId),
      type: 'collapseWindow',
      windowId,
    })
  }

  function expandWindow(windowId: WorkspaceLayout['activeWindowId']) {
    if (!windowId) return

    const window = model.layout.windowsById[windowId]
    if (!window) return
    if (window.mode !== 'collapsed') return

    dispatchLayoutOperation({
      type: 'expandWindow',
      windowId,
    })
  }

  function rowCollapseEdge(windowId: WorkspaceLayout['activeWindowId']): LayoutEdge {
    if (!windowId) return 'bottom'

    const rect = committedGeometry.windowRectsById[windowId]?.rect
    if (!rect) return 'bottom'

    const centerY = rect.y + rect.height / 2
    const midpointY = surfaceRect.y + surfaceRect.height / 2
    if (centerY < midpointY) return 'top'

    return 'bottom'
  }

  function railCollapseEdge(windowId: WorkspaceLayout['activeWindowId']): LayoutEdge {
    if (!windowId) return 'left'

    const rect = committedGeometry.windowRectsById[windowId]?.rect
    if (!rect) return 'left'

    const centerX = rect.x + rect.width / 2
    const midpointX = surfaceRect.x + surfaceRect.width / 2
    if (centerX > midpointX) return 'right'

    return 'left'
  }

  return (
    <DragDropProvider
      sensors={PROOF_SENSORS}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
    >
      <main className='bg-background text-foreground flex h-svh flex-col overflow-hidden'>
        <ProofToolbar
          dropZonesVisible={dropZonesVisible}
          surfaceCount={surfaceCount}
          windowCount={visibleWindowIds.length}
          onAddTab={() => addTab()}
          onAddWindow={addWindow}
          onReset={reset}
          onScenario={setScenario}
          onToggleDropZones={() => setDropZonesVisible((visible) => !visible)}
        />
        <div className='grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_18rem] gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_18rem] xl:grid-rows-1'>
          <section
            aria-label='dnd-kit tiling proof surface'
            className='bg-muted/20 border-border relative isolate min-h-0 min-w-0 overflow-hidden rounded-md border'
            data-proof-surface-area=''
            ref={rootRef}
          >
            <div
              aria-hidden='true'
              className="pointer-events-none absolute inset-0 z-0 bg-[url('/workbench/wallpaper.png')] bg-cover bg-center opacity-45"
            />

            {renderedWindowIds.map((windowId) => {
              const window =
                renderLayout.windowsById[windowId] ?? model.layout.windowsById[windowId]
              const windowRect =
                previewGeometry.windowRectsById[windowId] ??
                committedGeometry.windowRectsById[windowId]
              if (!window || !windowRect) return null

              return (
                <ProofWindow
                  activeDrag={activeDrag}
                  dropZonesVisible={dropZonesVisible}
                  insertionPreview={insertionPreview}
                  insertionPreviewLayout={snapLayout}
                  resizingWindows={resizingWindows}
                  key={windowId}
                  layout={renderLayout}
                  optimisticTabSorting={optimisticTabSorting}
                  rect={windowRect.rect}
                  tabStripRenderEpoch={tabStripRenderEpoch}
                  window={window}
                  onAddTab={addTab}
                  onCollapseWindowToRail={collapseWindowToRail}
                  onCollapseWindowToRow={collapseWindowToRow}
                  onCloseSurface={removeSurface}
                  onCloseWindow={removeWindow}
                  onExpandWindow={expandWindow}
                  onSelectSurface={activateSurface}
                />
              )
            })}
            {previewOnlyWindowIds.map((windowId) => {
              const windowRect = previewGeometry.windowRectsById[windowId]
              if (!windowRect) return null

              return <ProofPreviewWindow key={windowId} rect={windowRect.rect} />
            })}
            <ResizeOverlay
              resizeHandleRects={committedGeometry.resizeHandleRects}
              onDispatch={dispatchLayoutOperation}
              onResizeEnd={() => setResizingWindows(false)}
              onResizeStart={() => setResizingWindows(true)}
            />
            {snapDestinations.map((snapDestination) => (
              <ProofSnapDestination
                key={snapDestination.id}
                active={activeResolvedTarget?.candidateId === snapDestination.id}
                candidate={snapDestination}
                visible={dropZonesVisible}
              />
            ))}
          </section>
          <ProofEventLog events={model.events} stateEvents={stateEvents} />
        </div>
      </main>
      <ProofDragOverlay activeDrag={activeDrag} layout={model.layout} />
    </DragDropProvider>
  )
}
