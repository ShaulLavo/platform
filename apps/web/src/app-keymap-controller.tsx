import { useCommand } from '@/keymap/hooks/use-command'
import { PendingChordIndicator } from '@/keymap/components/pending-chord-indicator'

export function AppKeymapController() {
  const { pendingChord } = useCommand()

  return <PendingChordIndicator pending={pendingChord} />
}
