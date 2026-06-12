import { DebugPanel } from '@/features/shell-proof/components/debug-panel'
import { SurfaceBody } from '@/features/shell-proof/components/surface-body'
import {
  ProofInteractionSurface,
  type ProofInteractionControllerRef,
} from '@/features/tiling-proof/components/interaction-surface'
import type { ProofCollapsedWindowHeaderInput } from '@/features/tiling-proof/components/window'
import { commitEventLabel } from '@/features/tiling-proof/utils/event-labels'
import { ToolPaneHeader } from '@/features/workbench/components/tool-pane-header'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import type { TilingDragDebugLog } from '@workspace/tiling/hooks/use-tiling-drag-debug-log'
import type {
  LayoutOperation,
  Surface,
  SurfaceId,
  WorkbenchWindow,
} from '@workspace/tiling/utils/layout-types'

export function SurfaceArea({
  debugLog,
  dropZonesVisible,
  interactionControllerRef,
  onDispatchLayoutOperation,
  onLogEvent,
}: {
  readonly debugLog: TilingDragDebugLog
  readonly dropZonesVisible: boolean
  readonly interactionControllerRef: ProofInteractionControllerRef
  readonly onDispatchLayoutOperation: (operation: LayoutOperation) => void
  readonly onLogEvent: (event: string) => void
}) {
  const layout = useLayoutState((state) => state.layout)
  const replaceLayout = useLayoutState((state) => state.replaceLayout)
  const debugVisible = shellProofDebugEnabled()

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

    for (const surfaceId of window.surfaceIds) {
      onDispatchLayoutOperation({ surfaceId, type: 'closeSurface' })
    }
  }

  return (
    <ProofInteractionSurface
      addTabVisible={false}
      ariaLabel='Shell proof surface area'
      debugLog={debugLog}
      debugOverlay={debugVisible ? <DebugPanel stateEvents={debugLog.stateEvents} /> : null}
      dropZonesVisible={dropZonesVisible}
      interactionControllerRef={interactionControllerRef}
      layout={layout}
      renderCollapsedHeader={renderCollapsedHeader}
      renderSurfaceBody={renderSurfaceBody}
      singleCollapseTarget='rail'
      surfaceClassName='relative isolate min-h-0 min-w-0 flex-1 overflow-hidden p-0'
      surfaceDataAttributes={{ 'data-shell-proof-surface-area': '' }}
      onCloseSurface={closeSurface}
      onCloseWindow={closeWindow}
      onCommitLayout={(nextLayout, event) => {
        onLogEvent(commitEventLabel(layout, event))
        replaceLayout(nextLayout)
      }}
      onDispatchLayoutOperation={dispatchOperation}
      onSelectSurface={activateSurface}
    />
  )
}

function shellProofDebugEnabled() {
  if (typeof window === 'undefined') return false

  return new URLSearchParams(window.location.search).has('debug')
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

function emptyWindowBody() {
  return (
    <div className='text-muted-foreground grid h-full place-items-center text-sm'>
      No active surface
    </div>
  )
}
