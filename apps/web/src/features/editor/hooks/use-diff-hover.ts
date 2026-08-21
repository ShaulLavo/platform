import type { EditorPlugin, EditorTheme } from '@singapor/core'
import type { DiffFile, DiffRenderRow } from '@singapor/diff'
import { pathOrUriToDocumentUri } from '@singapor/lsp-plugin/paths'
import { useLayoutEffect, useMemo, useState } from 'react'

import { languageServerClientFor } from '@/features/editor/state/language-server-clients'
import { createDiffHoverPlugin } from '@/features/editor/utils/diff-hover-plugin'
import { hoverMarkup, type HoverResponse } from '@/features/editor/utils/hover-markup'
import { diffQueryTargetAt } from '@/features/editor/utils/diff-language-query'
import { createDiffPositionMap } from '@/features/editor/utils/diff-position-map'

export type DiffLanguageServerContext = {
  /** The text whichever editor owns this path currently holds, or null if nothing does. */
  readonly ownedText: string | null
  readonly rootPath: string
}

/**
 * Hover for a diff pane, answered through a connection some real editor already owns.
 *
 * The diff never opens a document. It maps the row under the pointer to a line of the new file and
 * asks about the URI the owning editor opened, because a read-only request needs the server to
 * HAVE the document rather than for the asker to own it.
 */
export function useDiffHover(
  file: DiffFile,
  rows: readonly DiffRenderRow[],
  theme: EditorTheme,
  languageServer: DiffLanguageServerContext | null,
): EditorPlugin | null {
  const map = useMemo(() => createDiffPositionMap(rows, file.newLines), [file.newLines, rows])
  const newText = useMemo(() => file.newLines.join('\n'), [file.newLines])
  const path = file.newPath || file.path

  // A plain holder the plugin reads from, so its identity stays stable across renders — a fresh
  // plugin per render would tear the view contribution down and rebuild its tooltip on every mouse
  // move. Not a `useRef`: the React Compiler forbids touching `.current` during render, and this is
  // written on commit and read later, from event handlers.
  const [latest] = useState(() => ({ languageServer, map, newText, path, theme }))
  useLayoutEffect(() => {
    Object.assign(latest, { languageServer, map, newText, path, theme })
  })

  // Only whether a context exists rebuilds the plugin; its contents are read live from the holder.
  const available = languageServer !== null

  return useMemo(() => {
    if (!available) return null

    return createDiffHoverPlugin({
      resolve: (offset) =>
        diffQueryTargetAt({
          map: latest.map,
          newText: latest.newText,
          offset,
          ownedText: latest.languageServer?.ownedText ?? null,
        }),
      hover: async (target) => {
        const context = latest.languageServer
        if (!context) return null

        const found = languageServerClientFor(context.rootPath, latest.path)
        // Not the same question as "is there a connection": an answer is only true if the server
        // holds this document, and it holds it because that editor opened it.
        if (!found?.ownsFile) return null

        const hover = await found.client.request<HoverResponse | null>('textDocument/hover', {
          position: target.position,
          textDocument: { uri: pathOrUriToDocumentUri(latest.path) },
        })
        return hoverMarkup(hover)
      },
      theme: () => latest.theme,
    })
  }, [available, latest])
}
