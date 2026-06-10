import { useRef } from 'react'

import { Rail } from '@/features/workbench/components/rail'
import { ShellProofKeymapController } from '@/features/shell-proof/components/keymap-controller'
import {
  SurfaceArea,
  type ShellProofInteractionController,
} from '@/features/shell-proof/components/surface-area'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { useLayoutStoreApi } from '@/features/workbench/hooks/use-layout-store-api'
import { selectWorkbenchRailItems } from '@workspace/tiling/utils/rail-model'
import type { LayoutOperation, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

const IDLE_INTERACTION_CONTROLLER: ShellProofInteractionController = {
  flushPendingCommit: ignoreInteraction,
  resetInteraction: ignoreInteraction,
}

export function ShellProofLayout({ seedLayout }: { readonly seedLayout: WorkspaceLayout }) {
  const interactionControllerRef = useRef<ShellProofInteractionController>(
    IDLE_INTERACTION_CONTROLLER,
  )
  const layoutStore = useLayoutStoreApi()
  const items = useLayoutState((state) => selectWorkbenchRailItems(state.layout))
  const dispatchLayoutOperation = useLayoutState((state) => state.dispatchLayoutOperation)
  const resetLayout = useLayoutState((state) => state.resetLayout)

  function dispatchOperationAfterInteraction(operation: LayoutOperation) {
    const controller = interactionControllerRef.current
    controller.flushPendingCommit()
    if (operation.type !== 'resizeSplit') controller.resetInteraction()

    dispatchLayoutOperation(operation)
  }

  function dispatchCurrentLayoutOperationAfterInteraction(
    createOperation: (layout: WorkspaceLayout) => LayoutOperation | null,
  ) {
    const controller = interactionControllerRef.current
    controller.flushPendingCommit()

    const operation = createOperation(layoutStore.getState().layout)
    if (!operation) return
    if (operation.type !== 'resizeSplit') controller.resetInteraction()

    dispatchLayoutOperation(operation)
  }

  function resetLayoutAfterInteraction() {
    const controller = interactionControllerRef.current
    controller.flushPendingCommit()
    controller.resetInteraction()

    resetLayout(seedLayout)
  }

  return (
    <>
      <ShellProofKeymapController
        onDispatchLayoutOperation={dispatchCurrentLayoutOperationAfterInteraction}
        onResetLayout={resetLayoutAfterInteraction}
      />
      <main
        className='bg-background text-foreground flex h-svh min-h-0 overflow-hidden'
        data-shell-proof=''
      >
        <Rail
          getLayout={() => layoutStore.getState().layout}
          items={items}
          onDispatch={dispatchOperationAfterInteraction}
        />
        <SurfaceArea
          interactionControllerRef={interactionControllerRef}
          onDispatchLayoutOperation={dispatchOperationAfterInteraction}
        />
      </main>
    </>
  )
}

function ignoreInteraction() {}
