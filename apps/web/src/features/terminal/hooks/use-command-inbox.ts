import { useEffect, type RefObject } from 'react'

import { useTerminalCommandInboxStore } from '../state/command-inbox-store'

/**
 * Runs whatever the palette queued, in this terminal, once it can.
 *
 * Only the active terminal takes: a workspace can hold several, and a script
 * firing into a background one is a command the user never sees run. If none is
 * active the work stays queued until one is — which is also what covers the
 * ordinary case of picking a script before any terminal has been opened.
 *
 * `send` returning false means the socket is not up yet. The command goes back
 * on the queue rather than being written into a dead connection, and the next
 * render after the socket opens picks it up.
 */
export function useTerminalCommandInbox({
  active,
  sendInputRef,
}: {
  readonly active: boolean
  readonly sendInputRef: RefObject<((data: string) => boolean) | null>
}) {
  const pending = useTerminalCommandInboxStore((state) => state.pending)
  const take = useTerminalCommandInboxStore((state) => state.take)
  const queueCommand = useTerminalCommandInboxStore((state) => state.queueCommand)

  useEffect(() => {
    if (!active) return
    if (pending.length === 0) return

    const send = sendInputRef.current
    if (!send) return

    for (const command of take()) {
      // A carriage return, not a newline: that is what a shell reading a tty
      // treats as Enter, and without it the command sits on the prompt unrun.
      if (send(`${command}\r`)) continue

      queueCommand(command)
    }
  }, [active, pending, queueCommand, sendInputRef, take])
}
