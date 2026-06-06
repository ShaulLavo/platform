import { getClient } from '@/lib/client'

export type EdenServerSocket = {
  readonly readyState?: number
  send(message: string): void
  close(code?: number, reason?: string): void
  addEventListener(
    type: keyof WebSocketEventMap,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void
  removeEventListener(
    type: keyof WebSocketEventMap,
    handler: EventListener,
    options?: boolean | EventListenerOptions,
  ): void
}

type EdenSocket = {
  ws: WebSocket
  send(data: unknown): unknown
}

type LanguageServerSocketOptions = {
  path: string
  rootPath: string
  serverId?: string | null
}

export function connectTerminalSocket(rootPath: string, sessionId: string): EdenServerSocket {
  return adaptEdenSocket(
    getClient().terminal.subscribe({ query: { root: rootPath, session: sessionId } }),
  )
}

export function connectLanguageServerSocket({
  path,
  rootPath,
  serverId,
}: LanguageServerSocketOptions): EdenServerSocket {
  return adaptEdenSocket(
    getClient().lsp.subscribe({
      query: { path, root: rootPath, server: serverId ?? undefined },
    }),
  )
}

export class EdenLanguageServerWebSocket implements EdenServerSocket {
  readonly #socket: EdenServerSocket

  constructor(url: string | URL, _protocols?: string | readonly string[]) {
    void _protocols
    this.#socket = connectLanguageServerSocket(languageServerSocketOptions(url))
  }

  get readyState() {
    return this.#socket.readyState
  }

  send(message: string) {
    this.#socket.send(message)
  }

  close(code?: number, reason?: string) {
    this.#socket.close(code, reason)
  }

  addEventListener(
    type: keyof WebSocketEventMap,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions,
  ) {
    this.#socket.addEventListener(type, handler, options)
  }

  removeEventListener(
    type: keyof WebSocketEventMap,
    handler: EventListener,
    options?: boolean | EventListenerOptions,
  ) {
    this.#socket.removeEventListener(type, handler, options)
  }
}

function adaptEdenSocket(socket: EdenSocket): EdenServerSocket {
  return {
    get readyState() {
      return socket.ws.readyState
    },
    send: (message) => {
      socket.send(message)
    },
    close: (code, reason) => {
      socket.ws.close(code, reason)
    },
    addEventListener: (type, handler, options) => {
      socket.ws.addEventListener(type, handler, options)
    },
    removeEventListener: (type, handler, options) => {
      socket.ws.removeEventListener(type, handler, options)
    },
  }
}

function languageServerSocketOptions(url: string | URL) {
  const parsed = new URL(url.toString())

  return {
    path: parsed.searchParams.get('path') ?? '',
    rootPath: parsed.searchParams.get('root') ?? '',
    serverId: parsed.searchParams.get('server'),
  }
}
