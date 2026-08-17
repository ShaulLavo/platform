import type { ILink, Terminal } from 'ghostty-web'
import { useEffectEvent } from 'react'

import { useOpenFileReference } from '@/features/chat/hooks/use-open-file-reference'
import { readTerminalPathLinks, type TerminalPathLink } from '@/features/terminal/utils/links'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { log } from '@/lib/client-logging'
import { statPath } from '@/lib/file-server'
import { isFileEntry } from '@/lib/file-system-types'

/** A click that has to wait on the filesystem still has to feel like a click. */
const STAT_TIMEOUT_MS = 2000

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
  const openTerminalPathLink = useEffectEvent(async (link: TerminalPathLink) => {
    const target = await statTerminalLinkTarget(link.reference.path)

    log.info({
      action: 'terminal.link.open',
      area: 'terminal',
      column: link.reference.column,
      isFile: target.isFile,
      line: link.reference.line,
      path: link.reference.path,
      // A relative path is the one resolution we cannot verify up front.
      relative: !link.text.startsWith('/'),
      rootPath,
    })

    if (!target.isFile) {
      reportError(terminalLinkError(target.error))
      return
    }

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

/**
 * The shell's cwd is invisible from here — ghostty-web reports no OSC 7 — so a
 * relative path resolves against the panel's root and is wrong for anything the
 * user `cd`-ed into. Confirming the file exists is what keeps that from opening
 * a tab on a path nothing ever wrote; the click reports the miss instead.
 */
async function statTerminalLinkTarget(path: string) {
  try {
    const entry = await statPath(workspaceRequestPath(path), AbortSignal.timeout(STAT_TIMEOUT_MS))

    return { error: null, isFile: isFileEntry(entry) }
  } catch (error) {
    return { error, isFile: false }
  }
}

/**
 * The fs routes address every path relative to the server's workspace root and
 * reject an absolute one outright; the shared resolver hands back the OS-shaped
 * form. One leading slash is the whole difference.
 */
function workspaceRequestPath(path: string) {
  return path.replace(/^\/+/u, '')
}

function terminalLinkError(error: unknown) {
  if (error) return toClientError(error)

  return {
    category: 'not_a_file' as const,
    message: 'That path is a directory, not a file.',
  }
}
