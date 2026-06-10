import { DebugPanel } from '@/features/shell-proof/components/debug-panel'
import { SurfaceBody } from '@/features/shell-proof/components/surface-body'
import {
  ProofInteractionSurface,
  type ProofInteractionController,
} from '@/features/tiling-proof/components/interaction-surface'
import type { ProofCollapsedWindowHeaderInput } from '@/features/tiling-proof/components/window'
import {
  bottomPaneCloseWindowOperation,
  isBottomPaneWindow,
} from '@workspace/tiling/utils/bottom-pane-model'
import { ToolPaneHeader } from '@/features/workbench/components/tool-pane-header'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { useTilingDragDebugLog } from '@workspace/tiling/hooks/use-tiling-drag-debug-log'
import type {
  LayoutOperation,
  Surface,
  SurfaceId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

type ShellProofInteractionControllerRef = {
  current: ProofInteractionController
}

export function SurfaceArea({
  interactionControllerRef,
  onDispatchLayoutOperation,
}: {
  readonly interactionControllerRef: ShellProofInteractionControllerRef
  readonly onDispatchLayoutOperation: (operation: LayoutOperation) => void
}) {
  const layout = useLayoutState((state) => state.layout)
  const replaceLayout = useLayoutState((state) => state.replaceLayout)
  const debugVisible = shellProofDebugEnabled()
  const dragDebugLog = useTilingDragDebugLog()

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

    const controller = interactionControllerRef.current
    controller.flushPendingCommit()
    controller.resetInteraction()
    if (isBottomPaneWindow(layout, window)) {
      dispatchOperation(bottomPaneCloseWindowOperation(windowId))
      return
    }

    for (const surfaceId of window.surfaceIds) {
      onDispatchLayoutOperation({ surfaceId, type: 'closeSurface' })
    }
  }

  return (
    <ProofInteractionSurface
      addTabVisible={false}
      ariaLabel='Shell proof surface area'
      debugLog={debugVisible ? dragDebugLog : undefined}
      debugOverlay={debugVisible ? <DebugPanel stateEvents={dragDebugLog.stateEvents} /> : null}
      dropZonesVisible={debugVisible}
      emptyContent={emptySurfaceArea()}
      interactionControllerRef={interactionControllerRef}
      layout={layout}
      renderCollapsedHeader={renderCollapsedHeader}
      renderSurfaceBody={renderSurfaceBody}
      singleCollapseTarget='rail'
      snapDestinationsMounted={debugVisible}
      surfaceClassName='relative isolate min-h-0 min-w-0 flex-1 overflow-hidden p-0'
      surfaceDataAttributes={{ 'data-shell-proof-surface-area': '' }}
      tabActionsVisible={shellTabActionsVisible}
      onCloseSurface={closeSurface}
      onCloseWindow={closeWindow}
      onCommitLayout={(nextLayout) => {
        replaceLayout(nextLayout)
      }}
      onDispatchLayoutOperation={dispatchOperation}
      onSelectSurface={activateSurface}
    />
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

function shellTabActionsVisible(layout: WorkspaceLayout, window: WorkbenchWindow) {
  return !isBottomPaneWindow(layout, window)
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
  return <div />
}
