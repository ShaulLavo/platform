import { useCallback } from 'react'

import { useMenuCommand } from '@/features/menus/providers/command-context'
import { log } from '@/lib/client-logging'

import type { TerminalContextSelection } from '../lib/terminal-context'
import { useTerminalContextInboxStore } from '../state/terminal-context-inbox-store'

/**
 * Hands a capture from anywhere in the app to the chat composer and brings the
 * composer on screen. Returns whether the capture was worth attaching, so a
 * caller can leave its affordance disabled for an empty selection.
 */
export function useAttachTerminalContext() {
  const runCommand = useMenuCommand((state) => state.runCommand)

  return useCallback(
    (selection: TerminalContextSelection | null) => {
      if (!selection) return false

      const queued = useTerminalContextInboxStore.getState().queue(selection)
      if (!queued) return false

      // Reveal after queueing: in the workbench this is what mounts the
      // composer that drains the inbox.
      const revealed = runCommand('workspace.revealChat')

      log.info({
        action: 'chat.terminal_context.attach',
        area: 'chat',
        lineEnd: queued.lineEnd,
        lineStart: queued.lineStart,
        revealed,
        source: queued.source,
        // The captured output is user content and stays off the event; its size
        // is what explains a slow send or a rejected message.
        textLength: queued.text.length,
      })

      return true
    },
    [runCommand],
  )
}
