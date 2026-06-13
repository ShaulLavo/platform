import { useRef, useState } from 'react'

import { Rail } from '@/features/workbench/components/rail'
import { ShellProofKeymapController } from '@/features/shell-proof/components/keymap-controller'
import { SurfaceArea } from '@/features/shell-proof/components/surface-area'
import { Toolbar } from '@/features/shell-proof/components/toolbar'
import { EventLog } from '@/features/workbench/components/event-log'
import { IDLE_INTERACTION_CONTROLLER } from '@/features/workbench/components/interaction-surface'
import { layoutOperationLabel, windowModesLabel } from '@/features/workbench/utils/event-labels'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { useLayoutStoreApi } from '@/features/workbench/hooks/use-layout-store-api'
import { useTilingDragDebugLog } from '@workspace/tiling/hooks/use-tiling-drag-debug-log'
import { selectWorkbenchRailSurfaceItems } from '@workspace/tiling/utils/rail-model'
import type { LayoutOperation, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

const EVENT_LOG_LIMIT = 16

export function ShellProofLayout({ seedLayout }: { readonly seedLayout: WorkspaceLayout }) {
  const interactionControllerRef = useRef(IDLE_INTERACTION_CONTROLLER)
  const layoutStore = useLayoutStoreApi()
  const items = useLayoutState((state) => selectWorkbenchRailSurfaceItems(state.layout))
  const dispatchLayoutOperation = useLayoutState((state) => state.dispatchLayoutOperation)
  const resetLayout = useLayoutState((state) => state.resetLayout)
  const [events, setEvents] = useState<readonly string[]>([])
  const [dropZonesVisible, setDropZonesVisible] = useState(false)
  const dragDebugLog = useTilingDragDebugLog()

  function logEvent(event: string) {
    setEvents((current) => [event, ...current].slice(0, EVENT_LOG_LIMIT))
  }

  function dispatchOperationAfterInteraction(operation: LayoutOperation) {
    const controller = interactionControllerRef.current
    controller.flushPendingCommit()
    if (operation.type !== 'resizeSplit') controller.resetInteraction()

    logEvent(layoutOperationLabel(layoutStore.getState().layout, operation))
    dispatchLayoutOperation(operation)
    logStateAfterDispatch(operation)
  }

  function dispatchCurrentLayoutOperationAfterInteraction(
    createOperation: (layout: WorkspaceLayout) => LayoutOperation | null,
  ) {
    const controller = interactionControllerRef.current
    controller.flushPendingCommit()

    const layout = layoutStore.getState().layout
    const operation = createOperation(layout)
    if (!operation) return
    if (operation.type !== 'resizeSplit') controller.resetInteraction()

    logEvent(layoutOperationLabel(layout, operation))
    dispatchLayoutOperation(operation)
    logStateAfterDispatch(operation)
  }

  // Resize floods the log with identical state lines; every other operation
  // logs the resulting window arrangement so layout bugs are visible.
  function logStateAfterDispatch(operation: LayoutOperation) {
    if (operation.type === 'resizeSplit') return

    logEvent(`state: ${windowModesLabel(layoutStore.getState().layout)}`)
  }

  function resetLayoutAfterInteraction() {
    const controller = interactionControllerRef.current
    controller.flushPendingCommit()
    controller.resetInteraction()

    dragDebugLog.resetStateLog()
    setEvents(['reset layout'])
    resetLayout(seedLayout)
  }

  return (
    <>
      <ShellProofKeymapController
        onDispatchLayoutOperation={dispatchCurrentLayoutOperationAfterInteraction}
        onResetLayout={resetLayoutAfterInteraction}
      />
      <main
        className='bg-background text-foreground flex h-svh min-h-0 flex-col overflow-hidden'
        data-shell-proof=''
      >
        <Toolbar
          dropZonesVisible={dropZonesVisible}
          onReset={resetLayoutAfterInteraction}
          onToggleDropZones={() => setDropZonesVisible((visible) => !visible)}
        />
        <div className='flex min-h-0 flex-1'>
          <Rail
            getLayout={() => layoutStore.getState().layout}
            items={items}
            onDispatch={dispatchOperationAfterInteraction}
          />
          <SurfaceArea
            debugLog={dragDebugLog}
            dropZonesVisible={dropZonesVisible}
            interactionControllerRef={interactionControllerRef}
            onDispatchLayoutOperation={dispatchOperationAfterInteraction}
            onLogEvent={logEvent}
          />
          <div className='border-border w-72 shrink-0 overflow-hidden border-l p-3'>
            <EventLog events={events} stateEvents={dragDebugLog.stateEvents} />
          </div>
        </div>
      </main>
    </>
  )
}
