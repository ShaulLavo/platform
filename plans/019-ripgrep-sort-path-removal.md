# Plan 019: Delete the `--sort path` path from the ripgrep invocation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat ace313f -- apps/server/src/fs/search.ts apps/server/src/fs/tests/search.test.ts`
> Expected: **empty output**. (Note the omitted `..HEAD` — this form compares the
> _working tree_, not just committed history. The repo is expected to have
> unrelated uncommitted changes, so a commit-only diff would miss real drift in
> these two files.) If either file has changed, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `ace313f`, 2026-08-16
- **Closes theme**: T6 in `plans/README.md` — "Right gate, wrong data structure
  behind it". This is the first of the two T6 instances.

## Why this matters

Every workspace content search spawns `rg` with `--sort path` hard-coded into the
argument list. ripgrep's own help text for that flag says, verbatim:

> Note that sorting results currently always forces ripgrep to abandon
> parallelism and run in a single thread.

So the search feature uses **one core on an 8–16 core machine**, and it buys an
ordering guarantee that is thrown away twice before a human sees it: the web
client re-sorts every file group with its own collator (`compareSearchPaths`)
after _every_ streamed batch. The server-side path order is dead weight.

Measured on this repo at `ace313f` (~6,300 files reachable by `rg --files`,
8 logical cores, warm page cache), running the stripped-down control argv from
step 1 — the same flags in both rows, differing only in `--sort path`:

| argv                  | `real` (3 runs)     |
| --------------------- | ------------------- |
| with `--sort path`    | 0.15s, 0.13s, 0.13s |
| without `--sort path` | 0.06s, 0.06s, 0.06s |

≈2.2x on a small repository; the gap widens with tree size and core count. This
is a two-line deletion.

**The honest tradeoff**, which must be stated in the commit message: results are
capped at `search.maxResults` (default 200), and the cap is applied in _arrival_
order with no server-side ranking for content matches. With `--sort path`, a
query with more than 200 hits always returned the alphabetically-first 200. After
this change, _which_ 200 survive truncation becomes nondeterministic. This is
exactly what VS Code does, the UI already tells the user results were cut
(`apps/web/src/features/search/search-summary.tsx:218` renders "N shown, limit
reached"), and the alternative — buffering the whole result set to rank it —
would destroy result streaming, which is a much worse trade. See "Maintenance
notes" for why the structural alternative was rejected rather than overlooked.

## Current state

Files involved:

- `apps/server/src/fs/search.ts` — the only ripgrep argv builder in the repo
  (`contentSearchRgArgs`, line 716) and the only `rg` spawn site (line 670).
- `apps/server/src/fs/tests/search.test.ts` — three tests touch this: two assert
  the literal argv array, one asserts _result order_ and therefore depends on the
  flag's behavior.
- `apps/server/scripts/workspace-search-benchmark.ts` — the existing benchmark,
  drives the real `findInWorkspaceStream`, reports `avgDurationMs` per query.
  This is the measurement instrument for this plan.

### The flag, `apps/server/src/fs/search.ts:716-727`

```ts
export function contentSearchRgArgs(input: ContentSearchRgArgsInput) {
  const args = [
    '--json',
    '--follow',
    '--hidden',
    '--no-config',
    '--no-require-git',
    '--max-filesize',
    String(input.options.maxContentBytes),
    '--sort',
    'path',
  ]
```

It is unconditional — no option, setting, or caller can omit it.
`rgArgs` (`search.ts:707-714`) is the only caller inside the module, and
`contentSearchRgArgs` is exported only for the argv tests.

### The single spawn site, `apps/server/src/fs/search.ts:662-672`

```ts
async function* searchContentWithRg(
  paths: WorkspacePaths,
  context: FindContext,
  signal?: AbortSignal,
  contentIndexFilter?: ContentIndexFilter | null,
): AsyncGenerator<FindMatch> {
  const args = rgArgs(context, contentIndexFilter)

  for await (const line of runToolLines('rg', args, signal, [0, 1], [2], {
    cwd: context.root.absolutePath,
  })) {
```

### Truncation is arrival-order, `apps/server/src/fs/search.ts:251-261`

```ts
  const state: SearchState = { count: 0, truncated: false }

  for await (const match of matches) {
    if (state.count >= options.limit) {
      state.truncated = true
      break
    }

    state.count += 1
    yield { type: 'match', match }
  }
```

Note what is **not** here: content matches have no ranker. (Filename matches do —
`createNameCandidateRanker` / `nameRankCapacity`, `search.ts:148` and `:472` —
and this plan does not touch that path at all.) So today the "alphabetically
first N" behavior for content search comes _entirely_ from `--sort path`.

### The client discards the order anyway, `apps/web/src/features/search/search-buffer-state.tsx`

Line 1477 begins `appendSearchGroups`; its last statement (line 1500) is:

```ts
return sortedSearchGroups(Array.from(groupsByPath.values()))
```

and line 1556-1558:

```ts
function sortedSearchGroups(groups: WorkspaceSearchFileGroup[]) {
  return groups.sort((a, b) => compareSearchPaths(a.pathLabel, b.pathLabel))
}
```

Every streamed batch re-sorts the entire visible group list by path. Matches
_within_ a file group are concatenated in arrival order
(`appendedSearchFileGroup`, line 1519-1530) — that stays correct, because
ripgrep never interleaves one file's output with another's, and emits a file's
matches in line order whether or not `--sort` is set.

### The limit, `packages/contracts/src/settings/keys.ts:244-253`

```ts
  'search.maxResults': defineSetting({
    schema: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)),
    default: 200,
```

### The three affected tests

`apps/server/src/fs/tests/search.test.ts:315-363` — literal argv assertion
(literal/fixed-strings mode). The relevant fragment of the expected array:

```ts
    expect(args).toEqual([
      '--json',
      '--follow',
      '--hidden',
      '--no-config',
      '--no-require-git',
      '--max-filesize',
      '12345',
      '--sort',
      'path',
      '--fixed-strings',
```

`apps/server/src/fs/tests/search.test.ts:397-431` — literal argv assertion (regex
mode). The relevant fragment:

```ts
    expect(args).toEqual([
      '--json',
      '--follow',
      '--hidden',
      '--no-config',
      '--no-require-git',
      '--max-filesize',
      '1000000',
      '--sort',
      'path',
      '--crlf',
```

`apps/server/src/fs/tests/search.test.ts:1068-1089` — **this one asserts result
order and will become flaky, not merely wrong, if it is left alone**:

```ts
it('ranks content matches by path before applying the result limit', async () => {
  const root = await fixtureRoot()
  await mkdir(path.join(root, 'src'), { recursive: true })
  await writeFile(path.join(root, 'src', 'z.ts'), 'needle')
  await writeFile(path.join(root, 'src', 'a.ts'), 'needle')

  const result = await findInWorkspace(createWorkspacePaths(root), {
    includeContent: true,
    includeNames: false,
    limit: 1,
    maxContentBytes: 1_000_000,
    path: '',
    query: 'needle',
  })

  expect(result.matches).toEqual([
    expect.objectContaining({
      kind: 'content',
      path: 'src/a.ts',
    }),
  ])
})
```

> **Why this one is easy to miss.** Grepping for `--sort` does _not_ find it:
> the test asserts the _effect_ of the flag without naming it. If you find other
> order-sensitive content-search assertions beyond the three listed here, that is
> a STOP condition.

Every other content-search assertion in that file is either single-file (order
within one file is preserved regardless), uses `toContainEqual`, or covers
filename search, which uses `fd` plus the ranker and is untouched.

### The negative cases that must keep passing

These four tests prove the change did **not** break the orderings that are still
guaranteed. They are unmodified by this plan and are re-run explicitly in step 4:

- `emits exact content ranges for each match on a line` (`search.test.ts:82`) and
  `converts ripgrep utf-8 byte ranges to content columns` (`search.test.ts:104`)
  — multiple matches within one file, still in line order.
- `ranks filename matches before applying the result limit`
  (`search.test.ts:1091`) and `uses a deterministic path tie-breaker for equal
filename matches` (`search.test.ts:1169`) — filename search still ranks
  deterministically, because it never went through `rg`.

### Repo conventions that apply (quoted verbatim from `AGENTS.md` — you have not read it)

From "Optimization And Performance Work":

> - Measure before and after. An optimization without a benchmark or profile is
>   a guess.
> - State the structural alternative even when only asked for a quick
>   optimization. If a redesign would beat every local tweak, say so before
>   spending effort on tweaks.

From "Greenfield, No Backward Compatibility":

> - No backward compatibility shims, no legacy aliases, no deprecation windows.
>   Update every call site in the same pass.

From "Naming And Refactors":

> - Delete obsolete tests instead of preserving old behavior.

From "Dev Server":

> - A dev server is always running. Never spin up your own server to test or
>   verify changes — reuse the running one.

From "Control Flow" (applies to the test helper you will write in step 4):

> - Use guard clauses and early returns. Keep the happy path shallow.
> - In loops, use inverted conditions with `continue` instead of wrapping the
>   body in `if`.

## Commands you will need

Run all of these from the repository root, `/Users/shaul/Desktop/D/platform`.

| Purpose               | Command                                                              | Expected on success                                          |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| Benchmark             | `bun apps/server/scripts/workspace-search-benchmark.ts <flags>`      | exit 0, one JSON object on stdout, nothing else              |
| Targeted server tests | `cd apps/server && bun --bun vitest run src/fs/tests/search.test.ts` | exit 0, all tests pass                                       |
| Full server tests     | `cd apps/server && bun --bun vitest run`                             | exit 0, all tests pass                                       |
| Server typecheck      | `cd apps/server && bun run typecheck`                                | exit 0; prints only the `$ tsgo --noEmit` echo line          |
| Server lint           | `cd apps/server && bun run lint`                                     | exit 0; prints only the `$ oxlint .` echo line (no findings) |
| Server format check   | `cd apps/server && bun run format:check`                             | exit 0, "All matched files use the correct format."          |
| ripgrep availability  | `rg --version`                                                       | prints a version (this plan verified 15.1.0)                 |

`typecheck`, `lint` and `format:check` were confirmed green at `ace313f`
**before** any edit, so a failure in those three is caused by your change, not
inherited. The full Vitest suite was _not_ pre-verified — if a test outside
`src/fs/tests/search.test.ts` fails, check whether it fails on a stashed tree
before assuming you caused it.

`apps/server/vitest.config.ts` is a flat config with no `projects`, so there is
no `--project` flag to pass here — `bun --bun vitest run <file>` is the whole
invocation. The `--bun` flag is mandatory (`bun:sqlite` and `Bun.spawn` do not
resolve without it).

> **Known, pre-existing side effect — do not investigate.** Running the _full_
> `apps/server` Vitest suite opens and migrates the developer's real
> `~/.platform/fs-metadata.sqlite`. That is a separate documented defect owned by
> `plans/013-test-baseline-repairs.md`. It is not caused by this change. Prefer
> the targeted command while iterating.

## Scope

**In scope** (the only files you may modify):

- `apps/server/src/fs/search.ts` — delete two array elements.
- `apps/server/src/fs/tests/search.test.ts` — three test edits.
- `plans/README.md` — status row for plan 019 only.

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/features/search/**` — the client's `compareSearchPaths` sort is
  the reason this change is safe. Removing or "optimizing" it would make the
  results genuinely unordered on screen. Leave every file under it alone.
- `apps/server/src/fs/search.ts`'s filename-search ranker
  (`createNameCandidateRanker`, `addNameCandidate`, `nameRankCapacity`,
  `takeRankedNameMatch*`, roughly lines 470-660). Filename search goes through
  `fd`, never through `rg`; it has its own deterministic ranking and this plan
  does not change its behavior.
- The `contentExcludeGlobs` / `ContentIndexFilter` layer (`search.ts:167-203`,
  `751-753`, `CONTENT_INDEX_RG_EXCLUDE_GLOB_LIMIT`). A previous audit explicitly
  ranked deleting it as "a benchmark question, not a win" — it is recorded under
  "Findings considered and rejected" in `plans/README.md`. Do not touch it.
- `apps/server/scripts/workspace-search-benchmark.ts` — you are _using_ this
  instrument, not improving it. Changing it invalidates the before/after
  comparison you are running.
- `packages/contracts/src/settings/keys.ts` — do not add a setting to make the
  sort configurable. A registry key that nothing needs is explicitly unwanted
  ("A key is never registered inert").
- `.claude/worktrees/settings-page-architecture-5e0a30/**` — a stale git
  worktree containing its own copy of `search.ts` with the same lines. It is not
  part of the build. Do not edit it; `git status` must not show it.
- Any change to the `search.maxResults` default, or to the arrival-order
  truncation in `searchWorkspaceWithDiskTools`. Making truncation deterministic
  again is the rejected alternative, not a follow-on task.
- `apps/server/src/fs/search-fallback.ts` — the non-`rg` branch reached when
  ripgrep is missing (`searchWithFallback`, called at `search.ts:333`). It has
  always produced directory-walk order, never `--sort path` order, so it needs no
  change. `plans/033-search-fallback-abort-and-stream.md` owns that file; editing
  it here will collide.
- `apps/server/src/fs/tests/search-routes.test.ts` and
  `apps/server/src/tests/app.test.ts` — run them, do not edit them. If either
  starts failing, that is a STOP condition, not something to patch.
- `packages/contracts/src/**` search types. Nothing in the wire contract encodes
  an ordering guarantee, so nothing there needs to change. Do not add a comment,
  a field, or a doc line about ordering.
- `apps/server/src/fs/workspace-index.ts` — the index feeds `rg`'s exclude globs
  but has nothing to do with sorting. Untouched.

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks.

If the operator does ask for a commit: conventional commits, lowercase
descriptive subject. Real examples from `git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

A fitting subject here:

```
perf(search): let ripgrep keep its threads; the client already owns the order
```

The commit body must state the truncation tradeoff and carry the
before/after numbers from steps 1 and 5.

## Steps

### Step 1: Capture the BEFORE baseline (do this before editing anything)

Four things must be captured _before_ any edit: a working-tree snapshot, the
search-root size, the benchmark JSON, and a direct `rg` timing. Write them all
outside the repository (under `/tmp/`); do not create files inside the repo.

First, snapshot the working tree, because **the repository is expected to be
dirty when you start** — at `ace313f` it carried dozens of modified and untracked
paths (unrelated work in progress, plus the other plan files in `plans/`). You
cannot verify "only my files changed" without a baseline:

```
git status --porcelain > /tmp/plan-019-git-before.txt
wc -l < /tmp/plan-019-git-before.txt
```

Do not try to clean, stash, or commit those pre-existing changes.

Second, record how big the search root is, so the numbers are interpretable:

```
rg --files --hidden --no-config --no-require-git --follow 2>/dev/null | wc -l
```

> If this prints **fewer than 2,000**, the root is too small for the benchmark to
> resolve the difference reliably. Re-run everything in this plan's steps 1 and 5
> against a larger checkout by passing `--root /absolute/path/to/large/repo` to
> the benchmark, and say in your final report which root you used. If you have no
> larger checkout available, proceed with the repo root but flag in your report
> that the measurement is weak.

Third, the primary instrument — the real search pipeline:

```
bun apps/server/scripts/workspace-search-benchmark.ts \
  --content-only \
  --iterations 5 \
  --query zzq-no-such-token-xyzzy \
  --query function \
  > /tmp/plan-019-before.json
```

Why these two queries: `zzq-no-such-token-xyzzy` is effectively a no-match query,
so ripgrep must walk the whole tree — that is where thread parallelism shows up
most clearly. (Expect exactly **one** hit: this plan file contains the token.
That is harmless — one match against a limit of 50 does not stop the walk. Do not
"fix" it by renaming the token; using the same token before and after is what
matters.) `function` matches far more than the 50-result default limit, so it
measures time-to-first-N, which is what a user actually feels. `--content-only`
disables filename search so the number is about `rg` and nothing else. Do **not**
pass `--disk-only`: the workspace index supplies rg's exclude globs in
production, and the benchmark builds it outside the timed region.

The script writes one JSON object to stdout and nothing else, so the redirect
above produces a parseable file.

Fourth, the isolating control — a stripped-down `rg` invocation timed directly,
which removes all JavaScript overhead from the picture:

```
for i in 1 2 3; do
  /usr/bin/time -p rg --json --follow --hidden --no-config --no-require-git \
    --max-filesize 1000000 --sort path --fixed-strings --ignore-case \
    --regexp 'zzq-no-such-token-xyzzy' . > /dev/null
done
```

This is **not** the production argv — the real builder also appends dozens of
`--glob !…` ignore patterns and the workspace-index exclude globs
(`search.ts:740-756`). It is a controlled A/B: the only difference between this
run and the one in step 5 is `--sort path`, which is exactly the variable under
test. Do not "improve" it to match production; that would break the comparison.

**Verify**:

```
bun -e 'const r = await Bun.file("/tmp/plan-019-before.json").json();
  for (const s of r.summary) console.log(s.query, s.avgDurationMs, s.providerSources.join(","))'
```

→ two lines, each with a numeric second column and `rg` in the third. If
`providerSources` does **not** contain `rg`, ripgrep was not used and the
measurement is meaningless — that is a STOP condition.

The `rg` loop must have printed three `real` times. Write all five numbers down —
you will quote them in your final report.

### Step 2: Delete the flag

In `apps/server/src/fs/search.ts`, in `contentSearchRgArgs` (line 716), delete
the two array elements `'--sort',` and `'path',`. The array becomes:

```ts
export function contentSearchRgArgs(input: ContentSearchRgArgsInput) {
  const args = [
    '--json',
    '--follow',
    '--hidden',
    '--no-config',
    '--no-require-git',
    '--max-filesize',
    String(input.options.maxContentBytes),
  ]
```

Change nothing else in the function or the file. Do not add a comment explaining
the removal — the commit message carries that.

**Verify**:

```
grep -n -- "--sort" apps/server/src/fs/search.ts
```

→ no matches (exit code 1, no output).

Note the scope: check **only `search.ts` here**. A repo-wide
`grep -rn -- "--sort" apps/server/src/` still returns two hits at this point —
the test file's expected arrays, which step 3 removes. Do not chase them now, and
do not jump ahead.

```
cd apps/server && bun run typecheck
```

→ exit 0. (Deleting two string literals cannot break types; this is a cheap
canary that you edited the file you meant to.)

### Step 3: Update the two literal-argv assertions

In `apps/server/src/fs/tests/search.test.ts`, delete the `'--sort',` and
`'path',` lines from both expected arrays:

- in the test at line 315 (`builds stable literal ripgrep args with config
disabled and expanded globs`), currently lines 343-344 — the array must go
  straight from `'12345',` to `'--fixed-strings',`.
- in the test at line 397 (`builds regex ripgrep args with CRLF anchors and
automatic regex engine`), currently lines 421-422 — the array must go straight
  from `'1000000',` to `'--crlf',`.

Do not change anything else in either test.

> **Line numbers shift as you edit.** Every line number in steps 3 and 4 is
> measured against the file at `ace313f`, before any edit. After you delete lines
> 343-344, everything below moves up by two. Anchor your edits on the quoted
> strings and test titles, not on the numbers — the numbers are there to tell you
> whether you are looking at the right place, not to drive a line-based edit.

**Verify**:

```
grep -rn -- "--sort" apps/server/src/
```

→ no matches at all now (exit code 1, no output).

```
cd apps/server && bun --bun vitest run src/fs/tests/search.test.ts -t "ripgrep args"
```

→ exit 0, exactly 2 tests pass, 0 fail. (The `-t` substring matches only the two
titles above; `caps index-derived ripgrep exclude globs` does not contain
"ripgrep args" and is not selected — that test builds no literal argv array and
needs no edit.)

### Step 4: Replace the order-dependent truncation test

The test at `apps/server/src/fs/tests/search.test.ts:1068` asserts the exact
behavior this plan removes. Per `AGENTS.md` ("Delete obsolete tests instead of
preserving old behavior") the old assertion goes. Replace it — do not simply
delete it — so the truncation path keeps a regression gate, only stated as a set
rather than a sequence.

Replace the whole `it(...)` block — from `it('ranks content matches by path` down
to its closing `})`, lines 1068-1089 at `ace313f`, now four lines higher after
step 3 — with:

```ts
it('truncates content matches at the result limit without promising path order', async () => {
  const root = await fixtureRoot()
  await mkdir(path.join(root, 'src'), { recursive: true })
  await writeFile(path.join(root, 'src', 'z.ts'), 'needle')
  await writeFile(path.join(root, 'src', 'a.ts'), 'needle')

  const events = await collectEvents(
    findInWorkspaceStream(createWorkspacePaths(root), {
      includeContent: true,
      includeNames: false,
      limit: 1,
      maxContentBytes: 1_000_000,
      path: '',
      query: 'needle',
    }),
  )
  const contentPaths = events.flatMap((event) => {
    if (event.type !== 'match') return []
    if (event.match.kind !== 'content') return []

    return [event.match.path]
  })

  expect(contentPaths).toHaveLength(1)
  expect(['src/a.ts', 'src/z.ts']).toContain(contentPaths[0])
  expect(doneEvent(events)).toMatchObject({ count: 1, truncated: true })
})
```

Structural model: the test at `search.test.ts:997-1035` (`uses ready workspace
index metadata to skip image-like content candidates`) — same `collectEvents` +
`flatMap` guard-clause extraction, same `doneEvent` helper. All three helpers
(`fixtureRoot` line 1279, `collectEvents` line 1293, `doneEvent` line 1300) and
both imports (`findInWorkspaceStream`, `createWorkspacePaths`) already exist in
this file; add no imports.

**Verify**:

```
cd apps/server && bun --bun vitest run src/fs/tests/search.test.ts
```

→ exit 0, all tests pass, 0 fail, 0 skipped.

Then run it four more times in a row and confirm it passes every time — the
point of this test is that it must not be order-sensitive:

```
cd apps/server && for i in 1 2 3 4; do bun --bun vitest run src/fs/tests/search.test.ts || echo "FAILED on run $i"; done
```

→ no `FAILED on run` line.

**Verify the negative** — the orderings that are still guaranteed must still be
guaranteed. Run the four unmodified tests named in "The negative cases that must
keep passing":

```
cd apps/server && bun --bun vitest run src/fs/tests/search.test.ts \
  -t "exact content ranges" \
  && bun --bun vitest run src/fs/tests/search.test.ts -t "utf-8 byte ranges" \
  && bun --bun vitest run src/fs/tests/search.test.ts -t "ranks filename matches" \
  && bun --bun vitest run src/fs/tests/search.test.ts -t "deterministic path tie-breaker"
```

→ exit 0 each time, 1 test passing each time. If `ranks filename matches before
applying the result limit` or `uses a deterministic path tie-breaker for equal
filename matches` fails, you changed something on the `fd` path that this plan
does not touch — revert and STOP.

### Step 5: Capture the AFTER measurement and compare

Re-run **exactly** the commands from step 1 — same root, same queries, same
iteration count — into a new file:

```
bun apps/server/scripts/workspace-search-benchmark.ts \
  --content-only \
  --iterations 5 \
  --query zzq-no-such-token-xyzzy \
  --query function \
  > /tmp/plan-019-after.json
```

and the isolating control without the flag:

```
for i in 1 2 3; do
  /usr/bin/time -p rg --json --follow --hidden --no-config --no-require-git \
    --max-filesize 1000000 --fixed-strings --ignore-case \
    --regexp 'zzq-no-such-token-xyzzy' . > /dev/null
done
```

**Verify** that `avgDurationMs` for the `zzq-no-such-token-xyzzy` query is
**strictly lower** after than before:

```
bun -e 'const b = await Bun.file("/tmp/plan-019-before.json").json();
  const a = await Bun.file("/tmp/plan-019-after.json").json();
  const pick = (r, q) => r.summary.find((s) => s.query === q).avgDurationMs;
  for (const q of ["zzq-no-such-token-xyzzy", "function"]) {
    const before = pick(b, q); const after = pick(a, q);
    console.log(q, "before", before, "after", after, after < before ? "FASTER" : "NOT FASTER");
  }'
```

→ the `zzq-no-such-token-xyzzy` line must end in `FASTER`. The `function` line is
recorded for the report but is not a gate: it is limit-bound and dominated by
JavaScript stream overhead, so it can legitimately move either way.

On this repo at `ace313f` the direct `rg` control
went from ~0.13s to ~0.06s; expect the benchmark's end-to-end delta to be
smaller, because it includes JavaScript stream and stat overhead the flag never
affected.

If the after number is **not lower**, that is a STOP condition — see below.

Record both `avgDurationMs` values and both sets of `real` times. They go in your
final report and, if the operator asks for a commit, in the commit body.

### Step 6: Confirm the search pane still behaves in the real app

This step needs a browser you can drive (Playwright/Chrome tooling, or a human at
the keyboard). **If you have no way to open a browser, skip this step, say so
explicitly in your final report, and continue to step 7** — it is not in the Done
criteria, and steps 4 and 7 are the real gates.

A dev server is already running at http://localhost:5173 — do **not** start one.
Confirm it is up first:

```
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173
```

→ `200`. If it is not up, skip this step and report; do not start a server.

Open it, open the workspace search pane, and run a query with many hits (e.g.
`function`).

**Verify**, by observation:

- Results are grouped by file and the group list reads in path order once the
  search settles. (The client's sort produces this; if it does not, the client
  sort is broken and that is a STOP condition, because this change relies on it.)
- Within a file group, match lines are in ascending line order.
- For a query that exceeds the limit, the summary reads "N shown, limit reached".

**Expected and correct**, not a bug: while results stream in, new file groups now
appear _inserted_ into the list rather than only appended at the bottom. That is
the visible consequence of parallel walking, and the client re-sorts each batch
to absorb it.

### Step 7: Full verification

```
cd apps/server && bun run typecheck && bun run lint && bun run format:check
```

→ all exit 0.

```
cd apps/server && bun --bun vitest run
```

→ exit 0, all tests pass. (See the `fs-metadata.sqlite` note under "Commands you
will need" — a WAL file appearing under `~/.platform/` is pre-existing behavior,
not something this change caused.)

Now confirm you changed only your own files. The tree was already dirty when you
started, so compare against the step 1 baseline rather than expecting a clean
`git status`:

```
diff <(sort /tmp/plan-019-git-before.txt) <(git status --porcelain | sort)
```

→ every `>` line names one of exactly three paths —
`apps/server/src/fs/search.ts`, `apps/server/src/fs/tests/search.test.ts`,
`plans/README.md` — and there are no `<` lines. Fewer than three `>` lines is
fine: a path that was _already_ dirty in the baseline keeps the same porcelain
line and so produces no diff. A `>` line naming any other path means you edited
something out of scope — with one exception: other `plans/NNN-*.md` files may
appear if another agent is writing plans alongside you. Those are not yours;
ignore them and say so in your report. A `<` line means a pre-existing change
disappeared — you reverted somebody else's work; STOP and report.

(If `search.ts` or `search.test.ts` already appeared in the baseline, the drift
check at the top of this plan should have caught it. Go back and run it.)

Then update the status row for plan 019 in `plans/README.md` from `TODO` to
`DONE`. The row currently reads:

```
| 019 | [Delete `--sort path` from the ripgrep invocation](019-ripgrep-sort-path-removal.md) | P2 | S | — | TODO |
```

## Test plan

**No new test files, and no net-new test cases.** This change is
behavior-preserving for everything the user sees (the client owns the ordering)
and behavior-changing for exactly one thing (which matches survive truncation),
which is precisely the assertion being rewritten in step 4. The existing
`apps/server/src/fs/tests/search.test.ts` suite — 44 `it(` cases, 27 of which
pass `includeContent: true` — is the gate.

Edits, all in `apps/server/src/fs/tests/search.test.ts`:

1. `builds stable literal ripgrep args with config disabled and expanded globs`
   (line 315) — drop two elements from the expected argv.
2. `builds regex ripgrep args with CRLF anchors and automatic regex engine`
   (line 397) — drop two elements from the expected argv.
3. `ranks content matches by path before applying the result limit` (line 1068) →
   `truncates content matches at the result limit without promising path order`.
   Covers: the limit still truncates at exactly `limit` matches; the surviving
   match is one of the candidates rather than a specific one; `done` still
   reports `{ count: 1, truncated: true }`. Modelled on `search.test.ts:997`.

Cases deliberately **not** added:

- A "results are parallel now" test. Thread count is not observable through the
  search API, and asserting on timing would be flaky.
- A within-file ordering test. `emits exact content ranges for each match on a
line` (line 82) and `converts ripgrep utf-8 byte ranges to content columns`
  (line 104) already assert multi-match-per-file ordering, and they pass
  unchanged because ripgrep never interleaves one file's output with another's.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn -- "--sort" apps/server/src/` returns no matches
- [ ] `cd apps/server && bun run typecheck` exits 0
- [ ] `cd apps/server && bun run lint` exits 0
- [ ] `cd apps/server && bun run format:check` exits 0
- [ ] `cd apps/server && bun --bun vitest run` exits 0, all tests pass
- [ ] `src/fs/tests/search.test.ts` passes 5 consecutive runs (step 4)
- [ ] The four negative-case tests in step 4 pass unmodified
- [ ] `grep -c "ranks content matches by path" apps/server/src/fs/tests/search.test.ts`
      prints `0` (note: `grep -c` exits **1** when the count is 0 — the printed
      `0` is the pass signal here, not the exit code)
- [ ] `/tmp/plan-019-before.json` and `/tmp/plan-019-after.json` both exist, and
      the step 5 comparison prints `FASTER` for `zzq-no-such-token-xyzzy`
- [ ] The step 7 `diff` against `/tmp/plan-019-git-before.txt` shows only the
      three in-scope paths added and nothing removed
- [ ] `plans/README.md` row 019 says DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `search.ts` or `search.test.ts` changed since `ace313f`
  and the excerpts in "Current state" no longer match the live code.
- `rg --version` fails, **or** the benchmark's `summary[].providerSources` does
  not contain `"rg"`. Ripgrep is a hard prerequisite; without it the search path
  silently takes the `searchWithFallback` branch (called at `search.ts:333`) and
  none of your measurements mean anything. A green benchmark that never ran `rg`
  is the worst possible outcome, because it looks like success.
- **The AFTER benchmark is not faster than BEFORE.** Do not "fix" this by
  re-running until you get a favorable number, and do not tune the benchmark.
  Report both JSON files and the searched-file count. The likely explanations, in
  order: the root is too small (under ~2,000 files), the machine is under load,
  or the run hit a cold page cache. The change is still correct — but the plan's
  premise is that it is measurably faster, and a null result is information the
  operator needs.
- You find a content-search assertion that depends on cross-file result order
  beyond the three tests listed in "Current state" — for example a test in
  `apps/server/src/fs/tests/search-routes.test.ts` or
  `apps/web/src/features/search/tests/` that starts failing intermittently.
  Report the file and line rather than patching it.
- `src/fs/tests/search.test.ts` passes sometimes and fails sometimes. Flakiness
  after this change means something still depends on rg's ordering; find and name
  it, do not add a retry or a sort to make it pass.
- The search pane at :5173 shows file groups in a visibly random order after the
  search settles. That means the client-side sort at
  `search-buffer-state.tsx:1556` is not doing its job, which invalidates the
  whole premise — revert step 2 and report.
- You find yourself wanting to edit anything under `apps/web/` to make this work.
  Nothing on the client should need to change.
- The step 7 `diff` shows a `<` line, i.e. one of the pre-existing working-tree
  changes vanished. You reverted unrelated work in progress. Do not try to restore
  it yourself — report exactly which paths disappeared.

## Maintenance notes

- **The structural alternative, considered and rejected.** Determinism could be
  restored _and_ parallelism kept by giving content matches the same bounded
  ranker filename matches already have (`createNameCandidateRanker`,
  `search.ts:516-522`, and `addNameCandidate`, `search.ts:532-579`): buffer
  `limit × k` candidates, sort, then emit. It is rejected because content search
  is a _streaming_ surface — the pane paints
  matches as they arrive, and `measurement.firstResultMs` is a tracked metric.
  Ranking before emitting means the first result cannot appear until the walk
  finishes. Determinism of truncation is worth less than time-to-first-result, so
  the deliberate choice here is: parallel walk, arrival-order truncation, client
  owns display order. That is VS Code's choice too. If someone later wants
  deterministic truncation back, they must pay for it with buffering, and they
  should reopen this note rather than re-adding `--sort`.
- **What a reviewer should scrutinize**: exactly one thing — that no _other_
  consumer of the search stream depended on server-side path order. This plan
  checked `apps/server/src/fs/tests/search-routes.test.ts`,
  `apps/server/src/tests/app.test.ts`, and
  `apps/web/src/features/search/tests/**` and found none. New consumers of
  `findInWorkspaceStream` must not assume ordering.
- **What will interact with this later**: `plans/033-search-fallback-abort-and-stream.md`
  touches `searchWithFallback`, the non-rg branch of the same generator. That
  branch has always produced directory-walk order and is unaffected here, but the
  two plans edit neighboring code in `search.ts` — land them one at a time.
- **Deliberately deferred**: the `ContentIndexFilter` exclude-glob layer in the
  same file. `plans/README.md` records it as "a benchmark question, not a win" —
  deleting the globs trades a per-query index scan for a per-file open-and-read
  on every known-binary file. If someone wants to revisit it, the benchmark
  invocation in step 1 of this plan is the right instrument, and
  `--disk-only` is the A/B switch.
- **Deliberately not done**: making the sort configurable via the settings
  registry. No user has asked for deterministic truncation, and `AGENTS.md` is
  explicit that a knob nothing consumes is worse than no knob.
