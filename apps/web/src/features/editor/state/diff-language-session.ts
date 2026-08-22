import {
  acquireLanguageServerLane,
  type AcquiredLanguageServerLane,
  type LanguageServerLaneOptions,
} from '@singapor/lsp-plugin/websocket'
import { LanguageServerSet } from '@singapor/lsp-plugin'

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
  lanes,
}: {
  readonly documents: readonly DiffLanguageDocument[]
  readonly lanes: readonly LanguageServerLaneOptions[]
}): DiffLanguageSession {
  const uris = new Map<DiffFileSide, string>(
    documents.map((document) => [document.side, document.uri]),
  )
  const openedUris = new Map<AcquiredLanguageServerLane, Set<string>>()
  const abort = new AbortController()
  let leases: readonly {
    readonly connection: AcquiredLanguageServerLane
    readonly options: LanguageServerLaneOptions
  }[] = []
  let servers: LanguageServerSet | null = null
  let ready: Promise<void> | null = null
  let disposed = false

  async function ensureReady(): Promise<LanguageServerSet> {
    if (disposed) throw closedSessionError('disposed')
    if (!servers) {
      leases = lanes.map((options) => ({
        connection: acquireLanguageServerLane(options),
        options,
      }))
      servers = new LanguageServerSet(
        leases.map(({ connection, options }) => ({
          connection,
          features: options.features,
          id: options.id,
          onRequestError: options.onRequestError,
        })),
      )
    }
    if (!ready) ready = prepareLanes()

    await ready
    if (disposed) throw closedSessionError('disposed')
    return servers
  }

  async function prepareLanes(): Promise<void> {
    await Promise.all(
      leases.map(async ({ connection }) => {
        try {
          await connection.ready
          openDocuments(connection)
        } catch {
          // The router excludes this lane; another ready feature owner can still answer.
        }
      }),
    )
  }

  function openDocuments(acquired: AcquiredLanguageServerLane): void {
    if (disposed) return

    const opened = new Set<string>()
    openedUris.set(acquired, opened)
    for (const document of documents) {
      acquired.workspace.openDocument({
        languageId: document.languageId,
        text: document.text,
        uri: document.uri,
      })
      opened.add(document.uri)
    }
  }

  return {
    openSides: new Set(uris.keys()),
    uriFor: (side) => uris.get(side) ?? null,
    sideForUri: (uri) => documents.find((document) => document.uri === uri)?.side ?? null,
    request: async <TResult>(method: string, params: unknown) => {
      const router = await ensureReady()
      try {
        const result = await router.request<TResult | null>(method, params, {
          signal: abort.signal,
        })
        if (disposed) throw closedSessionError('disposed')
        return result
      } catch (error) {
        if (disposed) throw closedSessionError('disposed')
        throw error
      }
    },
    dispose: () => {
      if (disposed) return

      disposed = true
      abort.abort()
      for (const { connection } of leases) {
        for (const uri of openedUris.get(connection) ?? []) connection.workspace.closeDocument(uri)
        connection.release()
      }
      openedUris.clear()
      leases = []
      servers = null
      ready = null
    },
  }
}

function closedSessionError(reason: string) {
  return clientErrors.DIFF_LANGUAGE_SESSION_CLOSED({ internal: { reason } })
}
