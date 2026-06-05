import { useWorkspaceFocus } from '@/components/workspace/focus/providers/workspace-focus-state'
import { useAppKeymap, type PlatformCommandDispatch, type PlatformKeyBinding } from '@/keymap'

type AppKeymapControllerProps = {
  bindings: readonly PlatformKeyBinding[]
  dispatch: PlatformCommandDispatch
}

export function AppKeymapController({ bindings, dispatch }: AppKeymapControllerProps) {
  const focusedPane = useWorkspaceFocus((state) => state.activeArea)

  useAppKeymap({
    bindings,
    dispatch,
    focusedPane,
  })

  return null
}
