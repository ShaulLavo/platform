# Plan 076: Stop leaking defunct children across `bun --watch` reloads

> **Executor instructions**: Read this plan completely, then read Platform `AGENTS.md` and root
> `PLAN.md`. This is a small plan whose main output is a decision, not a large diff. Do not commit,
> push, create a branch, publish, or open a PR without explicit operator approval.

## Status

- **State**: Proposed — needs root scheduling
- **Priority**: P3 — dev-only, and the resource cost of the symptom is close to zero
- **Effort**: XS–S depending on the option chosen
- **Risk**: LOW
- **Platform baseline**: `e3fc816b`

Root `PLAN.md` is authoritative for ordering.

## Why

A single day of development accumulated **94 zombie processes** under the dev server
(`bun --watch src/index.ts`), all `node` and `sh` children, arriving in bursts between 12:55 and
13:51 and then stopping when editing stopped.

**Every spawn site in `apps/server` was individually correct in the original audit.** It covered
the former Node PTY bridge, now replaced by `@workspace/pty` and its awaited `exited` promise, the LSP `proxy-session` (`this.process.once('exit', ...)`),
`installers.ts` `commandOutput`/`runCommand` (both await `waitForExit`), `search-tool-runner`
(`once('close')`), `wallpaper/service` (awaits `child.exited`), `codex.ts` (`on('exit')`), and
`claude-auth` (awaits `child.exited`). None of them leak.

The bug is in the reload model, and it was confirmed by controlled experiment rather than
inspection:

```
bun --watch, same process across reloads (PID identical 3/3)

  child spawned BEFORE a reload, then killed  ->  Z (defunct), never reaped
  child spawned AFTER  the reload, then killed  ->  reaped cleanly ("reaped null")
```

`bun --watch` **re-evaluates the module in-process** — the PID is stable, but the JavaScript
context is fresh. Children spawned by the previous instance keep running and stay parented to the
watcher, while the `once('exit')` handler that would reap them was discarded with the old module
graph. When those children later exit, nothing calls `waitpid`, and they become zombies.

That matches the observed burst pattern exactly: zombies accumulate while files are being saved,
and stop when editing stops.

### Why the obvious fixes do not work

Both were tested, not assumed:

- **A `globalThis` registry does not survive a reload.** Same PID, but `globalThis.__x` was
  `undefined` on every one of three consecutive reloads. There is no in-JS place to stash a list of
  the previous instance's children.
- **Killing a leftover child does not reap it.** Neither Bun nor Node exposes `waitpid` for an
  arbitrary PID, so a killed orphan still lands in `Z`.

### Why this is P3 and not P1

Be honest about the impact before spending on it:

- A zombie holds a PID table entry and **nothing else** — no memory, no CPU, no file descriptors.
- It is **dev-only**: `--watch` appears solely in `apps/server`'s `dev` script. `start` and
  `server` do not use it, so no packaged build is affected.
- All of them are reaped the moment the watcher exits.

The real cost is diagnostic noise: 94 defunct entries make `ps` output and process-tree debugging
materially worse, and they were a red herring for an hour during the investigation that produced
this plan. That is a legitimate reason to fix it, and not a reason to over-engineer it.

## Design

There is no in-JS mechanism, so the only durable handle across a reload is the operating system.
The three viable options, in ascending cost:

| Option                          | Where it lives | Cost              | Fixes it for |
| ------------------------------- | -------------- | ----------------- | ------------ |
| A — accept it, document it      | a comment      | ~0                | nobody       |
| B — full process restart in dev | `package.json` | one script change | Platform     |
| C — report upstream to Bun      | oven-sh/bun    | one issue         | everyone     |

**Option B is the real fix and it is nearly free.** If the dev watcher restarts the _process_
instead of re-evaluating the module, the old process dies, its children are reparented to init, and
init reaps them. No zombies, no bookkeeping, no OS-level tracking in application code.

The [native PTY adoption](../docs/terminal.md) removed one Node process per terminal. It does
not fix the reload reaping bug for the remaining spawn sites.

## Gate 1 — Confirm the mechanism against the real server

The controlled experiment used a minimal script. Reproduce once against `apps/server` itself so the
fix is aimed at the real thing:

1. Start `bun run --filter server dev`.
2. Open a workspace so the LSP servers spawn (`node`-based; these were the bulk of the 94).
3. Touch a server source file to force a reload.
4. Confirm the pre-reload LSP children survive the reload and become `Z` when they exit:
   `ps -eo pid,ppid,stat,comm | awk '$2==<watcher-pid> && $3 ~ /^Z/'`.

## Gate 2 — Choose and apply

Operator picks from the table above. If **B**:

1. Change `apps/server`'s `dev` script so a file change restarts the process rather than reloading
   the module in place.
2. **Measure what it costs.** In-process reload exists because it is fast; a full restart pays
   server boot every save. If boot is slow enough to hurt the edit loop, that trade may not be
   worth it for a P3 — and that judgement needs a number, not an opinion.
3. Confirm no zombies accumulate across ten consecutive reloads.

## Gate 3 — Upstream (independent of Gate 2)

Report to `oven-sh/bun`: `--watch` re-evaluates in-process without terminating or reaping children
spawned by the previous instance, so any long-lived child becomes a zombie on exit. The controlled
reproduction in Why is small and self-contained — include it verbatim. Not blocked by, and does not
block, Gate 2.

## Risks and rejected alternatives

- **A slower edit loop is a real regression.** Gate 2 step 2 exists so option B is not adopted on
  principle if it costs more than the problem.
- **Rejected — track child PIDs in a file and kill leftovers on startup.** The only cross-reload
  handle available to application code, and it still does not work: killing an orphan does not reap
  it, because there is no `waitpid`. It adds a state file and fixes nothing.
- **Rejected — `process.on('exit')` cleanup.** Does not fire on an in-process reload; the module
  graph is replaced, not unwound.
- **Rejected — a `globalThis` registry.** Tested and disproven above.
- **Rejected — spawn children detached in their own process group.** Reparents them away from the
  watcher, which trades zombies for genuinely orphaned live processes. Strictly worse.

## Out of scope

- Any change to the individual spawn sites in `apps/server`. They are correct; changing them would
  be fixing the wrong layer.
- Production process supervision. `--watch` is dev-only.

## Open questions for the operator

1. **A, B, or C — or B and C?** Recommended: **B + C**. B fixes it here for one script edit, C
   fixes it for everyone and costs one issue.
2. If B measurably slows the edit loop, is the noise worth the slowdown, or is A plus C the better
   trade?
