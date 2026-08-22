import {
  acquireLanguageServerLane,
  type AcquiredLanguageServerLane,
  type LanguageServerLaneOptions,
} from '@singapor/lsp-plugin/websocket'

import type { DiffFileSide } from '@/features/editor/utils/diff-position-map'
import { clientErrors } from '@/lib/structured-errors'

export type DiffLanguageDocument = {
  readonly side: DiffFileSide
  readonly uri: string
  readonly languageId: string
  readonly text: string
  readonly sharesRealUri: boolean
}

export type DiffLanguageSession = {
  readonly openSides: ReadonlySet<DiffFileSide>
  uriFor(side: DiffFileSide): string | null
  sideForUri(uri: string): DiffFileSide | null
  request<TResult>(method: string, params: unknown): Promise<TResult | null>
  dispose(): void
}

export function createDiffLanguageSession({
  documents,
  lane,
}: {
  readonly documents: readonly DiffLanguageDocument[]
  readonly lane: LanguageServerLaneOptions
}): DiffLanguageSession {
  const uris = new Map<DiffFileSide, string>(
    documents.map((document) => [document.side, document.uri]),
  )
  const openedUris = new Set<string>()
  let lease: AcquiredLanguageServerLane | null = null
  let ready: Promise<void> | null = null
  let disposed = false

  async function ensureReady(): Promise<AcquiredLanguageServerLane> {
    if (disposed) throw closedSessionError('disposed')
    if (!lease) lease = acquireLanguageServerLane(lane)
    const acquired = lease
    if (!ready) ready = acquired.ready.then(() => openDocuments(acquired))

    await ready
    if (disposed) throw closedSessionError('disposed')
    return acquired
  }

  function openDocuments(acquired: AcquiredLanguageServerLane): void {
    if (disposed) return

    for (const document of documents) {
      acquired.workspace.openDocument({
        languageId: document.languageId,
        text: document.text,
        uri: document.uri,
      })
      openedUris.add(document.uri)
    }
  }

  return {
    openSides: new Set(uris.keys()),
    uriFor: (side) => uris.get(side) ?? null,
    sideForUri: (uri) => documents.find((document) => document.uri === uri)?.side ?? null,
    request: async <TResult>(method: string, params: unknown) => {
      const acquired = await ensureReady()
      return acquired.client.request<TResult | null>(method, params)
    },
    dispose: () => {
      if (disposed) return

      disposed = true
      const acquired = lease
      if (!acquired) return

      for (const uri of openedUris) acquired.workspace.closeDocument(uri)
      openedUris.clear()
      acquired.release()
      lease = null
      ready = null
    },
  }
}

function closedSessionError(reason: string) {
  return clientErrors.DIFF_LANGUAGE_SESSION_CLOSED({ internal: { reason } })
}
