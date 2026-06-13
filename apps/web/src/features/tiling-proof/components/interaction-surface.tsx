import { PointerActivationConstraints } from '@dnd-kit/dom'
import { DragDropProvider, PointerSensor } from '@dnd-kit/react'
import { useEffect, useState, type ReactNode } from 'react'

import { ProofDragOverlay } from '@/features/tiling-proof/components/drag-overlay'
import { DropRegionOverlay } from '@/features/tiling-proof/components/drop-region-overlay'
import { ProofSnapDestination } from '@/features/tiling-proof/components/snap-destination'
import { ProofWindow } from '@/features/tiling-proof/components/window'
import {
  collapseEdgeForTarget,
  type ProofCollapseTarget,
} from '@/features/tiling-proof/utils/collapse-edge'
import { PROOF_GEOMETRY_OPTIONS } from '@/features/tiling-proof/utils/geometry'
import { ResizeOverlay } from '@/features/workbench/components/resize-overlay'
import { DEFAULT_LAYOUT_RECT } from '@/features/workbench/utils/layout-defaults'
import { useLayoutRootRect } from '@/features/workbench/hooks/use-layout-root-rect'
import {
  useTilingDragController,
  type TilingCommitEvent,
} from '@workspace/tiling/hooks/use-tiling-drag-controller'
import type { TilingDragDebugLog } from '@workspace/tiling/hooks/use-tiling-drag-debug-log'
import { deriveLayoutGeometry, insetLayoutRect } from '@workspace/tiling/utils/layout-geometry'
import { visibleWindowIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import type {
  LayoutOperation,
  Surface,
  SurfaceId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'
import { cn } from '@workspace/ui/lib/utils'

const PROOF_SENSORS = [
  PointerSensor.configure({
    activationConstraints: () => [
      new PointerActivationConstraints.Distance({
        value: 4,
      }),
    ],
  }),
]

export type ProofInteractionController = {
  readonly flushPendingCommit: () => void
  readonly resetInteraction: () => void
}

export type ProofInteractionControllerRef = {
  current: ProofInteractionController
}

export const IDLE_PROOF_INTERACTION_CONTROLLER: ProofInteractionController = {
  flushPendingCommit: ignoreInteraction,
  resetInteraction: ignoreInteraction,
}

type SurfaceDataAttributes = Readonly<Record<`data-${string}`, string>>

export function ProofInteractionSurface({
  addTabVisible = true,
  ariaLabel,
  debugLog,
  debugOverlay,
  dropZonesVisible,
  interactionControllerRef,
  layout,
  renderSurfaceBody,
  surfaceBackdrop,
  surfaceClassName,
  surfaceDataAttributes,
  tabActionsVisible = visibleTabActions,
  windowActionsVisible = true,
  onAddTab = ignoreWindowOperation,
  onCloseSurface,
  onCloseWindow,
  onCommitLayout,
  onDispatchLayoutOperation,
  onSelectSurface,
}: {
  readonly addTabVisible?: boolean
  readonly ariaLabel: string
  readonly debugLog?: TilingDragDebugLog
  readonly debugOverlay?: ReactNode
  readonly dropZonesVisible: boolean
  readonly interactionControllerRef?: ProofInteractionControllerRef
  readonly layout: WorkspaceLayout
  readonly renderSurfaceBody?: (surface: Surface | null, window: WorkbenchWindow) => ReactNode
  readonly surfaceBackdrop?: ReactNode
  readonly surfaceClassName: string
  readonly surfaceDataAttributes?: SurfaceDataAttributes
  readonly tabActionsVisible?: (layout: WorkspaceLayout, window: WorkbenchWindow) => boolean
  readonly windowActionsVisible?: boolean
  readonly onAddTab?: (windowId: WorkbenchWindow['id']) => void
  readonly onCloseSurface: (surfaceId: SurfaceId) => void
  readonly onCloseWindow: (windowId: WorkbenchWindow['id']) => void
  readonly onCommitLayout: (nextLayout: WorkspaceLayout, event: TilingCommitEvent) => void
  readonly onDispatchLayoutOperation: (operation: LayoutOperation) => void
  readonly onSelectSurface: (surfaceId: SurfaceId) => void
}) {
  const [resizingWindows, setResizingWindows] = useState(false)
  const { rect, rootRef } = useLayoutRootRect(DEFAULT_LAYOUT_RECT)
  const rootRect = rect ?? DEFAULT_LAYOUT_RECT
  const surfaceRect = insetLayoutRect(rootRect, PROOF_GEOMETRY_OPTIONS.gapPx ?? 0)
  const committedGeometry = deriveLayoutGeometry(layout, surfaceRect, PROOF_GEOMETRY_OPTIONS)
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
    snapDestinations,
    snapLayout,
    tabStripRenderEpoch,
  } = useTilingDragController({
    coordinateRootRef: rootRef,
    debugLog,
    layout,
    rootRect: surfaceRect,
    snapDestinationRects: committedGeometry.snapDestinationRects,
    windowRectsById: committedGeometry.windowRectsById,
    onCommitLayout,
  })
  const renderLayout = previewLayout ?? layout
  const previewGeometry = previewLayout
    ? deriveLayoutGeometry(previewLayout, surfaceRect, PROOF_GEOMETRY_OPTIONS)
    : committedGeometry
  const visibleWindowIds = visibleWindowIdsInOrder(layout)
  const renderedWindowIds =
    insertionPreview?.kind === 'window-merge' && previewLayout
      ? visibleWindowIdsInOrder(previewLayout)
      : visibleWindowIds
  const optimisticTabSorting = !visibleWindowIds.some((windowId) => {
    return layout.windowsById[windowId]?.mode === 'collapsed'
  })
  const previewOnlyWindowIds = previewLayout
    ? visibleWindowIdsInOrder(previewLayout).filter((windowId) => !layout.windowsById[windowId])
    : []

  // No deps array on purpose: the controller functions are recreated by the
  // drag hook every render, so the ref must republish the latest closures.
  useEffect(() => {
    if (!interactionControllerRef) return

    interactionControllerRef.current = {
      flushPendingCommit,
      resetInteraction,
    }
  })

  function collapseWindowToTarget(windowId: WorkbenchWindow['id'], target: ProofCollapseTarget) {
    const window = layout.windowsById[windowId]
    if (!window) return

    onDispatchLayoutOperation({
      edge: collapseEdgeForTarget(target, {
        surfaceRect,
        windowId,
        windowRectsById: committedGeometry.windowRectsById,
      }),
      type: 'collapseWindow',
      windowId,
    })
  }

  function collapseWindowToRail(windowId: WorkbenchWindow['id']) {
    collapseWindowToTarget(windowId, 'rail')
  }

  function collapseWindowToRow(windowId: WorkbenchWindow['id']) {
    collapseWindowToTarget(windowId, 'row')
  }

  function expandWindow(windowId: WorkbenchWindow['id']) {
    const window = layout.windowsById[windowId]
    if (!window) return
    if (window.mode !== 'collapsed') return

    onDispatchLayoutOperation({
      type: 'expandWindow',
      windowId,
    })
  }

  return (
    <DragDropProvider
      sensors={PROOF_SENSORS}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
    >
      <section
        aria-label={ariaLabel}
        className={cn(surfaceClassName)}
        ref={rootRef}
        {...surfaceDataAttributes}
      >
        {surfaceBackdrop}
        {[...renderedWindowIds, ...previewOnlyWindowIds].map((windowId) => {
          const window = renderLayout.windowsById[windowId] ?? layout.windowsById[windowId]
          const windowRect =
            previewGeometry.windowRectsById[windowId] ?? committedGeometry.windowRectsById[windowId]
          if (!window) return null
          if (!windowRect) return null

          return (
            <ProofWindow
              activeDrag={activeDrag}
              addTabVisible={addTabVisible}
              dropZonesVisible={dropZonesVisible}
              insertionPreview={insertionPreview}
              insertionPreviewLayout={snapLayout}
              key={windowId}
              layout={renderLayout}
              optimisticTabSorting={optimisticTabSorting}
              preview={!layout.windowsById[windowId]}
              rect={windowRect.rect}
              renderSurfaceBody={renderSurfaceBody}
              resizingWindows={resizingWindows}
              tabActionsVisible={tabActionsVisible(renderLayout, window)}
              tabStripRenderEpoch={tabStripRenderEpoch}
              window={window}
              windowActionsVisible={windowActionsVisible}
              onAddTab={onAddTab}
              onCollapseWindowToRail={collapseWindowToRail}
              onCollapseWindowToRow={collapseWindowToRow}
              onCloseSurface={onCloseSurface}
              onCloseWindow={onCloseWindow}
              onExpandWindow={expandWindow}
              onSelectSurface={onSelectSurface}
            />
          )
        })}
        <ResizeOverlay
          resizeHandleRects={committedGeometry.resizeHandleRects}
          onDispatch={onDispatchLayoutOperation}
          onResizeEnd={() => setResizingWindows(false)}
          onResizeStart={() => setResizingWindows(true)}
        />
        {snapDestinations.map((snapDestination) => (
          <ProofSnapDestination
            active={activeResolvedTarget?.candidateId === snapDestination.id}
            candidate={snapDestination}
            key={snapDestination.id}
            visible={dropZonesVisible}
          />
        ))}
        <DropRegionOverlay
          activeDrag={activeDrag}
          activeResolvedTarget={activeResolvedTarget}
          rootRect={surfaceRect}
          visible={dropZonesVisible}
          windowRectsById={committedGeometry.windowRectsById}
        />
        {debugOverlay}
      </section>
      <ProofDragOverlay activeDrag={activeDrag} layout={layout} />
    </DragDropProvider>
  )
}

function visibleTabActions() {
  return true
}

function ignoreWindowOperation(windowId: WorkbenchWindow['id']) {
  void windowId
}

function ignoreInteraction() {}
