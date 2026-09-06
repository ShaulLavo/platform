# @workspace/pty

Bun-native PTY processes with byte output, input, resize, and explicit cleanup. The package has
no server dependency. Platform uses this package directly; the
[terminal service reference](../../docs/terminal.md) describes its ownership and binary transport.

```ts
import { spawnPty } from '@workspace/pty'

const decoder = new TextDecoder()
await using pty = spawnPty({
  command: ['/bin/sh', '-i'],
  cwd: process.cwd(),
  env: { ...process.env, TERM: 'xterm-256color' },
  cols: 100,
  rows: 30,
  onData(bytes) {
    process.stdout.write(decoder.decode(bytes, { stream: true }))
  },
})

pty.resize(120, 40)
pty.write('printf "hello\\n"\nexit\n')
const { exitCode, signal } = await pty.exited
process.stdout.write(decoder.decode())
```

## Contract

- `command` is a nonempty, readonly argv tuple. The package starts that executable directly.
- `cwd` and `env` default to the caller's directory and environment. An explicit `env` replaces
  inheritance. A missing `TERM` defaults to `xterm-256color`.
- `cols` and `rows` default to 80 and 24. Both must be integers from 1 to 65535.
- `onData` is registered before the process starts. It receives ordered `Uint8Array` chunks
  synchronously, including stderr. Chunks can be retained. The callback must consume them
  synchronously or own its buffering; there is no output backpressure or replay buffer.
- `write` accepts strings or bytes. Bun owns input buffering and preserves write order. It can
  buffer large pastes, so callers must bound input they accept from outside the process.
- `exited` resolves with `{ exitCode, signal }` after the direct child exits, terminal output ends,
  and the native handle closes. On Linux, descendants can hold the terminal open after the direct
  child exits. macOS revokes the controlling terminal when its session leader exits; subsequent
  descendant writes fail with `EIO`. The result uses the subprocess status, never Bun's PTY EOF status.
- `kill()` sends `SIGHUP`. `kill(signal)` sends the supplied signal. If completion takes more than
  250 ms, cleanup sends `SIGKILL` to the direct child and closes the terminal. Repeated calls share
  the deadline; an explicit `SIGKILL` is sent immediately. Forced closure may discard unread bytes.
- `await pty[Symbol.asyncDispose]()` terminates the process and waits for cleanup. Repeated
  disposal is safe. Writes and resizes after terminal closure do nothing, though dimensions are
  still validated.
- Spawn failures throw structured `pty.*` errors. A throwing output callback terminates the
  process, closes the terminal, and rejects `exited` with the original error as its cause.

Disposal guarantees cleanup of the direct child and the package's descriptors. Interactive
shells put foreground jobs in separate process groups. A descendant that ignores terminal hangup
can survive the shell; this package does not discover or supervise an entire process tree.

The verified operating systems are Linux and macOS. The package requires Bun 1.3.14 or later.
All 15 tests pass on Linux x64 with Bun 1.3.14 and 1.4.0, and on macOS 26.4 arm64 with Bun 1.4.0.
The real Neovim save, resize, and exit check passes on both operating systems. Bun 1.3.10 segfaults
on failed spawns when a terminal exit callback is installed, so the package rejects that runtime
before calling the native API. Windows is completely untested; compatibility remains unknown.
The current platform guard permits Linux and macOS only.

## Verification commands

Run from the repository root:

```sh
bun run --cwd packages/pty test
bun run --cwd packages/pty typecheck
bun run --cwd packages/pty lint
bun run --cwd packages/pty format:check
bun packages/pty/test/nvim-smoke.ts
bun apps/server/scripts/pty-benchmark.ts
```

The package tests use Vitest under Bun because they exercise the actual native runtime. They
spawn real programs and require POSIX `sh` and `stty`. Descriptor checks use `/proc/self/fd` on
Linux and `/usr/sbin/lsof` on macOS, with a live PTY as a positive control. The optional Neovim
check requires `nvim`.
The benchmark measures the production `TerminalService` through its routes without opening a
server socket. The separate `apps/server/scripts/pty-smoke.ts` checks the full service with Neovim.

## Design decision

This package takes an output callback at spawn time and returns an exit promise, so callers
cannot miss startup output and do not need to manage subscriptions to await cleanup. Platform's
service uses that interface directly and preserves bytes through its replay buffer and transport.

One process owner coordinates the subprocess and PTY lifetimes. Linux probes produced
`HEAD`, direct child exit, `TAIL`, then PTY EOF. Closing on subprocess exit would truncate that
output. Inline terminal options let Bun release the parent's slave descriptor; a separately
constructed `Bun.Terminal` retains it and cannot provide the same natural EOF barrier.

A stream wrapper was also considered. Bun has no public method to pause output reads, so a
stream would add a queue without controlling native backpressure. The callback API exposes
that limitation directly. UTF-8 decoding, replay, WebSocket framing, settings, and session logs
remain responsibilities of the consumer.
