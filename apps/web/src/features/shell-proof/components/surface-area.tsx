import { PointerActivationConstraints } from '@dnd-kit/dom'
import { DragDropProvider, PointerSensor } from '@dnd-kit/react'
import { useEffect, useState } from 'react'

import { ProofDragOverlay } from '@/features/dnd-proof/components/proof-drag-overlay'
import { ProofPreviewWindow } from '@/features/dnd-proof/components/proof-preview-window'
import { ProofSnapDestination } from '@/features/dnd-proof/components/proof-snap-destination'
import {
  ProofWindow,
  type ProofCollapsedWindowHeaderInput,
} from '@/features/dnd-proof/components/proof-window'
import { DebugPanel } from '@/features/shell-proof/components/debug-panel'
import { SurfaceBody } from '@/features/shell-proof/components/surface-body'
import {
  bottomPaneCloseWindowOperation,
  isBottomPaneWindow,
} from '@workspace/tiling/utils/bottom-pane-model'
import { ResizeOverlay } from '@/features/workbench/components/resize-overlay'
import { ToolPaneHeader } from '@/features/workbench/components/tool-pane-header'
import { useLayoutRootRect } from '@/features/workbench/hooks/use-layout-root-rect'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { useTilingDragController } from '@workspace/tiling/hooks/use-tiling-drag-controller'
import { useTilingDragDebugLog } from '@workspace/tiling/hooks/use-tiling-drag-debug-log'
import {
  deriveLayoutGeometry,
  insetLayoutRect,
  type LayoutGeometryOptions,
  type LayoutRect,
} from '@workspace/tiling/utils/layout-geometry'
import { visibleWindowIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import type {
  LayoutOperation,
  Surface,
  SurfaceId,
  WorkbenchWindow,
} from '@workspace/tiling/utils/layout-types'

const SHELL_PROOF_SENSORS = [
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
}

export type ShellProofInteractionController = {
  readonly flushPendingCommit: () => void
  readonly resetInteraction: () => void
}

type ShellProofInteractionControllerRef = {
  current: ShellProofInteractionController
}

export function SurfaceArea({
  interactionControllerRef,
  onDispatchLayoutOperation,
}: {
  readonly interactionControllerRef: ShellProofInteractionControllerRef
  readonly onDispatchLayoutOperation: (operation: LayoutOperation) => void
}) {
  const [resizingWindows, setResizingWindows] = useState(false)
  const layout = useLayoutState((state) => state.layout)
  const replaceLayout = useLayoutState((state) => state.replaceLayout)
  const { rect, rootRef } = useLayoutRootRect(DEFAULT_LAYOUT_RECT)
  const rootRect = rect ?? DEFAULT_LAYOUT_RECT
  const surfaceRect = insetLayoutRect(rootRect, GEOMETRY_OPTIONS.gapPx ?? 0)
  const committedGeometry = deriveLayoutGeometry(layout, surfaceRect, GEOMETRY_OPTIONS)
  const debugVisible = shellProofDebugEnabled()
  const dragDebugLog = useTilingDragDebugLog()
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
    debugLog: debugVisible ? dragDebugLog : undefined,
    layout,
    rootRect: surfaceRect,
    snapDestinationRects: committedGeometry.snapDestinationRects,
    windowRectsById: committedGeometry.windowRectsById,
    onCommitLayout: (nextLayout) => {
      replaceLayout(nextLayout)
    },
  })
  const renderLayout = previewLayout ?? layout
  const previewGeometry = previewLayout
    ? deriveLayoutGeometry(previewLayout, surfaceRect, GEOMETRY_OPTIONS)
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

  useEffect(() => {
    interactionControllerRef.current = {
      flushPendingCommit,
      resetInteraction,
    }
  })

  function dispatchOperation(operation: LayoutOperation) {
    onDispatchLayoutOperation(operation)
  }

  function activateSurface(surfaceId: SurfaceId) {
    dispatchOperation({ surfaceId, type: 'activateSurface' })
  }

  function closeSurface(surfaceId: SurfaceId) {
    dispatchOperation({ surfaceId, type: 'closeSurface' })
  }

  function closeWindow(windowId: WorkbenchWindow['id']) {
    const window = layout.windowsById[windowId]
    if (!window) return

    flushPendingCommit()
    resetInteraction()
    if (isBottomPaneWindow(layout, window)) {
      dispatchOperation(bottomPaneCloseWindowOperation(windowId))
      return
    }

    for (const surfaceId of window.surfaceIds) {
      onDispatchLayoutOperation({ surfaceId, type: 'closeSurface' })
    }
  }

  function collapseWindow(windowId: WorkbenchWindow['id']) {
    if (!layout.windowsById[windowId]) return

    dispatchOperation({
      type: 'collapseWindow',
      windowId,
    })
  }

  function expandWindow(windowId: WorkbenchWindow['id']) {
    const window = layout.windowsById[windowId]
    if (!window) return
    if (window.mode !== 'collapsed') return

    dispatchOperation({
      type: 'expandWindow',
      windowId,
    })
  }

  return (
    <DragDropProvider
      sensors={SHELL_PROOF_SENSORS}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
    >
      <section
        aria-label='Shell proof surface area'
        className='relative isolate min-h-0 min-w-0 flex-1 overflow-hidden p-0'
        data-shell-proof-surface-area=''
        ref={rootRef}
      >
        {renderedWindowIds.length > 0
          ? renderedWindowIds.map((windowId) => {
              const window = renderLayout.windowsById[windowId] ?? layout.windowsById[windowId]
              const windowRect =
                previewGeometry.windowRectsById[windowId] ??
                committedGeometry.windowRectsById[windowId]
              if (!window) return null
              if (!windowRect) return null

              return (
                <ProofWindow
                  activeDrag={activeDrag}
                  addTabVisible={false}
                  collapseControls='single'
                  dropZonesVisible={debugVisible}
                  insertionPreview={insertionPreview}
                  insertionPreviewLayout={snapLayout}
                  key={windowId}
                  layout={renderLayout}
                  optimisticTabSorting={optimisticTabSorting}
                  rect={windowRect.rect}
                  renderCollapsedHeader={renderCollapsedHeader}
                  renderSurfaceBody={renderSurfaceBody}
                  resizingWindows={resizingWindows}
                  tabActionsVisible={!isBottomPaneWindow(renderLayout, window)}
                  tabStripRenderEpoch={tabStripRenderEpoch}
                  window={window}
                  onAddTab={ignoreWindowOperation}
                  onCollapseWindow={collapseWindow}
                  onCollapseWindowToRail={collapseWindow}
                  onCollapseWindowToRow={collapseWindow}
                  onCloseSurface={closeSurface}
                  onCloseWindow={closeWindow}
                  onExpandWindow={expandWindow}
                  onSelectSurface={activateSurface}
                />
              )
            })
          : emptySurfaceArea()}
        {previewOnlyWindowIds.map((windowId) => {
          const windowRect = previewGeometry.windowRectsById[windowId]
          if (!windowRect) return null

          return <ProofPreviewWindow key={windowId} rect={windowRect.rect} />
        })}
        <ResizeOverlay
          resizeHandleRects={committedGeometry.resizeHandleRects}
          onDispatch={dispatchOperation}
          onResizeEnd={() => setResizingWindows(false)}
          onResizeStart={() => setResizingWindows(true)}
        />
        {debugVisible
          ? snapDestinations.map((snapDestination) => (
              <ProofSnapDestination
                key={snapDestination.id}
                active={activeResolvedTarget?.candidateId === snapDestination.id}
                candidate={snapDestination}
                visible={debugVisible}
              />
            ))
          : null}
        {debugVisible ? <DebugPanel stateEvents={dragDebugLog.stateEvents} /> : null}
      </section>
      <ProofDragOverlay activeDrag={activeDrag} layout={layout} />
    </DragDropProvider>
  )
}

function renderSurfaceBody(surface: Surface | null) {
  if (!surface) return emptyWindowBody()

  return <SurfaceBody surface={surface} />
}

function renderCollapsedHeader(input: ProofCollapsedWindowHeaderInput) {
  if (!input.activeSurface) return null
  if (!isLeftToolPaneSurface(input.activeSurface)) return null

  return (
    <ToolPaneHeader
      collapsed
      dragHandleRef={input.dragHandleRef}
      orientation={input.chromeOrientation}
      surface={input.activeSurface}
      onClose={input.onClose}
      onToggleCollapse={input.onExpand}
    />
  )
}

function isLeftToolPaneSurface(surface: Surface) {
  if (surface.type === 'chat') return true
  if (surface.type === 'file-navigator') return true
  if (surface.type === 'git-changes') return true
  if (surface.type === 'logs') return true

  return surface.type === 'search-results'
}

function ignoreWindowOperation(windowId: WorkbenchWindow['id']) {
  void windowId
}

function shellProofDebugEnabled() {
  if (typeof window === 'undefined') return false

  return new URLSearchParams(window.location.search).has('debug')
}

function emptyWindowBody() {
  return (
    <div className='text-muted-foreground grid h-full place-items-center text-sm'>
      No active surface
    </div>
  )
}

function emptySurfaceArea() {
  return (
    <div className='border-border text-muted-foreground grid h-full place-items-center rounded-md border border-dashed text-sm'>
      No visible surfaces
    </div>
  )
}
