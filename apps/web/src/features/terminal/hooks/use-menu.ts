import { useEffect, useState } from 'react'

import { isClipboardReadBlocked } from '@/features/terminal/utils/clipboard'
import {
  clearTerminal,
  pasteFromClipboard,
  resetTerminal,
  selectAllInTerminal,
  type TerminalMenuTarget,
} from '@/features/terminal/utils/commands'
import { terminalMenu } from '@/features/terminal/utils/menu'
import { copyTextToClipboard } from '@/lib/clipboard'

export function useTerminalMenu(target: TerminalMenuTarget) {
  // Asked per open rather than once per app: the user can grant or revoke
  // clipboard access from the omnibox at any time, and this hook only runs
  // while a menu is actually on screen.
  const [pasteBlocked, setPasteBlocked] = useState(false)

  useEffect(() => {
    let active = true

    void isClipboardReadBlocked().then((blocked) => {
      if (!active) return

      setPasteBlocked(blocked)
    })

    return () => {
      active = false
    }
  }, [])

  return terminalMenu({
    clear: () => clearTerminal(target.terminal),
    copySelection: () => void copyTextToClipboard(target.selection, 'selection'),
    hasScrollback: target.hasScrollback,
    hasSelection: target.selection.length > 0,
    paste: () => void pasteFromClipboard(target.terminal),
    pasteBlocked,
    reset: () => resetTerminal(target.terminal),
    scrollToBottom: () => target.terminal.scrollToBottom(),
    scrollToTop: () => target.terminal.scrollToTop(),
    selectAll: () => selectAllInTerminal(target.terminal),
  })
}
