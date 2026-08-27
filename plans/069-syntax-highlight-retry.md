# Plan 069: Retry a failed highlight instead of clearing it forever

> **Executor instructions**: Read this plan completely, then read Platform `AGENTS.md`, root
> `PLAN.md`, and `/Users/shaul/.agents/skills/never-nester/SKILL.md`. This is an Editor-only change
> in `packages/editor/src/editor/syntaxController.ts`. Do not commit, push, create a branch,
> publish, or open a PR without explicit operator approval.

## Status

- **State**: Proposed — needs root scheduling
- **Priority**: P2 — resilience, not correctness. It makes a class of transient failure survivable;
  it does not fix any known broken behaviour on its own.
- **Effort**: S
- **Risk**: LOW, with one sharp edge: a retry that hides a permanent failure is worse than no retry.
  See "The thing to get right".
- **Editor baseline**: `0f4f8f498954a701cbf8041a13586f227bd5d3ce`
- **Relationship to Plan 068**: independent. 068 fixes a real cause; this makes the _next_ cause
  survivable. Neither blocks the other. Do not land this first — see below.

## Why

`recoverHighlightError` treats its two callers asymmetrically:

```ts
if (!change) {
  this.applyHighlightError(documentVersion, startedAt) // clear tokens. stop. forever.
  return
}
this.reloadHighlighterSession() // edits self-heal
```

A failure that arrives with a `change` reloads the highlighter session and recovers. A failure with
no `change` — `changeKind: 'refresh'` — clears the theme and tokens and never tries again. Nothing
schedules a retry, and no state records that highlighting is dead.

Refresh is the **document-open path**. So the one failure mode with no recovery is the one that runs
on first paint, which is why a single worker error reads to the user as "this app has no syntax
highlighting" rather than "that file failed once".

There is a second, smaller gap behind it. `EditorSyntaxStatus` is
`'plain' | 'loading' | 'ready' | 'degraded' | 'error'`, and `applySyntaxError` sets `'error'` for
the structural/tree-sitter path — but `applyHighlightError` sets no status at all. The observed
failure left `syntaxStatus: 'loading'` in the log payload while highlighting was permanently
finished. There is no state to observe, and therefore nothing a retry could be driven from.

## The thing to get right

This plan is one careless step away from making the codebase worse.

The blob-worker bug in Plan 068 was found _because_ the failure was loud, permanent, and logged with
a specific error string. A retry loop that quietly re-attempted a permanently-broken module import
would have produced the same visible outcome — no highlighting — with the cause buried under N
identical warnings, or worse, spun a dead worker in a loop.

So the acceptance criterion is not "highlighting recovers". It is:

- a **transient** failure recovers, and says that it did;
- a **permanent** failure still ends in one loud, distinct, terminal event that names the error;
- no failure produces an unbounded loop.

If those three cannot all be met, do not land the retry.

## Design

1. **Give the highlighter an observable status.** Add a highlighter-side status alongside
   `syntaxStatus` rather than overloading it — the two providers fail independently and a document
   can have working tree-sitter structure with dead shiki highlighting. Set it to `'error'` in
   `applyHighlightError`. This is a prerequisite; the retry is driven from it, and it is worth
   landing even if the retry is deferred.

2. **Bounded retry with backoff on the refresh path only.** The edit path already recovers; leave it
   alone. On `!change`, schedule a retry of the same document version, with a small bounded attempt
   count and increasing delay. Every attempt is guarded by the existing staleness check
   (`documentVersion !== this.options.getDocumentVersion()`) — a retry for a superseded version must
   drop, not paint.

3. **Escalate once, then stop.** Retrying the same request against a highlighter session that is
   itself dead cannot succeed. Ladder: retry the request → `reloadHighlighterSession()` → give up.
   Do not add worker-owner recreation in this plan; that reaches across into Platform's
   `disposeEditorShikiWorkerOwner` and belongs in its own change if it is ever justified.

4. **Terminal event on exhaustion.** Emit a distinct action — not another
   `highlight_request_failed` — carrying the attempt count and the final error, at `warn` or above.
   This is the event that must stay greppable, because it is the one that will find the next bug.
   Keep the existing per-attempt events at their current level so a retry storm is visible as a
   storm.

5. **Clear the terminal state on natural re-entry.** Theme change, language change and session
   reload already rebuild the highlighter; make sure each resets the attempt counter so a document
   that failed once is not permanently poisoned for the life of the session.

**Where this does not go**: not in `shiki/workerClient.ts`. Transport-level retry cannot see document
versions and would happily repaint a stale document. The controller owns staleness; the retry lives
with it.

## Retryability

Do not attempt to classify errors by message — the strings come from three different providers and a
browser. Treat every failure as retryable, and let the bound plus backoff make a permanent failure
cheap: a handful of attempts, then the terminal event. This keeps the logic honest and small, and
avoids a classifier that silently misroutes the next unfamiliar error.

## Verification

Per-workspace baseline deltas only; never gate on an absolute test count or a bare root
`bun run verify`.

1. `packages/editor`: `vitest run` plus `tsgo --noEmit`.
2. Unit coverage in the controller's existing test file, driving the real controller rather than a
   mock provider:
   - a refresh-path failure that succeeds on retry N paints tokens and reaches the ready status;
   - a refresh-path failure that never succeeds emits exactly one terminal event, stops, and leaves
     the highlighter status at `'error'`;
   - a retry whose document version has been superseded drops without painting;
   - the edit path's existing `reloadHighlighterSession` behaviour is unchanged.
3. Assert the bound directly: a permanently failing provider must produce a bounded, countable
   number of attempts. This is the test that keeps the loop from ever becoming unbounded.

## Sequencing note

Land this **after** Plan 068, or at least after 068's root cause is understood and fixed. Landing a
retry while a permanent failure is live would convert a diagnosable error into a retry storm and
make 068 harder to find, not easier.

## Out of scope

- Recreating the shiki worker owner after repeated failures.
- Any retry for the structural/tree-sitter path. `applySyntaxError` already sets `'error'` and
  `recoverSyntaxError` already reloads on the edit path; if that path needs the same treatment it
  should be measured first, not assumed.
- Surfacing "highlighting failed" in the UI. The status field this plan adds is what a later UI
  change would read; deciding whether the user should see it is a product call.
