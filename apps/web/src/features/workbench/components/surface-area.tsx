import { useRef } from 'react'

import {
  IDLE_INTERACTION_CONTROLLER,
  InteractionSurface,
} from '@/features/workbench/components/interaction-surface'
import { SurfaceRendererHost } from '@/features/workbench/components/surface-renderer-host'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/editor-workspace-state'
import { commitEventLabel } from '@/features/workbench/utils/event-labels'
import {
  layoutSnapshot,
  logWorkbenchLayoutInfo,
  logWorkbenchLayoutWarn,
  visibleLayoutChanged,
} from '@/features/tiling-surface-manager/engine/layout-logging'
import type { TilingCommitEvent } from '@workspace/tiling/hooks/use-tiling-drag-controller'
import { checkWorkspaceLayoutInvariants } from '@workspace/tiling/utils/layout-invariants'
import type { SurfaceRendererRegistry } from '@/features/workbench/utils/surface-renderer-registry'
import type {
  LayoutOperation,
  Surface,
  SurfaceId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export function SurfaceArea({
  surfaceRenderers,
}: {
  readonly surfaceRenderers: SurfaceRendererRegistry
}) {
  const layout = useLayoutState((state) => state.layout)
  const dispatchLayoutOperation = useLayoutState((state) => state.dispatchLayoutOperation)
  const workspaceStore = useEditorWorkspaceStoreApi()
  const interactionControllerRef = useRef(IDLE_INTERACTION_CONTROLLER)

  function activateSurface(surfaceId: SurfaceId) {
    dispatchLayoutOperation({ surfaceId, type: 'activateSurface' })
  }

  function closeSurface(surfaceId: SurfaceId) {
    dispatchLayoutOperation({ surfaceId, type: 'closeSurface' })
  }

  function closeWindow(windowId: WorkbenchWindow['id']) {
    const window = layout.windowsById[windowId]
    if (!window) return

    const controller = interactionControllerRef.current
    controller.flushPendingCommit()
    controller.resetInteraction()

    for (const surfaceId of window.surfaceIds) {
      dispatchLayoutOperation({ surfaceId, type: 'closeSurface' })
    }
  }

  // A drag commits a whole new layout: push it to the editor workspace store
  // (the source of truth); the layout store mirrors it back via subscription.
  // Drags bypass the operation dispatcher, so this is the only place that can
  // log them — and the only place to catch a drag that corrupts the tree.
  function commitLayout(nextLayout: WorkspaceLayout, event: TilingCommitEvent) {
    logDragCommit(layout, nextLayout, event)
    workspaceStore.getState().setWorkspaceLayout(nextLayout)
  }

  return (
    <InteractionSurface
      ariaLabel='Workbench surface area'
      dropZonesVisible={false}
      interactionControllerRef={interactionControllerRef}
      layout={layout}
      renderSurfaceBody={(surface, window) =>
        renderSurfaceBody(surface, window, layout, surfaceRenderers)
      }
      surfaceBodyClassName=''
      surfaceClassName='relative isolate min-h-0 min-w-0 flex-1 overflow-hidden p-0'
      surfaceDataAttributes={{ 'data-workbench-surface-area': '' }}
      onCloseSurface={closeSurface}
      onCloseWindow={closeWindow}
      onCommitLayout={commitLayout}
      onDispatchLayoutOperation={(operation: LayoutOperation) => dispatchLayoutOperation(operation)}
      onSelectSurface={activateSurface}
    />
  )
}

function logDragCommit(before: WorkspaceLayout, after: WorkspaceLayout, event: TilingCommitEvent) {
  const context = {
    before: layoutSnapshot(before),
    changed: visibleLayoutChanged(before, after),
    commit: commitEventLabel(before, event),
    dispatcher: 'drag' as const,
    operation: { source: event.source.kind, target: event.target.kind },
    result: layoutSnapshot(after),
    source: 'drag-commit',
  }
  const report = checkWorkspaceLayoutInvariants(after)
  if (report.ok) {
    logWorkbenchLayoutInfo('layout.operation.dispatch', { ...context, outcome: 'ok' })
    return
  }

  logWorkbenchLayoutWarn('layout.invariant.violation', {
    ...context,
    outcome: 'invalid',
    violations: report.violations.map((violation) => violation.code),
  })
}

function renderSurfaceBody(
  surface: Surface | null,
  window: WorkbenchWindow,
  layout: WorkspaceLayout,
  surfaceRenderers: SurfaceRendererRegistry,
) {
  if (!surface) return emptyWindowBody()

  return (
    <SurfaceRendererHost
      active={layout.activeWindowId === window.id}
      surface={surface}
      surfaceRenderers={surfaceRenderers}
      windowId={window.id}
    />
  )
}

function emptyWindowBody() {
  return (
    <div className='text-muted-foreground grid h-full place-items-center text-sm'>
      No active surface
    </div>
  )
}
