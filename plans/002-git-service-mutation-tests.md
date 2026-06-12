# Plan 002: Add characterization tests for the untested GitService mutation paths

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f88800a..HEAD -- apps/server/src/git apps/server/src/tests/app.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (test-only change; no production code may be modified)
- **Depends on**: none (001 recommended first so CI runs these tests)
- **Category**: tests
- **Planned at**: commit `f88800a`, 2026-06-12

## Why this matters

`apps/server/src/git/service.ts` is 912 lines of git operation logic and one of
the highest-churn server modules, but the only coverage it has is the `git rpc`
suite inside `apps/server/src/tests/app.test.ts`, which exercises **read** paths
(status, diff, staged diff, blob diff, large/binary handling) plus `stage`. The
mutation paths — `commit`, `checkout`, `createBranch`, `unstage`, `discard`,
`applyPatch`, and the ref lifecycle (`hasRef`/`restoreRef`/`deleteRefs`) — have
zero tests. `discard` and `restoreRef` are destructive (they throw away user
work when wrong), and `checkout`/`commit` corrupt user expectations silently if
they regress. This plan pins down current behavior so future refactors (the
repo has an active 12-week architecture roadmap in `PLAN.md`) can't silently
break them.

## Current state

- `apps/server/src/git/service.ts:55` — `export class GitService {` with methods (line numbers at planning time):
  - covered today: `status` (72), `diff` (94), `diffBlob` (123), `stage` (221)
  - **uncovered**: `repo` (66), `diffRefs` (143), `hasRef` (166), `restoreRef` (173), `deleteRefs` (198), `file` (211), `unstage` (230), `discard` (244), `applyPatch` (266), `commit` (281), `branches` (297), `checkout` (312), `createBranch` (319), `fetch` (334), `pull` (341), `push` (348)
- `apps/server/src/git/routes.ts:19-66` — Elysia routes mapping 1:1 onto the service: GET `/repo`, `/status`, `/diff/blob`, `/diff`, `/file`, `/branches`; POST `/stage`, `/unstage`, `/discard`, `/apply-patch`, `/commit`, `/checkout`, `/create-branch`, `/fetch`, `/pull`, `/push`.
- The exemplar to copy, `apps/server/src/tests/app.test.ts`:
  - imports: `import { afterEach, describe, expect, it } from 'vitest'` and `import { closeApp, createApp } from '../app'` (note: server tests import from `vitest` directly — the AGENTS.md rule about `apps/web/test/fixtures.ts` applies to web tests, not server tests; match `app.test.ts`).
  - builds the app over a temp dir, tracks created apps/roots in arrays, and cleans up in `afterEach` with `closeApp(app)` and `rm(root, { recursive: true, force: true })`.
  - every request needs the trusted origin header: `const TRUSTED_ORIGIN = 'http://localhost:5173'`, requests made as `app.handle(new Request('http://local/git/status', { headers: { origin: TRUSTED_ORIGIN } }))`.
  - real git repos are built with a helper around `Bun.spawn(['git', '-C', root].concat(args), …)` (see `app.test.ts:1020`). Reuse that pattern (re-create the helper locally in the new file; do not import private helpers from `app.test.ts`).
  - the existing `describe('git rpc', …)` block starts at `app.test.ts:609` — read it fully before writing anything; your new tests must match its style (request construction, JSON assertions, fixture setup).
- Server test conventions (from `AGENTS.md`): tests run on Vitest under `bun --bun`; drive the real in-process Elysia server; never mock our own modules; build real state (real `git init`, real files).
- Module test layout convention: every other server module keeps tests in a module-local `tests/` dir (`src/fs/tests/`, `src/lsp/tests/`, `src/terminal/tests/`, …). `src/git/` has none — you will create `src/git/tests/`.

## Commands you will need

| Purpose           | Command (from `apps/server/`)         | Expected on success |
| ----------------- | ------------------------------------- | ------------------- |
| Run new tests     | `bun --bun vitest run src/git/tests/` | all pass            |
| Full server tests | `bun --bun vitest run`                | all pass            |
| Typecheck         | `bun run typecheck`                   | exit 0              |
| Lint              | `bun run lint`                        | exit 0              |

The `--bun` flag is required (Bun APIs like `Bun.spawn` don't resolve without it).

## Scope

**In scope** (the only files you should create/modify):

- `apps/server/src/git/tests/service.test.ts` (create)
- Optionally split into `apps/server/src/git/tests/refs.test.ts` if the file passes ~500 lines.

**Out of scope** (do NOT touch):

- Any file under `apps/server/src/git/` other than the new `tests/` dir — this is a characterization plan; if a test reveals a bug, the test documents current behavior and the bug goes in your report, NOT in a code fix.
- `apps/server/src/tests/app.test.ts` — leave the existing route coverage where it is; do not move or dedupe it.
- `fetch`, `pull`, `push` against any real network remote. If you cover them at all, use a local bare repo (`git init --bare` + `file://` remote); if that turns out flaky, skip them with a comment and note it in the report.

## Git workflow

- Branch: `advisor/002-git-service-mutation-tests`
- Commit style: conventional commits, e.g. `test(server): add git service mutation tests` (matches `test(tiling): add sourceWindowRectForDrag tests` from `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read the exemplar and scaffold the fixture

Read `apps/server/src/tests/app.test.ts` in full, especially the `git rpc` block (line 609+) and the git spawn helper (line ~1020). Create `apps/server/src/git/tests/service.test.ts` with: the same imports, the apps/roots cleanup arrays + `afterEach`, the `TRUSTED_ORIGIN` constant, a local `runGit(root, args)` helper using `Bun.spawn`, and a `fixtureRepo()` helper that creates a temp dir (`mkdtemp` under `tmpdir()`), runs `git init`, sets `user.email`/`user.name` via `git config` (commits fail in CI without identity — configure it per-repo, not globally), writes an initial file, and makes an initial commit.

**Verify**: a trivial first test (GET `/git/status` on the fixture returns 200) passes: `cd apps/server && bun --bun vitest run src/git/tests/` → 1 passed.

### Step 2: Branch lifecycle tests

Through the HTTP routes, cover:

1. `GET /git/branches` — returns the initial branch and marks it current.
2. `POST /git/create-branch` — new branch appears in `branches`; assert whether the service switches to it or stays (characterize, don't assume).
3. `POST /git/checkout` — switch to the new branch; `branches` reflects the new current branch.
4. `POST /git/checkout` with uncommitted conflicting changes — characterize the response (error shape and status code, or success if git allows it). Assert exactly what happens today.

**Verify**: `bun --bun vitest run src/git/tests/` → all pass.

### Step 3: Commit, unstage, discard

1. `POST /git/commit` after staging a change — status becomes clean; `git log` (via `runGit`) shows the message.
2. `POST /git/commit` with nothing staged — characterize the error response.
3. `POST /git/unstage` — staged file returns to unstaged in `/git/status`.
4. `POST /git/discard` on a modified tracked file — file content on disk reverts (assert with `readFile`).
5. `POST /git/discard` on an untracked file — characterize (deleted? error? no-op?).

**Verify**: `bun --bun vitest run src/git/tests/` → all pass.

### Step 4: Patches, file-at-ref, refs

1. `POST /git/apply-patch` with a valid patch (generate it with `runGit(root, ['diff'])` after editing a file, then reset the worktree, then apply) — file content matches.
2. `POST /git/apply-patch` with a corrupted patch body — characterize the error response.
3. `GET /git/file?path=…&ref=…` — returns committed content at `HEAD` even when the worktree differs.
4. `hasRef`/`restoreRef`/`deleteRefs`: exercise through whatever routes expose them; if no route exposes them (check `routes.ts` — at planning time none do), instantiate `GitService` directly (import from `../service`, construct with the same `WorkspacePaths` shape used in `apps/server/src/git/service.ts:60` — read the constructor and its callers in `apps/server/src/app.ts` to build it correctly) and test at the service level. Cover: create a ref via `runGit`, `hasRef` true/false, `restoreRef` restores worktree state, `deleteRefs` removes them.

**Verify**: `bun --bun vitest run src/git/tests/` → all pass.

### Step 5: Full-suite regression check

**Verify**: from `apps/server/`: `bun --bun vitest run` → all pass (including the pre-existing `app.test.ts`), and `bun run typecheck && bun run lint` → exit 0.

## Test plan

This plan _is_ the test plan. Target: ≥15 new test cases across steps 2–4, every one driving real git repos in temp dirs through the real Elysia app (`app.handle`), modeled structurally on `apps/server/src/tests/app.test.ts`. Characterization means: when current behavior surprises you, assert the current behavior and flag it in your report.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `apps/server/src/git/tests/` exists with ≥15 passing tests
- [ ] Tests cover at minimum: `branches`, `createBranch`, `checkout` (happy + conflict), `commit` (happy + empty), `unstage`, `discard` (tracked + untracked), `applyPatch` (valid + invalid), `file` at ref
- [ ] `cd apps/server && bun --bun vitest run` exits 0
- [ ] `cd apps/server && bun run typecheck` exits 0
- [ ] `git status` shows no modified files outside `apps/server/src/git/tests/`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `GitService`'s constructor or route shapes don't match the "Current state" listing (drift).
- A test reveals behavior that loses data (e.g. `discard` deleting more than asked, `checkout` clobbering dirty files without error). Write the test asserting today's behavior, then STOP and report the bug prominently — do not fix service code.
- You need to modify any production file to make tests pass.
- Tests are flaky under `bun --bun` due to git process spawning (cold-spawn timeouts) — raise `testTimeout` for this file only (AGENTS.md sanctions this); if still flaky, STOP and report.

## Maintenance notes

- These are characterization tests: when the `PLAN.md` roadmap (or any refactor) intentionally changes git behavior, the tests should be _updated deliberately_ — a failure here means "behavior changed", which is exactly the signal they exist to give.
- Reviewer should scrutinize: per-repo git identity config (no global config leakage), temp-dir cleanup in `afterEach`, and that no test depends on the host machine's git config or default branch name (pass `-b main` to `git init` or assert against the actual initial branch).
- Deferred: `fetch`/`pull`/`push` coverage via local bare remotes (do it later if step 2–4 pattern proves stable), and `repo`/`diffRefs` coverage.
