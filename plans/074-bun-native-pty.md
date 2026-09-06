# Plan 074: Replace the node-pty bridge with Bun's native PTY

> **Executor instructions**: Read this plan completely, then read Platform `AGENTS.md` and root
> `PLAN.md`. Execute every gate in order. Do not commit, push, create a branch, publish, or open a
> PR without explicit operator approval.

## Status

- **State**: Standalone package verified; server adoption and bridge deletion pending
- **Priority**: P2 — nothing is broken, but every terminal pays a Node process launch and a JSON
  hop that Bun 1.4 makes unnecessary
- **Effort**: Package stage complete; service byte boundary and adoption remain
- **Risk**: LOW–MEDIUM — `TerminalPty` is already an interface with one implementation; the risk is
  behavioural parity of the PTY itself, not architectural
- **Platform baseline**: `1ed986bb6abaedaa24b5f1f1158971883b828bfe` for the standalone stage.
  Concurrent plan 069 work is preserved.
- **Runtime floor**: Bun ≥ 1.3.14. Bun 1.3.10 crashes on a failed spawn with a terminal exit
  callback. The root runtime pin is now **1.4.0**, matching the local runtime.

The operator requested a separate, verified package before replacing the Node implementation on
2026-09-06. That instruction schedules the package stage. The server still selects `NodePtyBridge`
and retains `@lydell/node-pty`; the native adapter is used only by the benchmark.

Root `PLAN.md` is authoritative for ordering.

## Why

`apps/server/src/terminal/service.ts` spawns a **whole Node process per terminal**, purely to reach
a PTY:

```
Bun.spawn([resolveNodeBinary(), '--eval', NODE_PTY_BRIDGE_SCRIPT])
```

The reason is documented in the source and was correct when written:

> node-pty's native addon needs a real Node runtime: its master-fd socket breaks under Bun's Node
> emulation (`this._socket.write is not a function`).

So every terminal session costs a Node launch, and every byte in either direction is JSON-encoded,
newline-framed, and pushed through a pipe between two processes.

**Bun 1.4 removes the reason.** `Bun.Terminal` is native PTY support (added in Bun 1.3.5), and this
repo already runs 1.4.0. Verified on this machine:

```
Bun.Terminal proto: close, closed, controlFlags, inputFlags, localFlags,
                    outputFlags, ref, resize, setRawMode, unref, write
```

Output arrives through a `data(terminal, data)` callback supplied inline to `Bun.spawn`'s
`terminal` option — **not** a stream; `child.stdout` and `child.readable` are both `null` when a
terminal is attached. That detail costs an hour if you go looking for a stream.

### Earlier prototype measurements

Session start — spawn to first output byte, `n=12`:

| path                   |     min |                       med |     max |
| ---------------------- | ------: | ------------------------: | ------: |
| node-pty bridge        | 14.8 ms |                   16.5 ms | 20.1 ms |
| `Bun.Terminal`         |  0.6 ms |                    0.7 ms |  1.0 ms |
| **median improvement** |         | **22.5x** — 15.7 ms saved |         |

Steady state — echo round-trip through a live `cat`, `n=40`:

| path            |       med |     p95 |
| --------------- | --------: | ------: |
| node-pty bridge |   0.06 ms | 3.27 ms |
| `Bun.Terminal`  |   0.01 ms | 0.09 ms |
| **improvement** | **11.4x** | **36x** |

Read those two tables differently. The startup win is a real 15.7 ms off every terminal open, and
it is dominated by Node process launch — exactly the cost being deleted. The steady-state median is
already imperceptible in both; **the win there is the tail**, p95 3.27 ms → 0.09 ms, which is the
JSON framing plus pipe plus a second event loop's jitter. Tail latency is what makes typing feel
uneven, so that is the number worth caring about.

Honest scope of the measurement: these are microbenchmarks of the PTY layer only. The full path
adds a WebSocket hop and terminal rendering, which neither variant changes. Do not quote 22x as an
end-to-end user-visible number.

### What else goes away

- `NODE_PTY_BRIDGE_SCRIPT` — a ~90-line JS program embedded in a template literal, unreachable by
  the type checker, the linter, and the test suite.
- `resolveNodeBinary()` and its PATH-walk, which exists only to avoid Bun's `node` shim when
  running under `bun --bun` (the Vitest suite). Pure incidental complexity.
- `@lydell/node-pty` and its platform-specific native package.
- The JSON-lines protocol: `readBridgeMessages`, `readBridgeStderr`, `#sendCommand`, and the
  `#writeQueue` that serialises writes into it.
- One process per terminal, and its contribution to the `bun --watch` zombie population (plan 076).

## Design

[`@workspace/pty`](../packages/pty/README.md) owns native process and terminal lifetimes. Its
`spawnPty` function takes a command, dimensions, environment, and a synchronous byte callback.
The returned handle exposes `pid`, `exited`, `write`, `resize`, `kill`, and async disposal.
The callback is installed at spawn time; there is no startup subscription race or replay buffer.

Completion waits for both the subprocess result and PTY EOF, then closes the descriptor. Linux
probes produced output after the direct child exited. macOS revokes the controlling terminal at
session-leader exit, preventing later descendant writes. Bun's terminal exit status is not a
process exit code, and EOF alone does not close the native handle.

The package sends the requested signal, defaults to `SIGHUP`, and forces cleanup after 250 ms.
This is stronger than the old bridge, which ignored the requested signal inside its embedded
script and later signaled the Node bridge instead of forcing the shell to exit. Disposal owns
the direct child and PTY descriptor; it does not supervise stubborn descendants in separate
process groups.

The app retains shell selection, settings, detach TTL, replay, session logs, and transport policy.
Its current string interface and JSON messages still need conversion to a byte boundary before
the TUI workbench can use binary terminal frames, as required by `docs/tui-plan.md` §7.5.

## Gate 1 — Standalone package, complete

`packages/pty/` contains the implementation, public types, usage reference, and real-process tests.
It is a workspace package with its own typecheck, lint, formatting, and Vitest commands. Vitest
runs under Bun because this package is runtime-specific.

Verification on Linux x64, 2026-09-06:

- All 15 tests pass on Bun 1.3.14 and 1.4.0. They cover direct PID/PPID and three TTY descriptors,
  arguments, cwd, environment, dimensions, SIGWINCH, alternate-screen raw input, shell Ctrl-C/D,
  2 MiB binary output and delayed input, retained chunks, final output after child exit, signal
  escalation, repeated disposal, retained descendants, failed spawns, and callback errors.
- The optional Neovim check enters and leaves the alternate screen, resizes to 123 × 41, saves
  exact text in an isolated directory, and exits with status zero.
- Package typecheck, lint, and formatting pass. A separate consumer typecheck verifies that
  importing the package does not depend on package-local TypeScript aliases.
- Bun 1.3.10 fails a minimal native spawn reproduction without package or Vitest code. The runtime
  guard now rejects it before the native call. The package's verified minimum is 1.3.14.

Verification over SSH on macOS 26.4 arm64, Bun 1.4.0, 2026-09-06:

- All 15 real-process tests pass. Descriptor checks use `lsof`, with a live PTY as a positive
  control, and return to baseline after natural exit, disposal, failed spawns, and callback errors.
- Neovim 0.9.5 enters and leaves the alternate screen, resizes to 123 × 41, saves the exact text,
  and exits with status zero. Package typecheck, lint, and formatting pass.
- A native Bun reproduction kept the master open after session-leader exit and still observed
  `EIO` from the descendant. This matches [Darwin's terminal revocation on process exit](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_exit.c#L2093-L2140).
  The test now verifies the descendant's actual write outcome through a file outside the PTY:
  `written` and `HEADTAIL` on Linux, `EIO` and `HEAD` on macOS.
- An intermittent Linux failed-spawn assertion also reproduced with direct `Bun.spawn`. Native
  descriptor cleanup can finish after the call throws. Across 8,000 failed spawns, no descriptor
  remained after an event-loop turn. The test now polls for cleanup without changing spawn behavior.

The Mac run used an isolated package copy with locked dependencies. A hoisted install prevented
older Node declarations in the user's home directory from entering its typecheck. No global tools
or existing checkout were changed. Windows is completely untested. The package's current platform
guard permits Linux and macOS only; Windows compatibility remains unknown.

The rerunnable [service benchmark](../apps/server/scripts/pty-benchmark.ts) uses the real
`TerminalService` and its JSON protocol with the existing Node factory or a benchmark-only native
adapter. Alternating paired samples on an Intel Core i7-14700K with Bun 1.4.0 produced:

| Measurement                         | Node bridge | Bun native |
| ----------------------------------- | ----------: | ---------: |
| Startup median, 20 samples          |  19.6469 ms |  0.8795 ms |
| Startup p95                         |  27.2503 ms |  1.8123 ms |
| Echo round-trip median, 100 samples |  0.03062 ms | 0.01244 ms |
| Echo round-trip p95                 |  0.04423 ms | 0.01735 ms |

Both backends returned all 6,400 measured payload bytes. These measurements exclude orchestration
persistence, network transport, and rendering. The temporary worktree has one benchmark owner
with an in-memory lease boundary and no orchestration imports. The benchmark opens no server socket.
The reviewed commit was verified in an isolated checkout with the committed service, excluding
concurrent plan 069 changes. The repository-wide typecheck also passes in that checkout.

## Gate 2 — Service adoption and verification, pending

Adopt the verified package through the service's PTY factory, keeping the existing session log
owner and event names. Make the terminal transport byte-based, with decoding only where text is
required. Do not recreate the Node bridge's write queue; Bun already owns ordered input buffering.

1. **Parity, not just liveness.** A terminal is not proven by a prompt appearing. Exercise:
   - a full-screen TUI (`htop`, `vim`) — proves the PTY is a real TTY and resize propagates;
   - `SIGWINCH` handling on pane resize;
   - Ctrl-C and Ctrl-D reaching the shell;
   - a command emitting a large burst (`yes | head -100000`) — proves no truncation or reordering
     now that the JSON framing is gone;
   - a non-UTF-8 byte sequence — the old path round-tripped through `JSON.stringify`, the new one
     does not, so the encoding boundary genuinely moved.
2. Re-run both benchmarks above against the real service and record the numbers here before this
   plan is deleted.
3. Confirm no Node process is spawned per terminal: open three terminals, and
   `pgrep -P <server-pid>` must show no `node`.
4. Run focused service and terminal transport tests, plus affected typecheck, lint, and formatting
   checks. Per `plans/README.md`, use per-workspace baseline deltas and account for concurrent work.

## Gate 3 — Delete the bridge

Only after Gate 2 passes.

1. Remove `NodePtyBridge`, `NODE_PTY_BRIDGE_SCRIPT`, `resolveNodeBinary`, `cachedNodeBinary`,
   `readBridgeMessages`, `readBridgeStderr`, and `resolveNodePtyModule`.
2. Drop `@lydell/node-pty` from `apps/server/package.json` and `bun.lock`.
3. No compatibility shim and no feature flag, per the greenfield rule. If Gate 2 fails, fix it or
   revert the branch — do not ship both.

## Risks and rejected alternatives

- **Service adoption needs verification on both operating systems.** The package is verified on
  Linux with Bun 1.3.14 and 1.4.0 and macOS with Bun 1.4.0. Run the adopted service checks on both
  before Gate 3; package checks do not cover the app's transport or session lifecycle.
- **Rejected — keep the bridge and only optimise the framing** (e.g. length-prefixed binary instead
  of JSON lines). Recovers part of the tail-latency win and none of the 15.7 ms startup win, while
  keeping a Node process per terminal and an untypecheckable embedded script.
- **Rejected — a community FFI PTY** (`bun-pty`, `bun-pty-rust`). Made sense before 1.3.5; adding a
  Rust/FFI dependency to avoid a first-party API is now strictly worse.

## Out of scope

- Windows verification is outside this stage. It is completely untested, with compatibility unknown.
- Terminal rendering. Plan 075.
- The `bun --watch` zombie leak (plan 076) — this plan reduces the child count but does not fix the
  reaping bug.
