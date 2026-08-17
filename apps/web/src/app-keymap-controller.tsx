import { useFocus } from '@/features/workspace/providers/focus-state'
import { useAppKeymap, type PlatformCommandDispatch } from '@/keymap/use-app-keymap'
import type { PlatformKeyBinding } from '@/keymap/types'

type AppKeymapControllerProps = {
  bindings: readonly PlatformKeyBinding[]
  dispatch: PlatformCommandDispatch
}

export function AppKeymapController({ bindings, dispatch }: AppKeymapControllerProps) {
  const focusedPane = useFocus((state) => state.activeArea)

  useAppKeymap({
    bindings,
    dispatch,
    focusedPane,
  })

  return null
}
