import type { Pty, PtyExit, SpawnPtyOptions } from '@workspace/pty'
import type { TerminalServerMessage } from '@workspace/contracts'
import type { TerminalPtyFactory } from '../../src/terminal/service'

export function createFakePtyFactory({
  failShells = new Set<string>(),
  immediateExit,
  holdUntilExit = false,
  onSpawn,
}: {
  failShells?: ReadonlySet<string>
  immediateExit?: number
  holdUntilExit?: boolean
  onSpawn?: () => void
} = {}) {
  const ptys: FakePty[] = []
  const spawns: SpawnPtyOptions[] = []
  const factory: TerminalPtyFactory = (options) => {
    spawns.push(options)
    onSpawn?.()
    if (failShells.has(options.command[0])) throw new TypeError('missing shell')
    const pty = new FakePty({ options, pid: 10_000 + ptys.length, holdUntilExit })
    ptys.push(pty)
    if (immediateExit !== undefined) pty.exit(immediateExit)
    return pty
  }
  return { factory, ptys, spawns }
}

export function terminalOutputBytes(messages: readonly TerminalServerMessage[]) {
  const chunks = messages.filter((message) => message.type === 'output')
  const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.data.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk.data, offset)
    offset += chunk.data.length
  }
  return bytes
}

export function terminalOutputText(messages: readonly TerminalServerMessage[]) {
  return new TextDecoder().decode(terminalOutputBytes(messages))
}

class FakePty implements Pty {
  readonly pid: number
  readonly #completion = Promise.withResolvers<PtyExit>()
  readonly exited = this.#completion.promise
  readonly #options: SpawnPtyOptions
  readonly #holdUntilExit: boolean
  killed = false
  readonly resizes: Array<[number, number]> = []
  readonly writes: Array<string | Uint8Array> = []

  constructor({
    options,
    pid,
    holdUntilExit,
  }: {
    options: SpawnPtyOptions
    pid: number
    holdUntilExit: boolean
  }) {
    this.#options = options
    this.#holdUntilExit = holdUntilExit
    this.pid = pid
  }

  kill(signal: NodeJS.Signals = 'SIGHUP') {
    this.killed = true
    if (!this.#holdUntilExit) this.exit(0, signal)
  }

  exit(exitCode: number, signal: NodeJS.Signals | null = null) {
    this.#completion.resolve({ exitCode, signal })
  }

  fail(error: unknown) {
    this.#completion.reject(error)
  }

  emit(data: Uint8Array) {
    this.#options.onData(data)
  }

  resize(cols: number, rows: number) {
    this.resizes.push([cols, rows])
  }

  write(data: string | Uint8Array) {
    this.writes.push(data)
  }

  async [Symbol.asyncDispose]() {
    this.kill()
    await this.exited
  }
}
