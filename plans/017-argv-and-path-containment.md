# Plan 017: Close the argv option-injection sites and the `..`-prefix containment bug

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat ace313f..HEAD -- apps/server/src/git apps/server/src/fs/path.ts apps/server/src/fs/search.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none. Better after `plans/013-test-baseline-repairs.md` so the
  new tests run against an isolated database, but not blocked by it.
- **Category**: security / correctness
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

Two small, independent defects in the server's path and argv handling. Both are
defensive-maintenance fixes in a local dev tool, not remote-exploitable holes —
the server binds loopback and every subprocess is invoked with an argv array,
never a shell. Framed honestly:

**1. Option injection at four positional argv sites.** Four places pass a
client-supplied string as a _trailing positional_ to `git` or `fd` with no `--`
separator and no ref validation. A value beginning with `-` is then read by the
tool as an option rather than as a branch, ref, or query. The consequence is not
arbitrary code execution — it is that a caller can steer a git subcommand into
behavior the route never intended (for example, `git show` writing a
caller-named file).

What makes this worth fixing rather than debating: **the repo already wrote the
defense and already knows why.** `apps/server/src/git/contracts.ts:60-70` defines
`gitRefNameSchema` with a comment that names this exact threat. The fix is to
apply the schema that already exists, and to add `--` the way nine pathspec sites
in the same file already do correctly.

**2. `..`-prefix path containment bug.** `assertInside` tests
`relative.startsWith('..')` where its sibling five lines up correctly tests
`startsWith('../')`. The result is not a security hole — it is _over_-rejection:
a file legitimately named `..foo` at the workspace root is unreachable through
the entire filesystem API and reports `PATH_OUTSIDE_WORKSPACE`, while
`a/..bar` one directory deeper works fine. Depth-dependent behavior on a legal
filename reads to a user as corruption.

Both fixes are a handful of lines with clean, testable verification.

## Current state

### The ref-validation schema that already exists

`apps/server/src/git/contracts.ts:60-70` — read the comment; it is the
justification for this whole plan:

```ts
/**
 * Refs reach git as argv, so a leading dash would be read as a flag and a space
 * would split into two arguments. The allowed shape is git's own ref grammar
 * narrowed to what a base or branch name ever needs.
 */
const gitRefNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(255),
  v.regex(/^[A-Za-z0-9_][A-Za-z0-9._/-]*$/),
)
```

The regex requires the first character to be alphanumeric or `_`, which is
exactly what defeats a leading `-`.

It is already applied to `base` and `branch` in some request schemas
(`contracts.ts:88, 89, 104, 112`). **Part of this plan's job is determining
which of the four call sites below are already covered by it and which are
not** — do not assume all four are unprotected.

### The four positional sites

`apps/server/src/git/service.ts:362`:

```ts
    const result = await this.git(repository.rootAbsolutePath, ['show', revisionPath], {
```

`apps/server/src/git/service.ts:515`:

```ts
await this.git(repository.rootAbsolutePath, ['checkout', body.branch])
```

`apps/server/src/git/service.ts:524` and `:529`:

```ts
    const args = ['branch', body.branch]
    ...
      await this.git(repository.rootAbsolutePath, ['checkout', body.branch])
```

`apps/server/src/fs/search.ts:703`:

```ts
if (searchMatchMode(context.options) !== 'fuzzy') args.push(context.query)
```

— a trailing positional appended to the `fd` argv built by `fdArgs`
(`search.ts:678`).

### The correct pattern already in the same file

`apps/server/src/git/service.ts` uses `'--'` correctly at **12** sites. Confirm:

```bash
grep -c "'--'" apps/server/src/git/service.ts   # → 12
```

Read two of them to match the idiom before you edit anything.

### The containment bug

`apps/server/src/fs/path.ts:75-81` — the **correct** sibling:

```ts
function normalizeClientPath(input: string) {
  assertClientPathShape(input)

  const normalized = path.posix.normalize(input || '.')
  if (normalized === '.') return ''
  if (normalized === '..') throw new FsError('PATH_OUTSIDE_WORKSPACE')
  if (normalized.startsWith('../')) throw new FsError('PATH_OUTSIDE_WORKSPACE')
```

Note: exact `'..'` handled separately, then `'../'` **with the separator**.

`apps/server/src/fs/path.ts:93-98` — the bug:

```ts
function assertInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  if (relative === '') return
  if (relative.startsWith('..')) throw new FsError('PATH_OUTSIDE_WORKSPACE')
  if (path.isAbsolute(relative)) throw new FsError('PATH_OUTSIDE_WORKSPACE')
}
```

`relative.startsWith('..')` matches `..foo`, `..bar/baz`, and `...` — none of
which escape the root.

There is a **third** copy of this pattern at `apps/server/src/fs/watch.ts:317`:

```ts
if (relative.startsWith('..')) return null
if (path.isAbsolute(relative)) return null
```

Same bug, different consequence: filesystem events for a `..foo` file are
silently dropped, so the tree never updates for it. Fix both; they are the same
predicate.

### Conventions to honor

From `AGENTS.md`:

> - Never throw `new Error`. Create errors with `createError` from `evlog` — in
>   practice through the feature's `structured-errors.ts` wrapper
>   (`createStructuredError` or a `defineErrorCatalog` entry) so the error
>   carries `code`, `status`, `why`, and `fix`.
> - Logging is wide-event style (evlog). Always prefer wide logs: enrich the one
>   event per operation/request with more fields instead of emitting extra narrow
>   log lines.
> - Use guard clauses and early returns. Keep the happy path shallow.
> - Drive the real in-process Elysia server. The `server` fixture builds
>   `createApp` over a temp workspace.
> - Build real state. For example, `git init` a temp repo and write real files,
>   then assert through real routes.

`FsError` is the existing error type in `fs/path.ts`; keep using it there rather
than introducing a new one.

## Commands you will need

| Purpose          | Command                                                    | Expected on success |
| ---------------- | ---------------------------------------------------------- | ------------------- |
| Server tests     | `cd apps/server && bun run test`                           | all pass            |
| Targeted test    | `cd apps/server && bun --bun vitest run src/fs/tests/path` | passes              |
| Server typecheck | `cd apps/server && bun run typecheck`                      | exit 0              |
| Server lint      | `cd apps/server && bun run lint`                           | exit 0              |
| Full verify      | `bun run verify` (repo root)                               | exit 0              |

## Scope

**In scope**:

- `apps/server/src/git/service.ts` (the four positional sites)
- `apps/server/src/git/contracts.ts` (apply `gitRefNameSchema` where missing)
- `apps/server/src/fs/path.ts` (`assertInside`)
- `apps/server/src/fs/watch.ts` (the same predicate at line 317)
- `apps/server/src/fs/search.ts` (the `fd` positional)
- New tests in `apps/server/src/fs/tests/` and `apps/server/src/git/tests/`

**Out of scope** (do NOT touch):

- The **12 existing `'--'` sites** in `git/service.ts`. They are already correct;
  read them as the pattern, do not "improve" them.
- Any change to the shell-invocation strategy. Every subprocess already uses an
  argv array with no shell. This plan adds a separator and validation; it does
  not restructure spawning.
- `apps/server/src/auth.ts` and the origin-allowlist model. That is a separate,
  larger decision (item 33 in `plans/README.md`) and is explicitly _not_ part of
  this plan.
- The wallpaper routes — already audited twice and confirmed by design (they
  take no client-supplied path).
- `normalizeClientPath` at `path.ts:75-81` — already correct. Read it, copy its
  shape, leave it alone.
- Widening `gitRefNameSchema`'s regex. If a legitimate ref shape is rejected by
  it, that is a STOP condition, not a reason to loosen the pattern.
- Performance work in `fs/search.ts`. The `--sort path` finding
  (item 5 in `plans/README.md`) touches the same file but is a different change;
  do not fold it in.

## Git workflow

Per the operator rule in `plans/README.md`: **all work happens on `main`** — no
new branches, worktrees, or PRs unless the operator explicitly asks.

Conventional commits. Example subjects:

```
fix(git): refs reach argv behind the schema that already exists to stop them
fix(fs): a file named ..foo stops reporting as outside the workspace
```

Commit the git half (Steps 1–3) and the path half (Steps 4–5) separately — they
are independent and separately revertable.

### Note on responsible handling

Findings and commit messages should describe the code pattern and the fix. Do
not write proof-of-concept payloads, crafted argument strings, or step-by-step
misuse instructions into the repo, the tests, or the commit messages. A test that
asserts `checkout` rejects a leading-dash branch name is fine and is what this
plan asks for; a test that demonstrates a working exploit is not.

## Steps

### Step 1: Determine which git sites are already covered

For each of the four call sites, trace the value back to the route schema and
record whether `gitRefNameSchema` already validates it:

```bash
cd /Users/shaul/Desktop/D/platform
grep -n "gitRefNameSchema" apps/server/src/git/contracts.ts
grep -n "revisionPath\|body.branch" apps/server/src/git/service.ts
```

Produce a four-row table: site → the schema field feeding it → validated yes/no.

**Verify**: you can state, for each of `show`, `checkout` (two sites), and
`branch`, exactly which schema field supplies the string and whether that field
is a `gitRefNameSchema`. If a site's input turns out **not** to come from a
client at all (e.g. it is derived server-side from a validated value), record
that — it needs no change, and saying so is a real result.

### Step 2: Apply `gitRefNameSchema` where it is missing

For each unvalidated site found in Step 1, add `gitRefNameSchema` to the request
schema in `apps/server/src/git/contracts.ts`, matching how `base` and `branch`
are already declared at lines 88, 89, 104, and 112.

`revisionPath` at `service.ts:362` is a `<ref>:<path>` composite, so
`gitRefNameSchema` will not fit it as-is. Handle it by validating the **ref**
half with `gitRefNameSchema` and the **path** half through the existing
client-path normalization, then composing — or, if the value is already built
server-side from two separately-validated halves, record that and make no change.
Read the code before deciding.

**Verify**: `cd apps/server && bun run typecheck` → exit 0.

### Step 3: Add `--` at the positional sites

Insert the `--` separator so the tool cannot read the value as an option, using
the same idiom as the 12 existing sites:

```ts
;['checkout', '--', body.branch][('branch', '--', body.branch)]
```

**Check each subcommand's actual grammar before inserting.** `git branch` and
`git checkout` accept `--` before a branch name, but not every git subcommand
places `--` in the same position, and `git show <ref>:<path>` in particular does
**not** take a `--` before the revision. Where `--` is not grammatical, schema
validation from Step 2 is the whole defense and that is acceptable — record which
sites got which treatment.

For `fd` (`apps/server/src/fs/search.ts:703`), append the query after a `--`
separator in `fdArgs`. Verify against `fd --help` that it supports `--`; if it
does not, validate the query shape instead and say so.

**Verify**: `cd apps/server && bun run test` → all pass. The existing git suite
(`git/tests/service.test.ts`, and the 20 mutation-path tests from plan 002)
exercises checkout and branch on a real temp repo, so a wrongly-placed `--`
shows up immediately as a failure.

### Step 4: Fix `assertInside`

`apps/server/src/fs/path.ts:93-98` — match the shape of `normalizeClientPath`:

```ts
function assertInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  if (relative === '') return
  if (relative === '..') throw new FsError('PATH_OUTSIDE_WORKSPACE')
  if (relative.startsWith(`..${path.sep}`)) throw new FsError('PATH_OUTSIDE_WORKSPACE')
  if (path.isAbsolute(relative)) throw new FsError('PATH_OUTSIDE_WORKSPACE')
}
```

Two details that matter:

- **Handle exact `'..'` separately**, as `normalizeClientPath:80` does. Testing
  only for the `..`+separator prefix would let a bare `..` through.
- **Use `path.sep`, not a hardcoded `/`.** `path.relative` returns
  platform-native separators, so on Windows the relative path is `..\foo`.
  `normalizeClientPath` can use `'../'` because it operates on `path.posix`
  normalized input; `assertInside` uses plain `path.relative` and cannot.

Apply the identical fix at `apps/server/src/fs/watch.ts:317`, preserving its
`return null` control flow rather than throwing.

Consider extracting the predicate into one shared `isOutsideRoot(relative)`
helper used by both — two copies of a security predicate is how they drift.
Place it wherever the repo's structure suggests; do not create a new file just
for it if a natural home exists in `fs/path.ts`.

**Verify**: `cd apps/server && bun run typecheck` → exit 0.

### Step 5: Full verify

```bash
cd apps/server && bun run lint && bun run test
cd /Users/shaul/Desktop/D/platform && bun run verify
```

**Verify**: all exit 0.

## Test plan

New tests, all driving the **real** in-process server per `AGENTS.md` ("Drive the
real in-process Elysia server", "Build real state… `git init` a temp repo and
write real files, then assert through real routes"). Do not mock.

**In `apps/server/src/fs/tests/` — containment (model on the existing fs tests):**

1. A file named `..foo` created at the workspace root is readable through the
   fs API and does **not** produce `PATH_OUTSIDE_WORKSPACE`. This is the
   regression test for the bug; it must fail before Step 4 and pass after.
2. A directory named `..bar` at the root can be listed.
3. `a/..baz` (one level deep) still works — the depth-independence assertion.
4. A genuine escape (`..`, `../outside`, and an absolute path outside the root)
   still throws `PATH_OUTSIDE_WORKSPACE`. **This is the important one** — the fix
   must not weaken containment, and this test is what proves it did not.
5. If you extracted a shared predicate, a direct unit test of it covering
   `''`, `'..'`, `'../x'`, `'..foo'`, `'a/..b'`, and an absolute path.

**In `apps/server/src/git/tests/` — ref validation:**

6. `checkout` with a branch name beginning with `-` is rejected by the route
   with a validation error, and no git process runs. Assert the rejection, not
   any particular subprocess behavior.
7. `branch` creation with the same shape is rejected.
8. Ordinary branch names still work end-to-end — `feature/x`, `release-1.2`,
   `a_b.c`. **This is the important one**: `gitRefNameSchema`'s regex is
   restrictive, and the real risk in this plan is rejecting a legitimate ref, not
   letting a bad one through.

Model the git tests on `apps/server/src/git/tests/service.test.ts`, which already
sets up a real temp repository. Model the fs tests on the existing
`apps/server/src/fs/tests/` suites.

Verification: `cd apps/server && bun run test` → all pass, including 8 new tests.
Confirm tests 1 and 6 **fail** against the unmodified code first — a regression
test that never failed is not a regression test.

## Done criteria

ALL must hold:

- [ ] `grep -n "startsWith('\.\.')" apps/server/src/fs/` returns **no** matches
      (both `path.ts:96` and `watch.ts:317` fixed)
- [ ] The new containment tests pass, and tests 1 and 6 were confirmed to fail
      before the fix
- [ ] Every site identified as unvalidated in Step 1 now either has
      `gitRefNameSchema` on its schema field, a `--` separator, or a recorded
      justification for needing neither
- [ ] `cd apps/server && bun run typecheck` exits 0
- [ ] `cd apps/server && bun run test` exits 0 with 8 new tests
- [ ] `bun run verify` exits 0 from the repo root
- [ ] `git diff` touches only the six files in scope
- [ ] No proof-of-concept payload or misuse instructions appear in any test,
      comment, or commit message
- [ ] `plans/README.md` status row updated
- [ ] Your report states, per site, which of the four got schema validation,
      which got `--`, and which needed neither and why

## STOP conditions

Stop and report back (do not improvise) if:

- `gitRefNameSchema` rejects a branch name the app legitimately produces — for
  example a ref containing a character its regex excludes. **Do not widen the
  regex**; report the case. The schema's shape is a deliberate decision
  documented in its own comment.
- Adding `--` to a git invocation breaks an existing test. That means the
  separator is in the wrong position for that subcommand's grammar; report which
  subcommand rather than removing the test.
- `fd` does not accept `--` before its positional query. Fall back to validating
  the query shape and report it.
- Fixing `assertInside` causes any existing containment test to fail. A failing
  _escape_ test means the fix weakened containment — revert immediately and
  report. This is the one way this plan could do real harm.
- The Step 1 trace shows a fifth or sixth positional site not listed here.
  Report the full list; the scope is wider than modelled.
- `revisionPath` turns out to be assembled from unvalidated client input in a
  way that neither `gitRefNameSchema` nor path normalization covers cleanly.
  That is a design question, not a one-line fix.

## Maintenance notes

- The durable lesson is in `git/contracts.ts:60-63`: this repo already wrote down
  why refs need a schema. Any **new** route that passes a client string to `git`,
  `fd`, or `rg` as a positional should reach for `gitRefNameSchema` (or a sibling)
  by default. A reviewer seeing a bare `body.something` inside an argv array
  should treat it as a finding.
- A reviewer should scrutinize one thing: that the _escape_ tests still pass. It
  is easy to fix over-rejection by under-rejecting.
- If you extracted a shared `isOutsideRoot` predicate, that is now a
  security-relevant function with two callers. It deserves the direct unit test
  (test 5) more than either caller does.
- **Deliberately deferred**: the origin-allowlist model (item 33) — `SERVER_ALLOWED_ORIGINS`
  is a control that does not control, because dev-origin mode checks the list and
  then widens to any loopback origin on any port. That is documented as
  deliberate (vite's port moves) and is a decision to make, not a bug to fix.
- **Deliberately deferred**: `--sort path` in the same `fs/search.ts` file
  (item 5) — likely the largest single-line performance win in the repo, but a
  different change with a different verification story.
