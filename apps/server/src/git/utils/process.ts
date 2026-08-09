import { defineErrorCatalog } from 'evlog'

import { writeProcessInput } from '../command'
import type { GitCommandResult } from '../types'

/**
 * Per-command output budget. 10 MB is the largest patch or listing we are
 * willing to hold in memory for one request; past that the reader stops, the
 * partial output is dropped, and the caller gets a typed failure instead of a
 * diff that looks complete but is not.
 */
export const MAX_OUTPUT_BYTES = 10_000_000

/**
 * Local commands (status, diff, rev-parse, cat-file) only touch the working
 * tree and the object store, so 30s already means something is wedged — a
 * stale `index.lock`, a hung hook, or a filesystem that stopped answering.
 */
export const LOCAL_TIMEOUT_MS = 30_000

/**
 * Network commands wait on a remote: DNS, TLS, SSH auth, then a pack transfer.
 * 2 minutes covers a cold fetch on a slow link while still guaranteeing an
 * unreachable remote cannot pin a request (and its git process) forever.
 */
export const NETWORK_TIMEOUT_MS = 120_000

const NETWORK_ACTIONS = new Set(['clone', 'fetch', 'ls-remote', 'pull', 'push', 'remote'])

export const gitProcessErrors = defineErrorCatalog('git', {
  COMMAND_TIMED_OUT: {
    status: 504,
    message: ({ action, timeoutMs }: { action: string; timeoutMs: number }) =>
      `git ${action} did not finish within ${timeoutMs}ms and was killed`,
    why: 'The git subprocess exceeded its time budget: network commands wait on an unreachable or unauthenticated remote, local ones usually block on a stale index lock or a hook.',
    fix: 'Check the remote (or clear the stale git lock) and retry. Raise timeoutMs for that call only when the command is legitimately slower than the budget.',
  },
  OUTPUT_LIMIT_EXCEEDED: {
    status: 413,
    message: ({ action, maxBytes, stream }: { action: string; maxBytes: number; stream: string }) =>
      `git ${action} wrote more than ${maxBytes} bytes to ${stream}`,
    why: 'Buffering the whole output would grow the server heap without bound, so the read stops at the limit and the partial output is discarded rather than returned as a complete result.',
    fix: 'Narrow the command (fewer paths, a smaller revision range) or raise maxOutputBytes for that call when the large output is expected.',
  },
})

export type GitProcessLimit =
  | {
      kind: 'output-limit'
      maxBytes: number
      observedBytes: number
      stream: 'stdout' | 'stderr'
    }
  | { kind: 'timeout'; timeoutMs: number }

/** A finished command, plus the limit that cut it short when one did. */
export type GitProcessResult = GitCommandResult & { limit?: GitProcessLimit }

export type GitProcessInput = {
  args: readonly string[]
  cwd: string
  /**
   * Extra environment for this command only, merged over the server's own env.
   * Checkpoint capture relies on it for `GIT_INDEX_FILE`: the whole point is to
   * stage into a throwaway index without ever touching the user's real one.
   */
  env?: Readonly<Record<string, string>>
  input?: string
  maxOutputBytes?: number
  timeoutMs?: number
}

/**
 * Runs `git` with both of its unbounded edges closed: output is read through a
 * byte budget and the whole command is killed once its deadline passes. A
 * command that hits either limit comes back with `limit` set and no output —
 * callers turn that into `gitProcessErrors`, never into a usable result.
 */
export async function runProcess(input: GitProcessInput): Promise<GitProcessResult> {
  const maxBytes = input.maxOutputBytes ?? MAX_OUTPUT_BYTES
  const timeoutMs = input.timeoutMs ?? defaultTimeoutMs(input.args)
  const child = Bun.spawn(['git', '-C', input.cwd].concat(input.args), {
    // Bun replaces the environment wholesale when `env` is set, so an override
    // has to be layered over the inherited one or git loses PATH and HOME.
    ...(input.env ? { env: { ...process.env, ...input.env } } : {}),
    stderr: 'pipe',
    stdin: input.input === undefined ? 'ignore' : 'pipe',
    stdout: 'pipe',
  })
  const control = createReadControl()
  let timedOut = false
  // Aborting the readers matters as much as the kill: git's own children (ssh,
  // git-remote-https) inherit the pipes, so waiting for EOF after killing git
  // would hang exactly as long as the command we are trying to bound.
  const timer = setTimeout(() => {
    timedOut = true
    control.abort()
    killIfRunning(child)
  }, timeoutMs)

  try {
    if (input.input !== undefined) await writeProcessInput(child.stdin, input.input)

    const [stdout, stderr] = await Promise.all([
      readCapped(child.stdout, maxBytes, control),
      readCapped(child.stderr, maxBytes, control),
    ])
    // A writer blocked on a full pipe never exits, so stop it before waiting.
    if (stdout.truncated || stderr.truncated) killIfRunning(child)

    const exitCode = await child.exited
    const limit = processLimit({ maxBytes, stderr, stdout, timedOut, timeoutMs })
    if (!limit) return { exitCode, stderr: stderr.text, stdout: stdout.text }

    return { exitCode, limit, stderr: '', stdout: '' }
  } finally {
    clearTimeout(timer)
    killIfRunning(child)
  }
}

export function processLimitError(limit: GitProcessLimit, action: string) {
  if (limit.kind === 'timeout') {
    return gitProcessErrors.COMMAND_TIMED_OUT({ action, timeoutMs: limit.timeoutMs })
  }

  return gitProcessErrors.OUTPUT_LIMIT_EXCEEDED({
    action,
    internal: { observedBytes: limit.observedBytes },
    maxBytes: limit.maxBytes,
    stream: limit.stream,
  })
}

export function defaultTimeoutMs(args: readonly string[]) {
  return NETWORK_ACTIONS.has(args[0] ?? '') ? NETWORK_TIMEOUT_MS : LOCAL_TIMEOUT_MS
}

type StreamRead = { bytes: number; text: string; truncated: boolean }

type ReadControl = { aborted: Promise<typeof ABORTED>; abort: () => void }

const ABORTED = Symbol('git.read.aborted')

async function readCapped(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  control: ReadControl,
): Promise<StreamRead> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''

  while (true) {
    const chunk = await Promise.race([reader.read(), control.aborted])
    if (chunk === ABORTED) return abandonRead(reader, bytes, maxBytes)
    if (chunk.done) return { bytes, text: text + decoder.decode(), truncated: false }

    bytes += chunk.value.byteLength
    if (bytes > maxBytes) {
      control.abort()
      return abandonRead(reader, bytes, maxBytes)
    }
    text += decoder.decode(chunk.value, { stream: true })
  }
}

/** Drops what was read: a partial diff is worse than no diff. */
function abandonRead(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  bytes: number,
  maxBytes: number,
): StreamRead {
  void reader.cancel()

  return { bytes, text: '', truncated: bytes > maxBytes }
}

function createReadControl(): ReadControl {
  let resolveAborted: (value: typeof ABORTED) => void = () => {}
  const aborted = new Promise<typeof ABORTED>((resolve) => {
    resolveAborted = resolve
  })

  return { abort: () => resolveAborted(ABORTED), aborted }
}

function processLimit(input: {
  maxBytes: number
  stderr: StreamRead
  stdout: StreamRead
  timedOut: boolean
  timeoutMs: number
}): GitProcessLimit | null {
  if (input.timedOut) return { kind: 'timeout', timeoutMs: input.timeoutMs }
  if (input.stdout.truncated) return outputLimit(input.stdout, input.maxBytes, 'stdout')
  if (input.stderr.truncated) return outputLimit(input.stderr, input.maxBytes, 'stderr')

  return null
}

function outputLimit(
  read: StreamRead,
  maxBytes: number,
  stream: 'stdout' | 'stderr',
): GitProcessLimit {
  return { kind: 'output-limit', maxBytes, observedBytes: read.bytes, stream }
}

function killIfRunning(child: Bun.Subprocess) {
  if (child.exitCode !== null) return
  if (child.signalCode !== null) return

  child.kill('SIGKILL')
}
