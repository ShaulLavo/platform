# Plan 013: Repair the verification baseline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat ace313f..HEAD -- apps/server/src/db apps/server/src/fs/metadata.ts apps/server/src/app.ts package.json packages/ui/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none. **This plan gates everything risky.** Nothing in Phase 3
  of `plans/README.md` should start before it lands.
- **Category**: tests / dx
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

Three holes in the verification baseline, each of which means a green
`bun run verify` proves less than it appears to.

**1. The server test suite writes to the developer's real database.** Running
`cd apps/server && bun run test` opens, migrates, and WAL-locks
`~/.platform/fs-metadata.sqlite` — the actual file the running app uses. On this
machine that file is 233 KB with a 412 KB WAL, last written the day before this
plan. Tests are supposed to be hermetic; these are not. Two consequences: a test
run can corrupt or lock the developer's working state, and test results depend on
whatever that machine's database happens to contain. It is also why `/fs/recents`
has no server coverage — nobody wants to assert against a shared mutable file.

**2. `scripts/` is never typechecked.** It is 642 lines across 8 files that start
the dev server (`dev.ts`), build production artifacts (`prod.ts`), generate the
settings reference, and load env. It is not listed in the root `workspaces`
array, so `bun run typecheck` — which runs `bun run --sequential --filter '*'
typecheck` — never reaches it. Expect real errors on the first run; that is the
point.

**3. `packages/ui` has no `test` script.** The root `test` script is
`bun run --filter '*' test`, so the design-system package is silently skipped.
Root `verify` currently proves nothing whatsoever about the 34 primitives.

None of this is exotic. All three are the kind of gap that makes a later
refactor's "tests pass" claim meaningless, which is exactly why this plan is
first.

## Current state

### The two leak paths (both verified by reading)

`apps/server/src/db/client.ts:8` — a module-scope default pointing at the real
home directory:

```ts
const defaultMetadataDatabasePath = Bun.env.FS_METADATA_DB ?? platformHomePath('fs-metadata.sqlite')

export function createMetadataDatabase(
  options: { databasePath?: string } = {},
): MetadataDatabaseHandle {
  return openPlatformDatabase(options.databasePath ?? defaultMetadataDatabasePath)
}
```

`apps/server/src/db/client.ts:31` — the process-wide fallback:

```ts
export function getDefaultPlatformDatabase(): PlatformDatabase {
  defaultHandle ??= createMetadataDatabase()
  return defaultHandle.db
}
```

**Path A — orchestration.** `apps/server/src/app.ts:73`:

```ts
const database = options.orchestration?.database ?? getDefaultPlatformDatabase()
```

**Path B — filesystem metadata.** `apps/server/src/fs/service.ts:107`:

```ts
this.metadata = new FsMetadataStore({
  database: options.metadataDatabase,
  databasePath: options.metadataDatabasePath,
})
```

with both options undefined, reaching
`apps/server/src/fs/metadata.ts:33-45`:

```ts
  constructor(options: FsMetadataStoreOptions = {}) {
    if (options.database) {
      this.ownedHandle = null
      this.db = options.database.db
      this.databasePath = options.database.databasePath
    } else {
      this.ownedHandle = createMetadataDatabase({ databasePath: options.databasePath })
      this.db = this.ownedHandle.db
      this.databasePath = this.ownedHandle.databasePath
    }

    migrateMetadataDatabase(this.db)
  }
```

Note the last line: it **migrates** whatever it opened.

A representative offender — `apps/server/src/tests/app.test.ts:286` builds an app
with no database injected at all:

```ts
const app = createApp({
  auth: {
    allowedOrigins: [TRUSTED_ORIGIN],
  },
  homeDirectory: root,
  settings: testSettingsOptions(root),
  systemRoot: root,
})
```

Ten server test files call `createApp(`:
`tests/app.test.ts`, `fs/tests/search-routes.test.ts`,
`git/tests/{worktrees,service,commit-progress}.test.ts`,
`observability/tests/runtime.test.ts`,
`provider/tests/{auth-routes,command-routes}.test.ts`,
`orchestration/tests/engine.test.ts`.

### The pattern that is already correct

`apps/web/test/server.ts:22` — copy this:

```ts
export async function makeTestServer(): Promise<TestServer> {
  const root = await mkdtemp(path.join(tmpdir(), 'web-itest-'))
  const database = createMetadataDatabase({ databasePath: ':memory:' })
  const app = createApp({
    auth: { allowedOrigins: [TEST_ORIGIN] },
    metadataDatabase: database,
    orchestration: {
      database: database.db,
      providerAdapterRegistry: new ProviderAdapterRegistry([new MockProviderAdapter()]),
    },
    settings: testSettingsOptions(root),
    watch: false,
    workspaceRoot: root,
  })
```

The web tests have been hermetic all along. Only the server suite is not.

Also already correct: `apps/server/src/db/tests/migrations.test.ts:176` passes an
explicit `tempDatabasePath()`.

### Workspace configuration

Root `package.json`:

```json
  "workspaces": {
    "packages": ["apps/*", "packages/contracts", "packages/observability", "packages/tree", "packages/ui"],
```

`scripts/` is absent. Root scripts of interest:

```json
    "typecheck": "bun run --sequential --filter '*' typecheck",
    "test": "bun run test:scripts && bun run --filter '*' test",
    "test:scripts": "bun --bun vitest run scripts/runtime-network.test.ts --environment node",
    "verify": "bun run typecheck && bun run lint && bun run format:check && bun run test"
```

Note `test:scripts` already runs **one** script test — so `scripts/` is partly
wired for tests but not at all for typecheck.

`packages/ui/package.json` scripts — no `test`:

```json
{
  "lint": "oxlint .",
  "format": "oxfmt --write .",
  "format:check": "oxfmt --check .",
  "typecheck": "tsgo --noEmit"
}
```

### Conventions to honor

From `AGENTS.md`:

> - Apps run under Bun: `bun --bun vitest`. Runtime-neutral `packages/*` run
>   plain `vitest`.
> - Use these environments, in this order of preference: real browser,
>   happy-dom, never jsdom.
> - The `--bun` flag is required for app tests. Without it, `bun:sqlite`,
>   `Bun.spawn`, and other Bun APIs do not resolve.
> - Mock only the outside world and unspawnable processes.
> - Never throw `new Error`. Create errors with `createError` from `evlog` — in
>   practice through the feature's `structured-errors.ts` wrapper.

> ## Greenfield, No Backward Compatibility
>
> - No backward compatibility shims, no legacy aliases, no deprecation windows.

That last rule licenses Step 2: making the default _refuse_ rather than adding an
opt-in flag.

## Commands you will need

| Purpose          | Command                                  | Expected on success |
| ---------------- | ---------------------------------------- | ------------------- |
| Server tests     | `cd apps/server && bun run test`         | all pass            |
| Server typecheck | `cd apps/server && bun run typecheck`    | exit 0              |
| Web tests        | `cd apps/web && bun run test`            | all pass            |
| UI typecheck     | `cd packages/ui && bun run typecheck`    | exit 0              |
| Scripts test     | `bun run test:scripts`                   | passes              |
| Full verify      | `bun run verify` (repo root)             | exit 0              |
| DB mtime probe   | `ls -la ~/.platform/fs-metadata.sqlite*` | see Step 1          |

## Scope

**In scope**:

- `apps/server/src/db/client.ts`
- `apps/server/src/fs/metadata.ts` (only if Step 2 requires it)
- The ten `apps/server/src/**/tests/*.test.ts` files that call `createApp(`
- A new shared server test helper (see Step 3)
- Root `package.json` (`workspaces`, and a `scripts/` typecheck entry point)
- `scripts/tsconfig.json` (create) and/or `scripts/package.json` (create)
- `packages/ui/package.json` (add `test`)
- One new smoke test under `packages/ui` (see Step 5)

**Out of scope** (do NOT touch):

- Any production behavior change to how the _app_ resolves its database. The
  running app must keep defaulting to `~/.platform/fs-metadata.sqlite`. Only
  **tests** change, plus the guard in Step 2 which fires only when
  `NODE_ENV==='test'`/vitest is detected.
- `apps/web/test/server.ts` — already correct.
- `apps/server/src/db/tests/migrations.test.ts` — already correct.
- Fixing any type error you find in `scripts/` **beyond** what is needed to make
  typecheck pass. If a fix requires a design decision, report it.
- Writing real tests for `packages/ui` primitives. Step 5 adds a smoke test so
  the script exists and CI covers the package; a real suite is a separate plan.
- `packages/tree`'s test gap — that is plan 014.

## Git workflow

Per the operator rule in `plans/README.md`: **all work happens on `main`** — no
new branches, worktrees, or PRs unless the operator explicitly asks.

Conventional commits. Example subjects:

```
fix(server): the test suite stops writing to the developer's real database
build(scripts): the dev and prod scripts finally get typechecked
```

Commit after Step 3, Step 4, and Step 5 separately.

## Steps

### Step 1: Prove the leak, so you can prove the fix

```bash
ls -la ~/.platform/fs-metadata.sqlite*
cd /Users/shaul/Desktop/D/platform/apps/server && bun run test
ls -la ~/.platform/fs-metadata.sqlite*
```

**Verify**: the mtime (and almost certainly the `-wal` size) changes across the
test run. Record the before/after — this is your regression oracle for Step 4.

If the mtime does **not** change, stop and report: the leak may already be fixed
or the mechanism differs from this plan's model, and Steps 2–4 would be
solving nothing.

### Step 2: Make the default path refuse under test

In `apps/server/src/db/client.ts`, keep the production default but make it
unreachable from a test process. Target shape:

```ts
function resolveDefaultDatabasePath() {
  const explicit = Bun.env.FS_METADATA_DB
  if (explicit) return explicit

  // A test process must never touch the developer's real database. Injecting
  // `:memory:` or a temp path is the contract; defaulting silently is what let
  // the suite migrate and WAL-lock ~/.platform for months.
  if (isTestProcess()) {
    throw createStructuredError(...)  // see note below
  }

  return platformHomePath('fs-metadata.sqlite')
}
```

Two requirements:

- **Detect a test process** via `Bun.env.NODE_ENV === 'test'` or
  `Bun.env.VITEST` — check which one is actually set by
  `bun --bun vitest run` in this repo before relying on it
  (`cd apps/server && bun --bun vitest run --reporter=verbose` and print
  `Bun.env` from a scratch test, or just check both).
- **Use the repo's error factory, not `new Error`.** `AGENTS.md` forbids
  `new Error`; errors are created with `createError` from `evlog`, in practice
  through the feature's `structured-errors.ts` wrapper. Find the server's wrapper
  (`grep -rn "createStructuredError\|defineErrorCatalog" apps/server/src | head`)
  and use it, with a `why` that names the fix ("inject `metadataDatabase` /
  `orchestration.database`; see `apps/web/test/server.ts`").

Move the module-scope `const defaultMetadataDatabasePath` into this function so
the throw happens at call time, not at import time — importing the module must
stay side-effect-free, which the existing comment at `client.ts:26-29` says is
deliberate.

**Verify**: `cd apps/server && bun run test` now **fails loudly** in the tests
that were leaking. That failure is the finding, made mechanical. Count how many
test files fail — it should be a subset of the ten listed above.

### Step 3: Add a shared server test helper

Create `apps/server/test/server.ts` (or extend whatever shared helper already
exists — check `apps/server/src/testing.ts` first, which already re-exports
`createMetadataDatabase`). Model it on `apps/web/test/server.ts`:

```ts
export function makeTestApp(overrides: Partial<CreateAppOptions> = {}) {
  const database = createMetadataDatabase({ databasePath: ':memory:' })
  const app = createApp({
    metadataDatabase: database,
    orchestration: { database: database.db, ...overrides.orchestration },
    watch: false,
    ...overrides,
  })
  return { app, database, cleanup: () => database.close() }
}
```

`AGENTS.md` requires shared test code to live under `test/` and factories under
`test/factories/`; follow whichever layout `apps/server` already uses.

**Do not** use `mock.module` or `vi.mock` — `AGENTS.md` forbids mocking our own
server, client, or feature modules, and this needs no mocking: `createApp`
already accepts injection.

**Verify**: `cd apps/server && bun run typecheck` → exit 0.

### Step 4: Convert the ten test files

Update each `createApp(` call site to inject an in-memory database, via the
Step 3 helper where the call site's options allow it, or inline where a test
needs unusual options.

The ten files:
`tests/app.test.ts` (two call sites, lines ~286 and ~1003),
`fs/tests/search-routes.test.ts`, `git/tests/worktrees.test.ts`,
`git/tests/service.test.ts`, `git/tests/commit-progress.test.ts`,
`observability/tests/runtime.test.ts`, `provider/tests/auth-routes.test.ts`,
`provider/tests/command-routes.test.ts`, `orchestration/tests/engine.test.ts`.

Search for stragglers rather than trusting the list:

```bash
grep -rn "createApp(" apps/server/src --include="*.test.ts"
grep -rn "new FileSystemService(\|new FsMetadataStore(" apps/server/src --include="*.test.ts"
```

Every hit must inject a database or a `databasePath`. Also close handles — the
existing tests push apps into an `apps` array for cleanup; make sure the database
handle is closed alongside, or `:memory:` databases accumulate across a run.

**Verify**:

```bash
ls -la ~/.platform/fs-metadata.sqlite*   # record mtime
cd apps/server && bun run test           # all pass
ls -la ~/.platform/fs-metadata.sqlite*   # mtime UNCHANGED
```

The unchanged mtime is the done criterion for the whole SQLite half of this plan.

### Step 5: Give `packages/ui` a test script

Add to `packages/ui/package.json`:

```json
    "test": "vitest run",
```

Plain `vitest`, not `bun --bun vitest` — `AGENTS.md`: "Runtime-neutral
`packages/*` run plain `vitest`." `packages/ui` has no Bun-native dependency.

The package has zero tests today, and `vitest run` with no test files **exits
non-zero** by default, which would break `bun run verify`. Two options — pick the
first:

1. **Add one smoke test** (preferred): `packages/ui/src/components/tests/button.test.tsx`
   rendering `<Button>` and asserting it produces a `button` element with the
   `data-slot="button"` attribute. This proves the script, the config, and the
   package's render path all work. You will need a `vitest.config.ts` with a
   happy-dom environment (`AGENTS.md`: "real browser, happy-dom, never jsdom")
   and `@testing-library/react` if the repo already uses it — check
   `apps/web/test/render.tsx` for the established pattern.
   **Note the known trap**: base-ui's `ScrollArea` throws in happy-dom because
   `getAnimations` is missing. Test `Button`, not `ScrollArea`.
2. `"test": "vitest run --passWithNoTests"` — only if option 1 hits an
   environment problem you cannot resolve in reasonable time. Report if you fall
   back to this; a test script that asserts nothing is barely better than none.

**Verify**: `cd packages/ui && bun run test` → passes.

### Step 6: Put `scripts/` under typecheck

Add `"scripts"` to the root `package.json` `workspaces.packages` array, and give
`scripts/` a `package.json` with at minimum:

```json
{
  "name": "scripts",
  "private": true,
  "scripts": {
    "typecheck": "tsgo --noEmit",
    "lint": "oxlint .",
    "format": "oxfmt --write .",
    "format:check": "oxfmt --check ."
  }
}
```

plus a `scripts/tsconfig.json` matching the repo's Node-side config — copy the
shape of `apps/web/tsconfig.node.json`.

**Adding a workspace changes `bun.lock`.** That is expected. It also means
`bun install` runs — check with the operator before running it if the repo's
`link:@singapor/*` overrides make installs risky on this machine (the root
`package.json` documents that those resolve through a `bun link` registration to
a sibling `../../Editor` checkout with no npm fallback).

**If adding the workspace turns out to disturb the `@singapor/*` link setup,
stop.** A cheaper alternative that gets the same coverage: leave `workspaces`
alone and add a root script

```json
    "typecheck:scripts": "tsgo --noEmit -p scripts/tsconfig.json",
```

then chain it into the root `typecheck`. Take this path if the workspace addition
is at all messy — the goal is that the 642 lines get typechecked, not that they
become a workspace.

**Expect real errors on the first run.** Fix only the genuine type errors. If a
fix would require a design decision (a real `any` that hides a bug, a missing
runtime guard), report it rather than papering over it with a cast — `AGENTS.md`
explicitly forbids fake fixes like copying containers to satisfy TypeScript.

**Verify**: `bun run typecheck` from the repo root reaches `scripts/` and exits 0.

### Step 7: Full verify and CI check

```bash
bun run verify
```

Then confirm CI would cover the new surface: `.github/workflows/ci.yml` runs
`bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test` — all
four now reach `packages/ui` and `scripts/` automatically, with no workflow edit
needed. Confirm by reading the workflow; do not edit it.

**Verify**: `bun run verify` exits 0.

## Test plan

New tests:

- `packages/ui/src/components/tests/button.test.tsx` — one smoke test (Step 5):
  renders `<Button>`, asserts a `button` element with `data-slot="button"`.
  Model the render setup on `apps/web/test/render.tsx`.

Changed tests: the ten server files in Step 4 change **only** their app
construction. If any of them needs an assertion changed, that is a STOP
condition — it means a test was passing because of shared database state, which
is precisely the bug.

Do **not** add tests for the Step 2 guard itself. Asserting "this throws in a
test process" from inside a test process is circular; Step 1's mtime probe is
the real evidence.

Verification: `bun run verify` → exit 0, with the server suite's test count
unchanged from the pre-change baseline. Record it first:
`cd apps/server && bun run test 2>&1 | tail -5`.

## Done criteria

ALL must hold:

- [ ] `ls -la ~/.platform/fs-metadata.sqlite*` mtime is **unchanged** across a
      full `cd apps/server && bun run test` run
- [ ] `grep -rn "createApp(" apps/server/src --include="*.test.ts"` — every hit
      injects `metadataDatabase` and `orchestration.database` (or uses the
      Step 3 helper)
- [ ] `apps/server/src/db/client.ts` throws a **structured** error (not
      `new Error`) when a test process reaches the default path
- [ ] `cd packages/ui && bun run test` passes, and `packages/ui/package.json`
      has a `test` script
- [ ] `bun run typecheck` from the repo root covers `scripts/` (verify by
      introducing a deliberate type error in `scripts/dev.ts`, confirming
      typecheck fails, then reverting)
- [ ] `bun run verify` exits 0
- [ ] Server suite test count unchanged from baseline
- [ ] No production behavior change: the app still defaults to
      `~/.platform/fs-metadata.sqlite` outside a test process
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's mtime probe shows **no** change — the leak model in this plan is
  wrong and Steps 2–4 would be solving nothing.
- A server test needs an **assertion** changed (not just its app construction)
  to pass with an isolated database. That means it was asserting against shared
  machine state; report which test and what it was depending on.
- Neither `NODE_ENV==='test'` nor `VITEST` is set in this repo's test processes,
  so the Step 2 guard cannot detect a test run. Report it; do not invent a
  detection heuristic (e.g. sniffing `process.argv`).
- Adding `scripts` to `workspaces` disturbs the `link:@singapor/*` overrides or
  a `bun install` fails. Fall back to the `typecheck:scripts` root-script
  approach described in Step 6 and report.
- `scripts/` typecheck produces an error whose fix requires a design decision
  rather than a type annotation. Report the error; do not cast it away.
- `packages/ui`'s smoke test hits an environment problem (a base-ui primitive
  that needs browser APIs happy-dom lacks). Fall back to `--passWithNoTests`,
  report it, and note which primitive failed.
- More than ~15 server test files turn out to be leaking (the plan expects ≤10).
  The scope is larger than modelled; report the real list.

## Maintenance notes

- **This plan is the gate for Phase 3 of `plans/README.md`.** The structural
  refactors (dual projection collapse, chat normalization, FileTreeView split,
  command table) all lean on "the tests pass" as their safety argument. Until
  the server suite is hermetic and `packages/ui` and `scripts/` are covered,
  that argument is weaker than it looks.
- A reviewer should check exactly one thing beyond the diff: run
  `cd apps/server && bun run test` twice in a row and confirm
  `~/.platform/fs-metadata.sqlite` is untouched both times.
- The Step 2 guard is the durable part. Test isolation that depends on every
  future test remembering to inject a database will regress; a default that
  refuses cannot.
- **Deliberately deferred**: a real test suite for `packages/ui`'s 34 primitives.
  Step 5 only creates the slot. Direction option D1 in `plans/README.md` (a
  primitives gallery) is the natural companion — it gives the package both a
  visual review surface and an obvious place to hang render tests.
- **Deliberately deferred**: `packages/tree` has 9 test cases for 20K lines.
  That is plan 014, and it is the other half of the baseline.
- Once `scripts/` typechecks, consider whether `test:scripts` should broaden
  beyond `runtime-network.test.ts` — right now exactly one of eight script
  modules has a test.
