import { useCommand } from '@/keymap/hooks/use-command'
import { useAppKeymap } from '@/keymap/use-app-keymap'
import { useFocusSnapshot } from '@/lib/focus/hooks/use-snapshot'

export function AppKeymapController() {
  const { bindings, bus } = useCommand()
  const focus = useFocusSnapshot()

  useAppKeymap({
    bindings,
    bus,
    focusedPane: focus.currentOwner?.area ?? 'global',
  })

  return null
}
