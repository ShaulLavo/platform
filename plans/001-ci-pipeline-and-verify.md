# Plan 001: Establish a CI pipeline and a one-command verification gate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 445a97d..HEAD -- package.json lefthook.yml turbo.json apps/server/package.json apps/web/package.json apps/desktop/package.json packages`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (the `link:@singapor/*` overrides may block a clean CI install — see STOP conditions)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `445a97d`, 2026-06-18 (refreshed; originally drafted at `f88800a`, 2026-06-12)

## Execution outcome (2026-06-19, @ `445a97d`)

**PARTIAL — toolchain pinned + `verify` script landed green; the GitHub Actions workflow is intentionally deferred (STOP condition #2 confirmed).**

- **Step 1 baseline**: green (typecheck / lint / format:check / test all exit 0).
- **Step 2 (CI feasibility)**: `bun install --frozen-lockfile` exits 0 _locally_ but that is a false positive — it only resolves because this machine has the `bun link` registrations (`~/.bun/install/global/node_modules/@singapor/*`) and the sibling `../../Editor` repo. A simulated clean checkout (archived tree, empty `HOME`, sibling absent) reproduced what CI does: `bun install --frozen-lockfile` **exits 0 but silently omits every `@singapor/*` package**, then `tsgo` typecheck fails with **112× `TS2307: Cannot find module '@singapor/core'`** in `web` (and `server` imports `@singapor/lsp`/`@singapor/typescript-lsp` too). So `.github/workflows/ci.yml` would be dead on arrival. Per the operator's decision, the workflow is **deferred** and a `//ci-link-todo` breadcrumb was added next to the `overrides` block in root `package.json`. Data point for the fix: `@singapor/core@0.1.1` **is** published to public npm, so the manifests' real versions are installable once the `link:` overrides are neutralized for CI.
- **Step 3 (pinning) — scope expanded vs. the plan's prose**: the plan's "In scope" prose named only root + `web` + `server`, but `"latest"` was actually present in **7 manifests** (`apps/web`, `apps/server`, `apps/desktop`, `packages/{tree,ui,contracts,observability}`) — and the plan's own Done-criteria grep covers `apps packages package.json`. The `latest` tags had already drifted: root resolved `oxfmt@0.54.0`/`oxlint@1.69.0` while every workspace resolved `oxfmt@0.55.0`/`oxlint@1.70.0`. Pinned **all** of them (plus root) to the baseline-green versions — `@typescript/native-preview@7.0.0-dev.20260613.1`, `oxfmt@0.55.0`, `oxlint@1.70.0` — collapsing the lockfile to a single version each (install count 1085 → 1037). Behavior unchanged (verify stays green); STOP condition for version-induced output change did **not** trigger.
- **Step 4**: added `"verify": "bun run typecheck && bun run lint && bun run format:check && bun run test"` to root scripts.
- **Step 5 (`ci.yml`)**: **NOT created** (deferred — see Step 2).
- **Step 6 end-to-end**: `bun run verify` exits 0 (737 tests pass).

**Remaining to close this plan**: neutralize the `link:@singapor/*` overrides for CI (or have CI provision the sibling repo), then add `.github/workflows/ci.yml` (Step 5 body is still valid) and validate the live Actions run.

## Why this matters

The repo still has no CI — no `.github/workflows/`, no other CI config. Quality
gates exist only as local pre-commit hooks (`lefthook.yml`), which are bypassable
with `--no-verify` and do not run tests. `lefthook.yml` even contains a TODO
comment saying a benchmark gate should "move to CI". The toolchain tools
`@typescript/native-preview`, `oxfmt`, and `oxlint` are pinned to `"latest"` in
the two app manifests (and to floating `^` ranges in the root), so the toolchain
can silently change between installs, which makes any CI (and any two developer
machines) non-reproducible. After this plan: one command (`bun run verify`)
checks the whole repo, the toolchain is pinned, and a GitHub Actions workflow
runs that command on every push/PR.

## Current state

- Remote: GitHub (`gh repo view` to confirm the slug). GitHub Actions is the right CI target.
- Root `package.json` `scripts` — has `typecheck`, `test`, `lint`, `format:check`, but **no** `verify`/`check`/`ci` script. The existing scripts fan out with **bun's own filter runner, not turbo directly**:

  ```json
  "lint": "bun run --filter '*' lint",
  "typecheck": "bun run --sequential --filter '*' typecheck",
  "test": "bun run --filter '*' test",
  "format:check": "bun run --filter '*' format:check",
  ```

  So `verify` must chain these existing root scripts (see step 3) — do **not** invent a `turbo …` invocation; the repo's scripts don't call turbo.

- Toolchain pins are inconsistent and partly floating:
  - `apps/web/package.json` — `"@typescript/native-preview": "latest"` (line 81), `"oxfmt": "latest"` (line 91), `"oxlint": "latest"` (line 92).
  - `apps/server/package.json` — `"@typescript/native-preview": "latest"` (line 55), `"oxfmt": "latest"` (line 58), `"oxlint": "latest"` (line 59).
  - Root `package.json` `devDependencies` — `"@typescript/native-preview": "^7.0.0-dev.20260613.1"`, `"oxfmt": "^0.54.0"`, `"oxlint": "^1.69.0"` (floating `^`, should be exact).
- `packageManager` field in root `package.json`: `"bun@1.3.10"`.
- `turbo.json` exists and defines `lint`/`format:check`/`typecheck`/`test` tasks, but the root scripts above use `bun run --filter`, so turbo's task graph is not what `verify` will exercise. Leave `turbo.json` untouched.
- Per-workspace test scripts already exclude the Playwright browser project from the default run:
  - `apps/web/package.json:22` — `"test": "bun --bun vitest run --project node --project dom"`
  - `apps/server/package.json:25` — `"test": "bun --bun vitest run"`
- Typecheck uses `tsgo` (from `@typescript/native-preview`): `apps/web/package.json:25` `"typecheck": "tsgo --build"`, `apps/server/package.json:29` `"typecheck": "tsgo --noEmit"`.
- `lefthook.yml` pre-commit runs oxfmt/oxlint on staged files and `bun run typecheck`; tests are not run anywhere automatically.
- **Editor-package linking (the CI install risk).** Root `package.json` `workspaces.packages` is `["apps/*", "packages/contracts", "packages/observability", "packages/tree", "packages/ui"]` — it does **not** include the editor packages. The `packages/editor-*` directories are symlinks to a sibling `../../Editor` repo, and the `@singapor/*` editor packages are redirected by root `overrides` to `link:` targets:

  ```json
  "overrides": {
    "@singapor/core": "link:@singapor/core",
    "@singapor/diff": "link:@singapor/diff",
    "@singapor/find": "link:@singapor/find",
    ... (13 @singapor/* entries) ...
  }
  ```

  Locally these resolve because the sibling repo is `bun link`-ed. **A clean CI checkout has neither the sibling repo nor the link registrations**, so `bun install --frozen-lockfile` may fail to resolve the `link:@singapor/*` overrides. The app manifests do declare real published versions (`apps/web/package.json` lists `@singapor/core: "0.1.1"` etc.), so a resolution exists in principle — but reconciling the `link:` overrides with a CI install is a maintainer decision, not something to guess at (see STOP conditions).

## Commands you will need

| Purpose      | Command                | Expected on success |
| ------------ | ---------------------- | ------------------- |
| Install      | `bun install`          | exit 0              |
| Typecheck    | `bun run typecheck`    | exit 0              |
| Lint         | `bun run lint`         | exit 0              |
| Format check | `bun run format:check` | exit 0              |
| Tests        | `bun run test`         | exit 0, all pass    |

Run all from the repo root: `/Users/shaul/Desktop/D/platform`.

## Scope

**In scope** (the only files you should modify/create):

- Root `package.json` (add `verify` script; make the three toolchain deps exact)
- `apps/web/package.json` and `apps/server/package.json` (replace `"latest"` for the three toolchain deps with exact versions)
- `bun.lock` (regenerated by `bun install` after pinning — commit the result)
- `.github/workflows/ci.yml` (create)

**Out of scope** (do NOT touch, even though they look related):

- `lefthook.yml` — pre-commit behavior is deliberate (fast hooks, no tests); CI is the enforcement layer.
- Per-workspace `test`/`typecheck`/`lint`/`format:check` script bodies — the `--bun` flag and `--project` selection are load-bearing (see AGENTS.md "Bun/Vitest Gotchas").
- The Playwright `browser` test project — it spawns real servers and is excluded from default test runs on purpose. Do not add it to CI in this plan.
- The `overrides` block / `@singapor/*` linking — if CI install fails on it, STOP and report (do not rip out the overrides; that breaks local editor dev).
- Pinning or upgrading any dependency other than the three named toolchain tools.
- `references/` and `packages/editor-*` symlinks.

## Git workflow

- **Work directly on `main`. Do NOT create a branch, worktree, or PR.** (Operator rule for this repo: everything happens on `main`.)
- Commit style: conventional commits, lowercase type prefix (see `git log` — e.g. `chore(ci): add verify script and workflow`). Suggested: one commit for pinning, one for the verify script + workflow. **Only commit if the operator asked you to; otherwise leave the changes staged/unstaged for their review.**
- Do NOT push.

## Steps

### Step 1: Capture the pre-existing baseline

From the repo root run each of: `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run test`. Record which (if any) fail **before any change**.

**Verify**: all four exit 0. If any fails, that failure is pre-existing — STOP and report it (the repo needs a green baseline before a CI gate is useful; do not fix unrelated failures inside this plan).

### Step 2: Confirm a clean install resolves (CI feasibility probe)

Run `bun install --frozen-lockfile` from the repo root.

**Verify**: exit 0. If it errors on a `link:@singapor/*` override (or any missing link target), STOP and report — this is the editor-linking blocker described in "Current state"; resolving how CI installs the `@singapor/*` packages is a maintainer decision. Do not proceed to writing the workflow until install is known-good, or the workflow will be dead on arrival.

### Step 3: Pin the three toolchain tools to exact versions

1. Find every floating declaration: `grep -rn '"latest"' --include=package.json apps packages package.json | grep -v node_modules` (expect matches in `apps/web/package.json` and `apps/server/package.json`), plus note the root's `^`-ranged entries for the same three tools.
2. For each of `@typescript/native-preview`, `oxfmt`, `oxlint`, find the version actually installed: `bun pm ls 2>/dev/null | grep -E 'native-preview|oxfmt|oxlint'` (or read the resolution entries in `bun.lock`).
3. Replace `"latest"` (in both app manifests) and the `^` range (in root) with that exact version — exact pin, no `^`/`~`. Use the **same** version string in all three manifests for each tool.
4. Run `bun install` to sync `bun.lock`.

**Verify**: `grep -rn '"latest"' --include=package.json apps packages package.json | grep -v node_modules` → no matches. Then `bun run typecheck && bun run lint && bun run format:check` → all exit 0 (same versions, so behavior must not change).

### Step 4: Add the `verify` script

In root `package.json` `scripts`, add (chaining the existing root scripts — NOT turbo):

```json
"verify": "bun run typecheck && bun run lint && bun run format:check && bun run test"
```

**Verify**: `bun run verify` → exit 0, runs all four phases across workspaces.

### Step 5: Create `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.10
      - uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}
          restore-keys: bun-${{ runner.os }}-
      - run: bun install --frozen-lockfile
      - run: bun run verify
```

Keep `bun-version` in sync with the `packageManager` field in root `package.json` (currently `1.3.10` — re-check it).

**Verify**: the YAML parses — `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` → exit 0.

### Step 6: Local end-to-end check of what CI will run

Simulate the workflow body locally: `bun install --frozen-lockfile && bun run verify`.

**Verify**: exit 0.

## Test plan

No new test files. The deliverable IS the verification infrastructure. The end-to-end check is step 6; the live GitHub Actions run can only be validated after the operator pushes to `main` — note that in your report.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn '"latest"' --include=package.json apps packages package.json | grep -v node_modules` → no matches
- [ ] `bun run verify` exits 0
- [ ] `.github/workflows/ci.yml` exists and parses as YAML
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 baseline fails — the repo is not green before your change.
- Step 2: `bun install --frozen-lockfile` fails on the `link:@singapor/*` overrides (or any missing link target). This is the central CI-feasibility risk; resolving how CI installs the editor packages is a maintainer decision. Report the exact error and the packages involved.
- Pinning a tool version changes lint/format/typecheck output (step 3 verify fails) — the lockfile and the manifest disagreed; report the versions involved.
- `bun run verify` is differently green/red from running the four scripts individually — report rather than tweaking scripts.

## Maintenance notes

- When bumping the `packageManager` bun version, update `bun-version` in `ci.yml` in the same commit.
- The three pinned tools (`oxlint`, `oxfmt`, `@typescript/native-preview`) now need deliberate upgrades; lint/format/typecheck rule changes will show up as a diff in the upgrade commit — that is the point.
- If the CI install blocker (STOP condition, step 2) is real, the likely follow-ups are: stop forcing `@singapor/*` to `link:` in CI (use the published `0.1.1` versions already in the manifests), or add a CI step that provisions the links. Either is a separate plan.
- Follow-ups deferred out of this plan: adding the Playwright `browser` test project to CI, the editor scroll benchmark gate referenced by the TODO in `lefthook.yml`, branch-protection rules (operator action on GitHub), and wiring `bun audit` into CI (see plan 005).
