export type PtyExit = {
  readonly exitCode: number
  readonly signal: NodeJS.Signals | null
}

export type SpawnPtyOptions = {
  readonly command: readonly [string, ...string[]]
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly cols?: number
  readonly rows?: number
  readonly onData: (bytes: Uint8Array) => void
}

export interface Pty extends AsyncDisposable {
  readonly pid: number
  readonly exited: Promise<PtyExit>
  write(data: string | Uint8Array): void
  resize(cols: number, rows: number): void
  kill(signal?: NodeJS.Signals): void
}
