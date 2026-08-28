# Plan 074: Replace the node-pty bridge with Bun's native PTY

> **Executor instructions**: Read this plan completely, then read Platform `AGENTS.md` and root
> `PLAN.md`. Execute every gate in order. Do not commit, push, create a branch, publish, or open a
> PR without explicit operator approval.

## Status

- **State**: Proposed — needs root scheduling
- **Priority**: P2 — nothing is broken, but every terminal pays a Node process launch and a JSON
  hop that Bun 1.4 makes unnecessary
- **Effort**: S — delete a subprocess protocol, keep the interface around it
- **Risk**: LOW–MEDIUM — `TerminalPty` is already an interface with one implementation; the risk is
  behavioural parity of the PTY itself, not architectural
- **Platform baseline**: `e3fc816b`
- **Runtime floor**: Bun ≥ 1.3.5 (`Bun.Terminal` landed there). Repo is on **1.4.0** — already met.

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

### Measured, on this machine

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

`TerminalPty` already exists as an interface — `onData`, `onExit`, `write`, `resize`, `kill` — with
`NodePtyBridge` as its only implementation. That interface is the seam and does not change. This
plan swaps the implementation behind it.

`Bun.Terminal`'s callback shape maps cleanly: the `data` callback drives `onData`, `child.exited`
drives `onExit`, `terminal.write()` is `write`, `terminal.resize()` is `resize`.

## Gate 1 — `BunTerminalPty`

`apps/server/src/terminal/service.ts`

1. Add `BunTerminalPty implements TerminalPty`, constructed from the same
   `TerminalPtySpawnOptions`. Spawn the shell directly — no `--eval`, no wrapper process:

   ```ts
   Bun.spawn([shell], {
     env: options.env,
     terminal: { rows, cols, data: (_t, chunk) => this.#emitData(chunk) },
   })
   ```

2. `write` and `resize` go to `child.terminal`. Keep `#exitEmitted` and the existing
   `kill(signal)` semantics, including the 250 ms escalation — that behaviour is about the child
   shell, not the transport, and must survive.
3. Delete `#writeQueue`. It serialises writes into a JSON-lines pipe; a direct `terminal.write()`
   has no such ordering hazard. Do not port it "just in case" — carrying it forward hides that the
   protocol is gone.
4. Keep emitting the same observability events with the same names. A latency change should be
   visible in existing dashboards, not hidden behind renamed actions.

## Gate 2 — Verification

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
4. `bun run --filter server test`, plus full `bun run verify`. Per `plans/README.md`, use
   per-workspace baseline deltas.

## Gate 3 — Delete the bridge

Only after Gate 2 passes.

1. Remove `NodePtyBridge`, `NODE_PTY_BRIDGE_SCRIPT`, `resolveNodeBinary`, `cachedNodeBinary`,
   `readBridgeMessages`, `readBridgeStderr`, and `resolveNodePtyModule`.
2. Drop `@lydell/node-pty` from `apps/server/package.json` and `bun.lock`.
3. No compatibility shim and no feature flag, per the greenfield rule. If Gate 2 fails, fix it or
   revert the branch — do not ship both.

## Risks and rejected alternatives

- **`Bun.Terminal` is young.** Landed in 1.3.5; this repo is on 1.4.0. The API is POSIX-only, which
  matters for the Windows target in plan 073 — **confirm Windows support before Gate 3 deletes the
  fallback.** This is the one thing that could force keeping both paths, and it is why deletion is
  its own gate behind verification rather than part of Gate 1.
- **Rejected — keep the bridge and only optimise the framing** (e.g. length-prefixed binary instead
  of JSON lines). Recovers part of the tail-latency win and none of the 15.7 ms startup win, while
  keeping a Node process per terminal and an untypecheckable embedded script.
- **Rejected — a community FFI PTY** (`bun-pty`, `bun-pty-rust`). Made sense before 1.3.5; adding a
  Rust/FFI dependency to avoid a first-party API is now strictly worse.

## Out of scope

- Terminal rendering. Plan 075.
- The `bun --watch` zombie leak (plan 076) — this plan reduces the child count but does not fix the
  reaping bug.

## Open questions for the operator

1. **Does `Bun.Terminal` support Windows?** It is documented POSIX-only. Plan 073 keeps Windows as a
   target, so if this is still POSIX-only the bridge may have to survive for Windows and Gate 3
   becomes conditional. This is the only thing that can change the shape of the plan.
