import { PointerActivationConstraints } from '@dnd-kit/dom'
import { DragDropProvider, PointerSensor } from '@dnd-kit/react'
import { useRef, useState } from 'react'

import { ProofDragOverlay } from '@/features/dnd-proof/components/proof-drag-overlay'
import { ProofEventLog } from '@/features/dnd-proof/components/proof-event-log'
import { ProofPreviewWindow } from '@/features/dnd-proof/components/proof-preview-window'
import { ProofSnapDestination } from '@/features/dnd-proof/components/proof-snap-destination'
import { ProofToolbar } from '@/features/dnd-proof/components/proof-toolbar'
import { ProofWindow } from '@/features/dnd-proof/components/proof-window'
import { useDndProofModel } from '@/features/dnd-proof/hooks/use-dnd-proof-model'
import type { DndProofDragData } from '@/features/dnd-proof/utils/drag-data'
import { surfaceWindowId } from '@/features/dnd-proof/utils/model'
import { proofSnapDestinations } from '@/features/dnd-proof/utils/snap-destinations'
import { dndProofInsertionPreview } from '@/features/dnd-proof/utils/tab-preview'
import {
  deriveLayoutGeometry,
  insetLayoutRect,
  type LayoutGeometryOptions,
  type LayoutRect,
} from '@/features/tiling-surface-manager/engine/layout-geometry'
import { visibleWindowIdsInOrder } from '@/features/tiling-surface-manager/engine/layout-normalize'
import type {
  LayoutEdge,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'
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
  const [dropZonesVisible, setDropZonesVisible] = useState(false)
  const [resizingWindows, setResizingWindows] = useState(false)
  const {
    activateSurface,
    activeDrag,
    activeResolvedTarget,
    addTab,
    addWindow,
    dispatchLayoutOperation,
    handleDragEnd,
    handleDragMove,
    handleDragOver,
    handleDragStart,
    model,
    previewLayout,
    removeSurface,
    removeWindow,
    reset,
    setScenario,
    snapLayout,
    stateEvents,
    tabStripRenderEpoch,
  } = useDndProofModel()
  const { rect, rootRef } = useLayoutRootRect(DEFAULT_LAYOUT_RECT)
  const rootRect = rect ?? DEFAULT_LAYOUT_RECT
  const surfaceRect = insetLayoutRect(rootRect, GEOMETRY_OPTIONS.gapPx ?? 0)
  const committedGeometry = deriveLayoutGeometry(model.layout, surfaceRect, GEOMETRY_OPTIONS)
  const renderLayout = previewLayout ?? model.layout
  const previewGeometry = previewLayout
    ? deriveLayoutGeometry(previewLayout, surfaceRect, GEOMETRY_OPTIONS)
    : committedGeometry
  const snapGeometry = deriveLayoutGeometry(snapLayout, surfaceRect, GEOMETRY_OPTIONS)
  const insertionPreview = dndProofInsertionPreview({
    activeDrag,
    layout: snapLayout,
    resolvedTarget: activeResolvedTarget,
  })
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
  const snapDestinations = proofSnapDestinations({
    activeDrag,
    rootRect: surfaceRect,
    snapDestinationRects: snapGeometry.snapDestinationRects,
    sourceWindowRect: sourceWindowRectForDrag(snapGeometry.windowRectsById, activeDrag),
    sourceWindowId: sourceWindowIdForDrag(snapLayout, activeDrag),
  })
  const snapDestinationsRef = useRef(snapDestinations)
  snapDestinationsRef.current = snapDestinations
  const surfaceCount = visibleWindowIds.reduce((count, windowId) => {
    const window = model.layout.windowsById[windowId]
    if (!window) return count

    return count + window.surfaceIds.length
  }, 0)

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
      onDragEnd={(event) => handleDragEnd(event, snapDestinationsRef.current, rootRef.current)}
      onDragMove={(event) => handleDragMove(event, snapDestinationsRef.current, rootRef.current)}
      onDragOver={(event) => handleDragOver(event, snapDestinationsRef.current, rootRef.current)}
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
            {visibleWindowIds.length === 0 ? (
              <div className='text-muted-foreground relative z-10 grid h-full place-items-center text-sm'>
                No windows
              </div>
            ) : null}
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

function sourceWindowIdForDrag(layout: WorkspaceLayout, activeDrag: DndProofDragData | null) {
  if (!activeDrag) return null
  if (activeDrag.kind === 'window') return activeDrag.windowId

  return surfaceWindowId(layout, activeDrag.surfaceId)
}

function sourceWindowRectForDrag(
  windowRectsById: ReturnType<typeof deriveLayoutGeometry>['windowRectsById'],
  activeDrag: DndProofDragData | null,
) {
  if (activeDrag?.kind !== 'window') return null

  return windowRectsById[activeDrag.windowId]?.rect ?? null
}
