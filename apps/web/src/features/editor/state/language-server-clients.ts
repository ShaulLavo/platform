import type { LspClient } from '@singapor/lsp'

/**
 * The language-server connections real editors have opened, so a read-only surface can ASK one a
 * question without becoming a second owner of the document.
 *
 * Hover, definition and references are read-only requests over `(uri, position)`: they need the
 * server to HAVE the document, not for the asker to own it. So the editor that legitimately owns a
 * file registers its client here, and a diff asks through it about the URI that editor opened.
 *
 * Keyed by root because the proxy pools a backend per root — any connection under a root reaches
 * the server holding every document opened beneath it.
 */
const clientsByRoot = new Map<string, Map<string, LspClient>>()

export function registerLanguageServerClient(
  rootPath: string,
  filePath: string,
  client: LspClient,
): () => void {
  const forRoot = clientsByRoot.get(rootPath) ?? new Map<string, LspClient>()
  clientsByRoot.set(rootPath, forRoot)
  forRoot.set(filePath, client)

  return () => {
    const current = clientsByRoot.get(rootPath)
    // Only retract our own entry: a later editor on the same path has already replaced it.
    if (current?.get(filePath) !== client) return

    current.delete(filePath)
    if (current.size === 0) clientsByRoot.delete(rootPath)
  }
}

/**
 * A connection under this root, and separately whether an editor holds `filePath` open right now.
 *
 * Both halves matter and they are different questions. The connection is what carries the request;
 * the ownership is what makes the answer true, because the server's copy of that file is whatever
 * its owner last sent it.
 */
export function languageServerClientFor(
  rootPath: string,
  filePath: string,
): { readonly client: LspClient; readonly ownsFile: boolean } | null {
  const forRoot = clientsByRoot.get(rootPath)
  const owner = forRoot?.get(filePath)
  if (owner) return { client: owner, ownsFile: true }

  const first = forRoot?.values().next()
  if (!first || first.done) return null

  return { client: first.value, ownsFile: false }
}

/** A module registry outlives a test; every suite touching it has to start from empty. */
export function resetLanguageServerClients(): void {
  clientsByRoot.clear()
}
