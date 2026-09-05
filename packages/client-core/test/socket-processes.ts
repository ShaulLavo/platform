import {
  LspSessionPool,
  type LspProxyClientSession,
  type TerminalPty,
  type TerminalPtyExitEvent,
  type TerminalPtyFactory,
} from 'server/testing'

export function recordingPtyFactory() {
  const spawns: Parameters<TerminalPtyFactory>[0][] = []
  const processes: RecordingPty[] = []
  const factory: TerminalPtyFactory = (options) => {
    spawns.push(options)
    const process = new RecordingPty()
    processes.push(process)
    return process
  }
  return { factory, spawns, processes }
}

class RecordingPty implements TerminalPty {
  killed = false
  readonly writes: string[] = []
  readonly resizes: [number, number][] = []
  private readonly data = new Set<(message: string) => void>()
  private readonly exits = new Set<(event: TerminalPtyExitEvent) => void>()
  get listeners() {
    return this.data.size + this.exits.size
  }
  kill() {
    this.killed = true
  }
  write(message: string) {
    this.writes.push(message)
  }
  resize(cols: number, rows: number) {
    this.resizes.push([cols, rows])
  }
  onData(listener: (message: string) => void) {
    this.data.add(listener)
    return {
      dispose: () => {
        this.data.delete(listener)
      },
    }
  }
  onExit(listener: (event: TerminalPtyExitEvent) => void) {
    this.exits.add(listener)
    return {
      dispose: () => {
        this.exits.delete(listener)
      },
    }
  }
  emit(message: string) {
    for (const listener of this.data) listener(message)
  }
}

export class RecordingLspPool extends LspSessionPool {
  readonly acquisitions: Parameters<LspSessionPool['acquire']>[] = []
  readonly clients: RecordingLspSession[] = []
  override async acquire(
    ...input: Parameters<LspSessionPool['acquire']>
  ): Promise<LspProxyClientSession> {
    this.acquisitions.push(input)
    const client = new RecordingLspSession()
    this.clients.push(client)
    return client
  }
  override disposeAll() {
    for (const client of this.clients) client.dispose()
    for (const [socket] of this.acquisitions) socket.close()
    super.disposeAll()
  }
}

class RecordingLspSession implements LspProxyClientSession {
  disposed = false
  readonly messages: unknown[] = []
  async handleClientMessage(message: string | ArrayBuffer | Uint8Array) {
    const value = typeof message === 'string' ? message : new TextDecoder().decode(message)
    this.messages.push(JSON.parse(value))
  }
  dispose() {
    this.disposed = true
  }
}
