import { useEffect, useEffectEvent, type RefObject } from 'react'

import { useCommand } from '@/keymap/hooks/use-command'

export function useTerminalKeybindings(hostRef: RefObject<HTMLElement | null>) {
  const { claimKeybinding } = useCommand()
  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (!claimKeybinding(event)) return

    // Ghostty encodes at the textarea, before document bubble can claim the key.
    event.stopImmediatePropagation()
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    host.addEventListener('keydown', handleKey, true)
    host.addEventListener('keyup', handleKey, true)

    return () => {
      host.removeEventListener('keydown', handleKey, true)
      host.removeEventListener('keyup', handleKey, true)
    }
  }, [hostRef])
}
