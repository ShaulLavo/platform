import { useRef, useState } from 'react'

import { ProofEventLog } from '@/features/tiling-proof/components/event-log'
import { ProofToolbar } from '@/features/dnd-proof/components/proof-toolbar'
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
  IDLE_PROOF_INTERACTION_CONTROLLER,
  ProofInteractionSurface,
} from '@/features/tiling-proof/components/interaction-surface'
import { useTilingDragDebugLog } from '@workspace/tiling/hooks/use-tiling-drag-debug-log'
import { visibleWindowIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import type { LayoutOperation, SurfaceId, WindowId } from '@workspace/tiling/utils/layout-types'

export function DndProofView() {
  const [model, setModel] = useState(createInitialProofModel)
  const [dropZonesVisible, setDropZonesVisible] = useState(false)
  const interactionControllerRef = useRef(IDLE_PROOF_INTERACTION_CONTROLLER)
  const dragDebugLog = useTilingDragDebugLog()
  const visibleWindowIds = visibleWindowIdsInOrder(model.layout)
  const surfaceCount = visibleWindowIds.reduce((count, windowId) => {
    const window = model.layout.windowsById[windowId]
    if (!window) return count

    return count + window.surfaceIds.length
  }, 0)

  function addWindow() {
    const controller = interactionControllerRef.current
    controller.flushPendingCommit()
    controller.resetInteraction()
    setModel((current) => addProofWindow(current))
  }

  function addTab(windowId?: WindowId) {
    const controller = interactionControllerRef.current
    controller.flushPendingCommit()
    controller.resetInteraction()
    setModel((current) => addProofTab(current, windowId))
  }

  function activateSurface(surfaceId: SurfaceId | undefined) {
    if (!surfaceId) return

    interactionControllerRef.current.flushPendingCommit()
    setModel((current) => activateProofSurface(current, surfaceId))
  }

  function dispatchLayoutOperation(operation: LayoutOperation) {
    const controller = interactionControllerRef.current
    controller.flushPendingCommit()
    if (operation.type !== 'resizeSplit') controller.resetInteraction()

    setModel((current) => dispatchProofLayoutOperation(current, operation))
  }

  function removeSurface(surfaceId: SurfaceId | undefined) {
    if (!surfaceId) return

    const controller = interactionControllerRef.current
    controller.flushPendingCommit()
    controller.resetInteraction()
    setModel((current) => removeProofSurface(current, surfaceId))
  }

  function removeWindow(windowId: WindowId | undefined) {
    if (!windowId) return

    const controller = interactionControllerRef.current
    controller.flushPendingCommit()
    controller.resetInteraction()
    setModel((current) => removeProofWindow(current, windowId))
  }

  function reset() {
    interactionControllerRef.current.resetInteraction()
    dragDebugLog.resetStateLog()
    setModel(createInitialProofModel())
  }

  function setScenario(windowCount: Parameters<typeof createProofScenarioModel>[0]) {
    interactionControllerRef.current.resetInteraction()
    dragDebugLog.resetStateLog()
    setModel(createProofScenarioModel(windowCount))
  }

  return (
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
        <ProofInteractionSurface
          ariaLabel='dnd-kit tiling proof surface'
          debugLog={dragDebugLog}
          dropZonesVisible={dropZonesVisible}
          interactionControllerRef={interactionControllerRef}
          layout={model.layout}
          surfaceBackdrop={
            <div
              aria-hidden='true'
              className="pointer-events-none absolute inset-0 z-0 bg-[url('/workbench/wallpaper.png')] bg-cover bg-center opacity-45"
            />
          }
          surfaceClassName='bg-muted/20 border-border relative isolate min-h-0 min-w-0 overflow-hidden rounded-md border'
          surfaceDataAttributes={{ 'data-proof-surface-area': '' }}
          onAddTab={addTab}
          onCloseSurface={removeSurface}
          onCloseWindow={removeWindow}
          onCommitLayout={(layout, event) => {
            setModel((current) => commitProofLayout(current, layout, event))
          }}
          onDispatchLayoutOperation={dispatchLayoutOperation}
          onSelectSurface={activateSurface}
        />
        <ProofEventLog events={model.events} stateEvents={dragDebugLog.stateEvents} />
      </div>
    </main>
  )
}
