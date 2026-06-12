import { selectWorkbenchRailItems } from '@workspace/tiling/utils/rail-model'
import { useLayoutStoreApi } from '@/features/workbench/hooks/use-layout-store-api'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { Rail } from '@/features/workbench/components/rail'
import { railItemsEqual } from '@/features/workbench/utils/rail-equality'
import type { LayoutOperation } from '@workspace/tiling/utils/layout-types'

export function LayoutRail({
  onDispatch,
}: {
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  const layoutStore = useLayoutStoreApi()
  const items = useLayoutState((state) => selectWorkbenchRailItems(state.layout), railItemsEqual)

  return (
    <Rail getLayout={() => layoutStore.getState().layout} items={items} onDispatch={onDispatch} />
  )
}
