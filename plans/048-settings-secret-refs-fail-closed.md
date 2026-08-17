# Plan 048: Deliver the settings change when the secret store cannot be read, and fail closed while it cannot

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 146dede -- apps/server/src/settings/store.ts apps/server/src/settings/secrets.ts apps/server/src/settings/tests/store-watch.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: MED — touches the one function that decides what leaves the process
  as a settings snapshot. The change is small; getting the failure direction
  right is the whole job.
- **Depends on**: `plans/021-async-rejection-boundaries.md` server half, which
  landed as `146dede`. That commit created the boundary this plan works behind.
- **Category**: correctness / security
- **Planned at**: commit `5e54fa7`, 2026-08-17

## Why this matters

Plan 021 closed the crash: a `readFileSync` throw out of `SettingsStore.invalidate()`
used to take the whole Bun process down with nothing in the logs. `runDetached`
now catches it.

It left one thing open, and the test says so in prose
(`apps/server/src/settings/tests/store-watch.test.ts:207-212`): **the settings
change in flight when the read throws is dropped rather than delivered.**
`invalidate()` clears the cached snapshot, then reads secrets, _then_ notifies
listeners — so a throw at the read aborts before any listener runs. The file is
already on disk; nobody is told. The settings page keeps showing the old value
until something else triggers a reload.

Plan 021 deliberately refused to fix this with a drive-by `try/catch`, on the
grounds that stale `secretRefs` are security-relevant. **That instinct was right
and its stated reason was wrong**, in a way that matters for the fix:

`apps/server/src/settings/secrets.ts:163-165`:

```ts
export function maskProviderSecrets<T>(instances: T, secrets: ReadonlySet<SecretRef>): T {
  return mapEnvironment(instances, (ref) => (secrets.has(ref) ? REDACTED_SETTINGS_VALUE : '')) as T
}
```

Every environment entry becomes either the redaction marker or an empty string.
**A real value never leaves this function**, whatever the ref set contains. So
stale refs cannot expose a secret.

What they can do is delete one. `apps/server/src/settings/secrets.ts:146`:

```ts
if (value !== REDACTED_SETTINGS_VALUE) secrets.set(ref, value === '' ? null : value)
```

`REDACTED` on the way back in means _leave the stored secret alone_. `''` means
**delete it**. So a stale ref set makes an existing secret render as an empty
field, and the next save of that row sends `''` and wipes it.

`SettingsStore.invalidate()` already documents this exact hazard as the reason
for its unconditional re-read (`store.ts:307-310`):

> Re-read on every invalidation, not only when _we_ wrote a secret. The secret
> file has no watcher, so a hand-edit is otherwise invisible: the page would show
> a set variable as empty, and the next save of that row sends `''` back, which
> the write path reads as "delete it".

The re-read is a deliberate data-loss guard. The EISDIR throw is that guard
failing — loudly before 021, silently now. This plan makes it fail _safely_:
deliver the change, and while the ref set is untrustworthy, mask toward
`REDACTED` (which round-trips as "leave it alone") instead of toward `''`
(which round-trips as "delete it").

The failure mode has a natural safe value. Use it.

## Current state

### The abort point

`apps/server/src/settings/store.ts:305-316`:

```ts
  private invalidate() {
    this.cachedSnapshot = null
    // Re-read on every invalidation, not only when *we* wrote a secret. The
    // secret file has no watcher, so a hand-edit is otherwise invisible: the
    // page would show a set variable as empty, and the next save of that row
    // sends `''` back, which the write path reads as "delete it".
    this.secretRefs = new Set(this.secretStore.readSync().keys())
    const snapshot = this.snapshot()

    for (const listener of this.listeners) {
```

`this.secretStore.readSync()` throws → `invalidate()` unwinds → the listener loop
below it never runs. Note the listener loop already has its own `try/catch` per
listener (`store.ts:313-323`) with a documented reason; that is a different
concern and is correct as-is.

### The field and its other writer

`store.ts:55-58`:

```ts
  /**
   * Which secrets exist, so the synchronous snapshot can mask without an await.
   * Only the refs are held — never the values.
   */
  private secretRefs: ReadonlySet<SecretRef> = new Set()
```

`store.ts:70`, in the constructor — the same read, unguarded:

```ts
this.secretRefs = new Set(this.secretStore.readSync().keys())
```

**This one is in scope too.** A corrupt secret store at construction throws out of
`createApp`, which is a different and arguably acceptable failure (the server
refuses to start rather than starting wrong) — but it should at minimum fail with
a structured error naming the path, not a bare `EISDIR`. Decide and state which
you did; see Step 4.

### Where the refs are consumed

`store.ts:86-92`:

```ts
    this.cachedSnapshot = {
      values: {
        ...resolution.values,
        // Masked here rather than at the route, so there is exactly one place a
        // provider environment can leave the process and it is the safe one.
        [PROVIDER_INSTANCES]: maskProviderSecrets(
          resolution.values[PROVIDER_INSTANCES],
          this.secretRefs,
        ),
      },
```

One call site. That comment is the design invariant this plan must preserve:
exactly one place a provider environment leaves the process.

### The characterization test that must flip

`apps/server/src/settings/tests/store-watch.test.ts:195-217` currently asserts
only `expect(store.snapshot()).toBeDefined()`, with a comment explaining that the
in-flight change is dropped and why closing that needs its own decision. **This
plan's job is to make that comment obsolete and replace the assertion with a real
one.** Read the whole test before editing it — its setup (a directory where
`secrets.json` should be) is the reproduction you need.

### Conventions

From `AGENTS.md`:

> - Never throw `new Error`. Create errors with `createError` from `evlog` — in
>   practice through the feature's `structured-errors.ts` wrapper
>   (`createStructuredError` or a `defineErrorCatalog` entry) so the error carries
>   `code`, `status`, `why`, and `fix`.
> - Logging is wide-event style (evlog). Always prefer wide logs: enrich the one
>   event per operation/request with more fields instead of emitting extra narrow
>   log lines.
> - Secrets never enter the settings document. They go to the secret store, which
>   is why the raw JSON view, export and the settings file itself are safe to read.
> - Use guard clauses and early returns. Keep the happy path shallow.
> - Do not `mock.module` or `vi.mock` our server, client, or feature modules.

**Never put a secret value, or a path-shaped value that could contain one, into a
log context object.** `146dede`'s commit message records that
`recordProcessWarning` does not redact. The secrets _path_ is fine (it is a
location, not a credential); a secret _value_ or a ref's contents are not.

## The design — read before Step 1

When `readSync()` fails, the ref set is untrustworthy. Three candidate behaviors:

|       | Behavior                                   | Round-trips as                                      | Verdict                                                         |
| ----- | ------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------- |
| **A** | Keep stale refs, carry on                  | existing secret may show `''` → **deleted on save** | **Wrong.** This is the data loss the re-read exists to prevent. |
| **B** | Empty the refs                             | every secret shows `''` → **all deleted on save**   | **Worse.** Strictly the most destructive option.                |
| **C** | Mark stale; mask every entry as `REDACTED` | `REDACTED` → "leave it alone"                       | **Correct.** Fails toward preserving data.                      |

**Implement C.** Add a `secretRefsStale` flag; when set, the snapshot masks the
whole provider environment to `REDACTED_SETTINGS_VALUE` regardless of ref
membership, and `invalidate()` continues to the listeners.

Two consequences to accept deliberately:

- While stale, a provider variable that has **no** secret set also renders as
  `REDACTED` rather than empty. That is a cosmetic regression in a degraded state,
  and it is the safe direction — the user sees "something is here" instead of
  being invited to overwrite with nothing.
- The flag must clear on the next successful read, so recovery is automatic once
  the secret store is readable again. The existing test already removes the
  directory mid-way, so it exercises exactly this.

**Do not** try to distinguish "file missing" from "file unreadable" here.
`readSettingsFileSync` already maps ENOENT to an empty document — a missing
secret store is the normal empty case and does not reach the throw path. Only
genuine read failures do.

## Commands you will need

| Purpose                  | Command                                                                 | Expected on success  |
| ------------------------ | ----------------------------------------------------------------------- | -------------------- |
| Settings tests           | `cd apps/server && bun --bun vitest run src/settings`                   | all pass             |
| Settings + observability | `cd apps/server && bun --bun vitest run src/settings src/observability` | 73+ pass             |
| Full server suite        | `cd apps/server && bun run test`                                        | 796 passed, 0 failed |
| Server typecheck         | `cd apps/server && bun run typecheck`                                   | exit 0               |
| Server lint              | `cd apps/server && bun run lint`                                        | exit 0               |

**Baseline at `5e54fa7`**: `apps/server` is **796 passed / 0 failed** — plan 047
closed the one known failure. Any failure you see is yours. Do not run
`bun run verify` (whole monorepo, slower than you need).

## Scope

**In scope**:

- `apps/server/src/settings/store.ts` — the stale flag, the guarded reads, the
  masking branch
- `apps/server/src/settings/tests/store-watch.test.ts` — replace the
  characterization assertion with a real one
- New tests in `apps/server/src/settings/tests/`

**Out of scope** (do NOT touch):

- `maskProviderSecrets` and `extractProviderSecrets` in `secrets.ts`. Their
  contract — `REDACTED` means leave alone, `''` means delete — is what makes
  option C safe. **Changing either inverts this plan's entire safety argument.**
  Read them; do not edit them.
- The per-listener `try/catch` in the notify loop (`store.ts:313-323`). It has its
  own documented reason and is unrelated.
- `POST /settings/raw` and its secret-split bypass — that is **plan 046**. It
  touches the same file and is genuinely tempting. Leave it.
- The settings page UI. Surfacing "secrets unavailable" to the user is a real
  follow-up but it needs a design decision about where that indicator lives; this
  plan makes the server honest, not the UI chatty. Note it in your report.
- Adding a watcher to the secret store. The `invalidate()` comment explains the
  no-watcher design; changing it is a different plan.
- `runDetached` / `apps/server/src/observability/**` — plan 021 owns those and
  they landed correctly.
- Any new settings registry key.

## Git workflow

Per the operator rule in `plans/README.md`: **all work happens on `main`** — no
new branches, worktrees, or PRs unless the operator explicitly asks.

Conventional commits. Suggested subject:

```
fix(settings): an unreadable secret store stops dropping the change and stops inviting a delete
```

One commit is appropriate — the flag, the masking branch, and the test flip are
one idea.

## Steps

### Step 1: Reproduce, and confirm the instrument

Run the existing characterization test and confirm it passes _for the current
reason_ (the store survives but drops the change):

```bash
cd apps/server && bun --bun vitest run src/settings/tests/store-watch.test.ts
```

Then temporarily strengthen its final assertion to what this plan will make true —
that after the secrets directory is removed and a second settings write lands,
`store.snapshot().values['models.hidden']` reflects `["beta"]`.

**Verify**: that strengthened assertion **fails** before you change `store.ts`.
Per AGENTS.md's debugging rule, an assertion that has never failed proves
nothing. Keep the strengthened version — it becomes the real test in Step 5.

### Step 2: Add the stale flag and guard the reload read

In `store.ts`, add a private `secretRefsStale = false` beside `secretRefs`
(`:58`), with a short comment saying what it means.

In `invalidate()` (`:311`), wrap the read so a failure sets the flag, records a
wide event, and **falls through to the snapshot and the listener loop**:

- On success: refresh `secretRefs`, clear `secretRefsStale`.
- On failure: leave `secretRefs` as-is, set `secretRefsStale = true`, record one
  wide warn event carrying `area: 'settings'`, an operation name, the secrets
  file path, and the error.

Do **not** use `new Error`. Use the wide-event recorder already used in this file —
`recordRequestContext` appears at `store.ts:317`; check whether a warn-level
recorder is the right one here by reading `apps/server/src/observability/`.

**Verify**: `cd apps/server && bun run typecheck` → exit 0.

### Step 3: Mask conservatively while stale

In the snapshot builder (`:86-92`), branch on `secretRefsStale`:

- Not stale → today's behavior, `maskProviderSecrets(values, this.secretRefs)`.
- Stale → mask every environment entry to `REDACTED_SETTINGS_VALUE`.

Keep this inside the same single call site. The comment at `:87-88` — "exactly
one place a provider environment can leave the process and it is the safe one" —
must stay true. If you find yourself adding a second masking site, stop.

The cleanest shape is to pass a ref set that reports `has() === true` for
everything, so `maskProviderSecrets` is untouched and the branch is one
expression. A `{ has: () => true }` satisfying `ReadonlySet<SecretRef>` needs a
cast; prefer a tiny named helper over an inline `as` so the intent is legible.

**Verify**: `cd apps/server && bun --bun vitest run src/settings` → the Step 1
strengthened assertion now **passes**.

### Step 4: Decide the constructor read

`store.ts:70` performs the same unguarded read at construction. Choose and state
your choice in the commit message:

- **Recommended**: let it throw, but as a structured error naming the secrets path
  and the fix, so a corrupt secret store fails server startup legibly instead of
  with a bare `EISDIR`. Starting the server with an unreadable secret store means
  every provider spawn gets empty credentials, which is a worse and more confusing
  failure than refusing to start.
- **Alternative**: apply the same stale-flag treatment for symmetry.

Either is defensible. What is not defensible is leaving a bare `readSync()` at
`:70` while `:311` is carefully guarded, with nothing saying why they differ.

**Verify**: `cd apps/server && bun run typecheck && bun run lint` → exit 0.

### Step 5: Tests

See the test plan. **Verify**: `cd apps/server && bun --bun vitest run src/settings`
→ all pass including the new cases.

### Step 6: Full gate

```bash
cd apps/server && bun run lint && bun run typecheck && bun run test
```

**Verify**: 796 passed, 0 failed, plus your new tests.

## Test plan

In `apps/server/src/settings/tests/store-watch.test.ts`, extending the existing
EISDIR test rather than duplicating its setup:

1. **The change is delivered** — with the secrets directory in place, a settings
   write reaches `store.snapshot()`. This is Step 1's strengthened assertion and
   the headline fix.
2. **Listeners still fire** — register a listener before the failing read and
   assert it is called. `snapshot()` recomputing on demand could mask a still-
   broken notify path; this is the assertion that actually pins it.
3. **Masking fails closed while stale** — with an existing secret and the secrets
   path unreadable, the snapshot's provider environment shows
   `REDACTED_SETTINGS_VALUE`, **not** `''`. This is the data-loss guard and the
   most important test here.
4. **Recovery** — after the directory is removed and a further settings write
   lands, the flag clears and masking returns to normal (`''` for a ref with no
   secret, `REDACTED` for one with).
5. **The normal path is unchanged** — a readable secret store still masks exactly
   as before. Guards against a branch that accidentally makes everything
   `REDACTED` forever, which every test above would still pass.
6. **A wide event is recorded** on the failing read, with no secret value in it.

Model on the existing tests in that file; they already build a real temp settings
root and drive the real store. Do not mock the secret store.

## Done criteria

ALL must hold:

- [ ] `grep -n "secretRefsStale" apps/server/src/settings/store.ts` → the flag
      exists, is set on read failure, and is cleared on success
- [ ] The `store-watch.test.ts` EISDIR test asserts the delivered value, not just
      `toBeDefined()`, and its "what it does NOT do" comment is gone
- [ ] A test proves the stale path masks to `REDACTED_SETTINGS_VALUE`, never `''`
- [ ] A test proves the normal path still yields `''` for a ref with no secret
- [ ] `apps/server/src/settings/secrets.ts` is **unmodified** (`git diff --name-only`)
- [ ] `grep -n "new Error" apps/server/src/settings/store.ts` → no matches
- [ ] Exactly one `maskProviderSecrets` call site remains in `store.ts`
- [ ] `cd apps/server && bun run typecheck && bun run lint` → exit 0
- [ ] `cd apps/server && bun run test` → **796 passed, 0 failed** plus new tests
- [ ] `git diff --name-only` lists only `settings/store.ts`, the settings test
      file(s), and `plans/README.md`
- [ ] Your report states which constructor option you took in Step 4 and why

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's strengthened assertion **passes before** you change `store.ts`. The
  drop this plan fixes is then not happening, and the premise is wrong.
- You conclude the fix requires editing `maskProviderSecrets` or
  `extractProviderSecrets`. Their `REDACTED` = leave-alone / `''` = delete
  contract is the foundation of option C; if it does not hold as described in
  "Why this matters", **stop and report** — the whole design rests on it.
- Making the stale path mask everything as `REDACTED` breaks an existing settings
  test that asserts `''`. That is a real semantic collision and the operator
  should hear about it, not have it resolved by loosening the test.
- The settings page (`apps/web`) turns out to special-case `''` in a way that
  makes a `REDACTED` field unsavable or otherwise broken. That would make this a
  cross-cutting change needing a client half.
- Any second server test starts failing. Baseline is 796/796.
- You find yourself adding a settings registry key, a secret-store watcher, or
  touching `POST /settings/raw`. All three are out of scope.

## Maintenance notes

- **The durable insight**: the mask has a natural safe direction because
  `REDACTED` round-trips as "unchanged" and `''` round-trips as "delete". Any
  future code path that has to emit a provider environment under uncertainty
  should bias to `REDACTED` for the same reason. Worth a comment on
  `maskProviderSecrets` saying so, even though this plan does not edit it.
- **Correcting the record**: plan 021 excluded this fix on the grounds that stale
  refs "decide what `maskProviderSecrets` redacts" and are therefore a leak
  concern. Right to exclude, wrong about the risk — masking never emits a real
  value, so the exposure is nil and the danger is silent secret _deletion_. If
  you touch this area again, reason about deletion, not disclosure.
- **A reviewer should check one thing above all**: that the stale branch produces
  `REDACTED` and not `''`. Getting that backwards turns a degraded-state
  annoyance into silent credential loss, and every other test in the file would
  still pass.
- **Deliberately deferred**: the settings page has no indication that secrets are
  currently unavailable. A user in the stale state sees masked fields with no
  explanation. That needs a UI decision (a diagnostic on the provider section?)
  and belongs with plan 026's settings work, not here.
- **Deliberately deferred**: the secret store still has no watcher, so a
  hand-edit remains invisible until some other invalidation. That is the
  documented design; revisit only if the polling cost of a watcher is ever
  justified.
