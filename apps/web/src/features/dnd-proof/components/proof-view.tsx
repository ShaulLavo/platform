import { PointerActivationConstraints } from '@dnd-kit/dom'
import { DragDropProvider, PointerSensor } from '@dnd-kit/react'
import { useState } from 'react'

import { ProofEventLog } from '@/features/dnd-proof/components/proof-event-log'
import { ProofResizeHandles } from '@/features/dnd-proof/components/proof-resize-handles'
import { ProofSnapDestination } from '@/features/dnd-proof/components/proof-snap-destination'
import { ProofToolbar } from '@/features/dnd-proof/components/proof-toolbar'
import { ProofWindow } from '@/features/dnd-proof/components/proof-window'
import { useDndProofModel } from '@/features/dnd-proof/hooks/use-dnd-proof-model'
import type { DndProofDragData } from '@/features/dnd-proof/utils/drag-data'
import { surfaceWindowId } from '@/features/dnd-proof/utils/model'
import { proofSnapDestinations } from '@/features/dnd-proof/utils/snap-destinations'
import {
  deriveLayoutGeometry,
  insetLayoutRect,
  type LayoutGeometryOptions,
  type LayoutRect,
} from '@/features/tiling-surface-manager/engine/layout-geometry'
import { visibleWindowIdsInOrder } from '@/features/tiling-surface-manager/engine/layout-normalize'
import type { WorkspaceLayout } from '@/features/tiling-surface-manager/engine/layout-types'
import { useLayoutRootRect } from '@/features/workbench/hooks/use-layout-root-rect'

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
  const [dropZonesVisible, setDropZonesVisible] = useState(true)
  const {
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
    setScenario,
    snapLayout,
  } = useDndProofModel()
  const { rect, rootRef } = useLayoutRootRect(DEFAULT_LAYOUT_RECT)
  const rootRect = rect ?? DEFAULT_LAYOUT_RECT
  const surfaceRect = insetLayoutRect(rootRect, GEOMETRY_OPTIONS.gapPx ?? 0)
  const geometry = deriveLayoutGeometry(model.layout, surfaceRect, GEOMETRY_OPTIONS)
  const snapGeometry =
    snapLayout === model.layout
      ? geometry
      : deriveLayoutGeometry(snapLayout, surfaceRect, GEOMETRY_OPTIONS)
  const visibleWindowIds = visibleWindowIdsInOrder(model.layout)
  const snapDestinations = proofSnapDestinations({
    activeDrag,
    rootRect: surfaceRect,
    snapDestinationRects: snapGeometry.snapDestinationRects,
    sourceWindowId: sourceWindowIdForDrag(snapLayout, activeDrag),
    windowRectsById: snapGeometry.windowRectsById,
  })
  const surfaceCount = visibleWindowIds.reduce((count, windowId) => {
    const window = model.layout.windowsById[windowId]
    if (!window) return count

    return count + window.surfaceIds.length
  }, 0)

  return (
    <DragDropProvider
      sensors={PROOF_SENSORS}
      onDragEnd={handleDragEnd}
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
        <div className='grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_18rem]'>
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
            {visibleWindowIds.map((windowId, index) => {
              const window = model.layout.windowsById[windowId]
              const windowRect = geometry.windowRectsById[windowId]
              if (!window || !windowRect) return null

              return (
                <ProofWindow
                  activeDrag={activeDrag}
                  index={index}
                  key={windowId}
                  layout={model.layout}
                  rect={windowRect.rect}
                  window={window}
                  onAddTab={addTab}
                  onCloseSurface={removeSurface}
                  onCloseWindow={removeWindow}
                  onSelectSurface={activateSurface}
                />
              )
            })}
            <ProofResizeHandles resizeHandleRects={geometry.resizeHandleRects} />
            {snapDestinations.map((snapDestination) => (
              <ProofSnapDestination
                key={snapDestination.id}
                snapDestination={snapDestination}
                visible={dropZonesVisible}
              />
            ))}
          </section>
          <ProofEventLog events={model.events} />
        </div>
      </main>
    </DragDropProvider>
  )
}

function sourceWindowIdForDrag(layout: WorkspaceLayout, activeDrag: DndProofDragData | null) {
  if (!activeDrag) return null
  if (activeDrag.kind === 'window') return activeDrag.windowId

  return surfaceWindowId(layout, activeDrag.surfaceId)
}
