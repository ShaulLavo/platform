import type { DiffFileSide } from '@/features/editor/utils/diff-position-map'
import {
  LANGUAGE_SERVER_CLIENT_INFO,
  semanticTokensCapabilityForServer,
} from '@/features/editor/utils/semantic-token-capability'
import { connectLanguageServerSocket, type EdenServerSocket } from '@/lib/server-sockets'
import { clientErrors } from '@/lib/structured-errors'

/** One of the two texts a diff draws, as the language server will hold it. */
export type DiffLanguageDocument = {
  readonly side: DiffFileSide
  readonly uri: string
  readonly languageId: string
  readonly text: string
  /**
   * Whether this uri is the file's real one, which an editor may also open and write through.
   * A document under a phantom name cannot drift; this one can, and callers have to re-check it.
   */
  readonly sharesRealUri: boolean
}

export type DiffLanguageSession = {
  /** The sides that were opened. A side with no text to send is simply absent. */
  readonly openSides: ReadonlySet<DiffFileSide>
  uriFor(side: DiffFileSide): string | null
  /** Which side a uri names, or null when it is some other file entirely. */
  sideForUri(uri: string): DiffFileSide | null
  request<TResult>(method: string, params: unknown): Promise<TResult | null>
  dispose(): void
}

/**
 * How long a single request may wait. Generous on purpose: the first question asked of a cold
 * TypeScript server on a large project routinely takes seconds, and a hover that times out looks
 * exactly like a hover the server had nothing to say about.
 */
const REQUEST_TIMEOUT_MS = 15_000

/**
 * Reserved for the handshake, so its reply is told apart from a real request's without a branch in
 * every caller. Ordinary ids start at 1.
 */
const HANDSHAKE_ID = 0

/**
 * A diff's own connection to a language server, holding its own copies of the two texts.
 *
 * The diff opens documents rather than borrowing an editor's, which is a change of position worth
 * stating. Borrowing was safe but nearly useless: it could only answer while some editor happened
 * to have the same file open, which is rarely true of a file you are reading a diff of. Owning them
 * costs one socket per diff and answers always.
 *
 * Owning them is only safe because of two facts about the proxy, both of which it already
 * guarantees (`apps/server/src/lsp/proxy-session.ts`):
 *
 * - a second client opening a URI JOINS a reference-counted owner set rather than replacing the
 *   owner, and its text is forwarded to the backend only if it DIFFERS from the shared copy, so
 *   opening the new side with the text an editor already holds is a no-op on the wire;
 * - `didClose` reaches the backend only when the last owner lets go, so this session closing its
 *   documents cannot take the file away from an editor that still has it open.
 *
 * Both depend on this being its OWN connection. The refcount counts connections, not opens, so a
 * session that borrowed an editor's client and later closed a document would evict that editor's
 * ownership along with its own.
 */
export function createDiffLanguageSession({
  documents,
  path,
  rootPath,
  serverId,
}: {
  readonly documents: readonly DiffLanguageDocument[]
  /** The workspace-relative path the socket routes on, which picks the server and its root. */
  readonly path: string
  readonly rootPath: string
  /** Named explicitly so the diff lands on the same pooled backend the editor for this file uses. */
  readonly serverId: string
}): DiffLanguageSession {
  const pending = new Map<number, PendingRequest>()
  const queued: string[] = []
  const uris = new Map<DiffFileSide, string>(documents.map((doc) => [doc.side, doc.uri]))
  let socket: EdenServerSocket | null = null
  let connected = false
  let disposed = false
  let nextId = 1

  const settleAll = (error: unknown): void => {
    for (const request of pending.values()) request.fail(error)
    pending.clear()
  }

  /**
   * Connects on first use, not on mount.
   *
   * A diff nobody points at asks nothing, and a socket opened for it is a language server started,
   * a document parsed and a backend kept warm for a question that never comes. Opening late costs
   * the first hover the connection round trip, which it was going to spend on the request anyway.
   */
  const ensureConnected = (): EdenServerSocket => {
    if (socket) return socket

    const opened = connectLanguageServerSocket({ path, rootPath, serverId })
    socket = opened

    /**
     * The handshake, then the documents, then whatever was waiting.
     *
     * `initialize` is not politeness. The proxy reaches `ensureInitialized` from exactly one place —
     * a client's own `initialize` request — so a diff that is the FIRST client under a root would
     * otherwise hand the backend a `didOpen` it is not yet allowed to receive. That is precisely the
     * case this feature exists for: reading a diff of a file no editor has open.
     *
     * The capabilities are the editor's, from the same helpers, because the pooled backend memoizes
     * the first `initialize` it is given and every tab under the root then lives with that answer —
     * including the semantic-token legend. A second, drifting copy of this block is a root-wide bug
     * waiting to happen.
     */
    opened.addEventListener('open', () => {
      opened.send(
        JSON.stringify({
          id: HANDSHAKE_ID,
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            capabilities: semanticTokensCapabilityForServer(serverId),
            clientInfo: LANGUAGE_SERVER_CLIENT_INFO,
            processId: null,
            rootUri: fileUri(rootPath),
          },
        }),
      )
    })
    opened.addEventListener('message', (event) => {
      const response = jsonRpcResponse((event as MessageEvent).data)
      if (!response || typeof response.id !== 'number') return
      if (response.id === HANDSHAKE_ID) return completeHandshake(opened)

      const request = pending.get(response.id)
      if (!request) return

      pending.delete(response.id)
      request.settle(response)
    })
    opened.addEventListener('close', () =>
      settleAll(clientErrors.DIFF_LANGUAGE_SESSION_CLOSED({ internal: { reason: 'close' } })),
    )
    opened.addEventListener('error', () =>
      settleAll(clientErrors.DIFF_LANGUAGE_SESSION_CLOSED({ internal: { reason: 'error' } })),
    )

    return opened
  }

  const completeHandshake = (opened: EdenServerSocket): void => {
    if (connected) return

    connected = true
    opened.send(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }))
    for (const document of documents) {
      opened.send(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'textDocument/didOpen',
          params: {
            textDocument: {
              languageId: document.languageId,
              text: document.text,
              uri: document.uri,
              version: 1,
            },
          },
        }),
      )
    }
    for (const body of queued) opened.send(body)
    queued.length = 0
  }

  const send = (message: unknown): void => {
    const body = JSON.stringify(message)
    if (connected && socket) return socket.send(body)

    queued.push(body)
  }

  return {
    openSides: new Set(uris.keys()),
    uriFor: (side) => uris.get(side) ?? null,
    sideForUri: (uri) => documents.find((document) => document.uri === uri)?.side ?? null,
    request: (method, params) =>
      new Promise((resolve, reject) => {
        if (disposed) {
          reject(clientErrors.DIFF_LANGUAGE_SESSION_CLOSED({ internal: { reason: 'disposed' } }))
          return
        }

        ensureConnected()
        const id = nextId
        nextId += 1
        pending.set(id, createPendingRequest({ id, method, pending, reject, resolve }))
        send({ id, jsonrpc: '2.0', method, params })
      }),
    dispose: () => {
      if (disposed) return

      disposed = true
      settleAll(clientErrors.DIFF_LANGUAGE_SESSION_CLOSED({ internal: { reason: 'disposed' } }))
      // Nothing was ever opened on a session nobody asked anything of, so there is nothing to close.
      if (!socket) return

      for (const document of documents) {
        send({
          jsonrpc: '2.0',
          method: 'textDocument/didClose',
          params: { textDocument: { uri: document.uri } },
        })
      }
      socket.close()
    },
  }
}

type PendingRequest = {
  settle(response: JsonRpcResponse): void
  fail(error: unknown): void
}

function createPendingRequest({
  id,
  method,
  pending,
  reject,
  resolve,
}: {
  readonly id: number
  readonly method: string
  readonly pending: Map<number, PendingRequest>
  readonly reject: (error: unknown) => void
  readonly resolve: (result: never) => void
}): PendingRequest {
  const timer = setTimeout(() => {
    pending.delete(id)
    reject(clientErrors.DIFF_LANGUAGE_REQUEST_FAILED({ internal: { reason: 'timeout' }, method }))
  }, REQUEST_TIMEOUT_MS)

  return {
    settle: (response) => {
      clearTimeout(timer)
      if (response.error) {
        reject(
          clientErrors.DIFF_LANGUAGE_REQUEST_FAILED({
            internal: { message: response.error.message },
            method,
          }),
        )
        return
      }

      resolve(response.result as never)
    },
    fail: (error) => {
      clearTimeout(timer)
      reject(error)
    },
  }
}

type JsonRpcResponse = {
  error?: { message?: string }
  id?: number | string | null
  result?: unknown
}

function jsonRpcResponse(value: unknown): JsonRpcResponse | null {
  try {
    const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value
    if (!parsed || typeof parsed !== 'object') return null

    return parsed as JsonRpcResponse
  } catch {
    return null
  }
}

/** The uri form the proxy and the servers behind it both use: root-relative, no leading slash. */
function fileUri(path: string): string {
  const normalized = path.replace(/^\/+/, '')

  return `file:///${normalized.split('/').map(encodeURIComponent).join('/')}`
}
