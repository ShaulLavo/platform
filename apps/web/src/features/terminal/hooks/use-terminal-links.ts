import type { ILink, Terminal } from 'ghostty-web'
import { useEffectEvent } from 'react'

import { useOpenFileReference } from '@/features/chat/hooks/use-open-file-reference'
import { readTerminalPathLinks, type TerminalPathLink } from '@/features/terminal/utils/links'

/**
 * Ctrl/Cmd-click a path in terminal output to open it in the editor. ghostty
 * already ships URL and OSC 8 providers, so this one adds file paths only, and
 * it opens them through the transcript's file-reference command rather than
 * inventing a second way in.
 */
export function useTerminalLinks(rootPath: string) {
  const { openFileReference } = useOpenFileReference()

  // ghostty has no way to unregister a provider, so it outlives the render that
  // registered it. Reading the open command through an effect event keeps a
  // click pointed at the current editor instead of the one that existed then.
  const openTerminalPathLink = useEffectEvent((link: TerminalPathLink) => {
    openFileReference(link.reference)
  })

  return (terminal: Terminal) => {
    terminal.registerLinkProvider({
      provideLinks: (row, callback) => {
        // Scrollback rows always report `isWrapped: false` from ghostty, so a
        // path only reassembles across a soft wrap while it is still on screen.
        const links = readTerminalPathLinks({
          getLine: (index) => terminal.buffer.active.getLine(index),
          rootPath,
          row,
        })
        if (links.length === 0) {
          callback(undefined)
          return
        }

        callback(links.map((link) => ghosttyLink(link, openTerminalPathLink)))
      },
    })
  }
}

function ghosttyLink(link: TerminalPathLink, open: (link: TerminalPathLink) => void): ILink {
  return {
    // ghostty hands every click to the link it hit; gating on the modifier is
    // the provider's job, the same as in its built-in URL provider.
    activate: (event) => {
      if (!event.ctrlKey && !event.metaKey) return

      open(link)
    },
    range: link.range,
    text: link.text,
  }
}
