# Plan 004: Fix onboarding — add .env.example and make README setup claims true

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f88800a..HEAD -- README.md package.json docs/git-feature-comparison.md docs/command-palette-vscode-parity-backlog.md docs/workspace-search-next-steps.md docs/search-tab-performance-workstreams.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (docs + one new template file; no production code)
- **Depends on**: none (001's `verify` script is referenced in step 3 — if 001 has not landed, document the four individual commands instead)
- **Category**: docs / dx
- **Planned at**: commit `f88800a`, 2026-06-12

## Why this matters

Three onboarding gaps compound: (1) `bun run dev` requires a `.env` file
(`"dev": "bun --env-file=.env scripts/dev.ts"`) but the repo ships no
`.env.example`, so a fresh clone fails with nothing to copy; (2) `README.md`
claims the sibling `Editor` checkout is "no longer required" while the root
`package.json` still declares `"../Editor/packages/*"` as a workspace and
`packages/editor-*` are symlinks into it — the hybrid setup is intentional
(local editor development) but undocumented, so the README reads as false;
(3) several docs carry dead absolute paths to a machine layout that no longer
exists. Each is minutes of friction that lands on every new contributor (and
every fresh agent session).

## Current state

- `.env` exists locally, is **gitignored, and has never been committed** (verified: `git log --all -- .env` is empty). It contains a PostHog API key under the name `POSTHOG_API_KEY` — that value must NEVER appear in `.env.example` or any committed file.
- Variable names used by the local `.env` at planning time (values omitted deliberately):
  `PORT`, `FS_HOST`, `WEB_HOST`, `WEB_PORT`, `VITE_SERVER_URL`, `SERVER_ALLOWED_ORIGINS`, `FS_WATCH`, `FS_TREE_CONCURRENCY`, `FS_DEV_MAX_TEXT_FILE_BYTES`, `OBSERVABILITY_ENABLED`, `OBSERVABILITY_SERVICE`, `OBSERVABILITY_DIR`, `OBSERVABILITY_CONSOLE`, `OBSERVABILITY_FILE_PRETTY`, `OBSERVABILITY_INFO_SAMPLE_RATE`, `OBSERVABILITY_SLOW_MS`, `OBSERVABILITY_MAX_FILES`, `OBSERVABILITY_MAX_SIZE_BYTES`, `OBSERVABILITY_BATCH_SIZE`, `OBSERVABILITY_BATCH_INTERVAL_MS`, `OBSERVABILITY_MAX_BUFFER_SIZE`, `OBSERVABILITY_POSTHOG_ENABLED`, `POSTHOG_API_KEY`, `OBSERVABILITY_POSTHOG_HOST`, `OBSERVABILITY_POSTHOG_MODE`, `OBSERVABILITY_POSTHOG_EVENT_NAME` (and possibly a few more — read the local `.env` for the full list; `turbo.json`'s `globalPassThroughEnv` array is a good cross-check for recognized names).
- `README.md:22-25` (the claim to fix):

  > The editor runtime is consumed from public npm packages under the `@singapor/*`
  > scope. A sibling checkout of the separate `Editor` monorepo is no longer
  > required for `bun install`.

- Root `package.json` `workspaces.packages` includes `"../Editor/packages/*"`, and `packages/` contains 12 `editor-*` symlinks into `../../Editor/packages/*`. `apps/web/package.json` depends on npm `@singapor/*@0.1.1` packages. Interpretation (confirm with `bun install` behavior, do not assume): npm packages are the default source; the workspace glob + symlinks deliberately link a local Editor checkout _when present_ so editor changes can be developed in tandem.
- Stale doc paths (all four files already carry a "🟡 NEEDS UPDATE" banner):
  - `docs/git-feature-comparison.md:8` — references `/Users/shaul/Desktop/Editors/zed` and `/Users/shaul/Desktop/Editors/vscode`
  - `docs/command-palette-vscode-parity-backlog.md:2,8` — references `/Users/shaul/Desktop/Editors/vscode`
  - `docs/workspace-search-next-steps.md` — dead `/Desktop/platform` and `/Desktop/Editors` paths
  - `docs/search-tab-performance-workstreams.md:1` — dead paths tied to an expired trace
  - Vendored reference checkouts now live in `references/` at the repo root (`references/vscode` exists; **there is no `references/zed`**).
- README has no "verification" guidance after setup (no "how do I know it works").

## Commands you will need

| Purpose                      | Command                                              | Expected on success |
| ---------------------------- | ---------------------------------------------------- | ------------------- |
| Confirm .env never committed | `git log --oneline --all -- .env`                    | empty output        |
| Confirm gitignored           | `git check-ignore .env`                              | prints `.env`       |
| Sanity-check example loads   | `bun --env-file=.env.example -e "console.log('ok')"` | prints `ok`         |
| Typecheck (unchanged)        | `bun run typecheck`                                  | exit 0              |

## Scope

**In scope** (the only files you should create/modify):

- `.env.example` (create)
- `README.md`
- `docs/git-feature-comparison.md`, `docs/command-palette-vscode-parity-backlog.md`, `docs/workspace-search-next-steps.md`, `docs/search-tab-performance-workstreams.md` (path fixes only)

**Out of scope** (do NOT touch):

- `.env` itself — never edit, never commit, never echo its values into any file or output.
- `package.json` `workspaces` field — the glob is intentional; this plan documents it, it does not "fix" it.
- The substantive content/status of the four stale docs — only repair file paths; their 🟡 status banners and content review are the maintainer's call.
- `AGENTS.md` — agent-facing conventions are maintained separately.

## Git workflow

- Branch: `advisor/004-onboarding-env-and-readme`
- Commit style: conventional commits, e.g. `docs: add .env.example and document hybrid editor setup`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `.env.example`

Read the local `.env` for structure and variable names. Create `.env.example` with the same variables, grouped and commented, with safe placeholder values:

- ports/hosts: keep working local defaults (e.g. whatever ports the local file uses are fine to include — they are not secrets)
- booleans/numbers: keep the local defaults
- `POSTHOG_API_KEY`: set to empty (`POSTHOG_API_KEY=`) with a comment `# optional — only needed when OBSERVABILITY_POSTHOG_ENABLED=true`. The real key must not appear.
- any other value that looks like a credential or token: empty placeholder + comment.

**Verify**: `grep -c "phc_\|sk-\|token\|KEY=.\+" .env.example` → the only matches (if any) are comment lines or empty assignments; then `git log --oneline --all -- .env` → still empty (you didn't accidentally stage `.env`).

### Step 2: Make the README's editor-packages section true

Replace the `README.md` "Editor Packages" section (lines 22-25 excerpted above) with one that documents both modes, e.g.:

- Default: editor runtime resolves from npm `@singapor/*` — a fresh clone + `bun install` works standalone.
- Editor development: if a sibling `../Editor` checkout exists, the root workspace glob `"../Editor/packages/*"` and the `packages/editor-*` symlinks link it into the workspace so editor changes are picked up locally.

Before writing, confirm the standalone claim the cheapest honest way you can: if `../Editor` exists on this machine you cannot easily simulate a fresh clone — in that case state the dual-mode behavior as configured intent and note in your report that standalone install was not re-verified.

**Verify**: README no longer claims the checkout is simply "no longer required"; both modes are described; `grep -n "no longer required" README.md` → no match.

### Step 3: Add a setup-verification section to README

After "Common Commands", add a short "Verify your setup" section: run `bun run verify` (or, if plan 001 hasn't landed: `bun run typecheck && bun run lint && bun run format:check && bun run test`), then `cp .env.example .env`, then `bun run dev` and open the printed local URL — expect the workspace shell with file tree and editor. Mention `bun run hooks:install` for lefthook.

**Verify**: every command named in the new section exists in root `package.json` scripts: `grep -n '"verify"\|"typecheck"\|"dev"\|"hooks:install"' package.json` → all present (drop the `verify` mention if 001 hasn't landed).

### Step 4: Repair dead paths in the four docs

In each of the four docs, replace `/Users/shaul/Desktop/Editors/vscode` (and `/Desktop/platform`-era self-references) with paths that exist now — `references/vscode` for the vscode checkout, repo-relative paths for self-references. For **zed** references: `references/zed` does not exist; replace the path with the text `(zed checkout not vendored — see upstream https://github.com/zed-industries/zed)` rather than inventing a local path. Only substitute a path after confirming the target exists (`ls` it).

**Verify**: `grep -rn "Desktop/Editors\|Desktop/platform" docs/` → no matches.

## Test plan

No code tests — this plan is docs/templates. The verification gates above (greps + `bun --env-file=.env.example`) are the test plan.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `.env.example` exists; `bun --env-file=.env.example -e "console.log('ok')"` prints `ok`
- [ ] No credential values in any changed file (manual scan + step 1 grep)
- [ ] `grep -n "no longer required" README.md` → no match
- [ ] `grep -rn "Desktop/Editors\|Desktop/platform" docs/` → no matches
- [ ] `git status` shows changes only to in-scope files, and `.env` is NOT staged
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `git log --oneline --all -- .env` is NOT empty — the env file (and its PostHog key) was committed at some point; the key must be treated as burned and rotated. Report immediately; rotation is an operator action.
- The local `.env` is missing (nothing to derive names from) — derive from `turbo.json` `globalPassThroughEnv` and `scripts/dev.ts`, and say so in the report.
- You find evidence the workspace glob is actually load-bearing for a fresh `bun install` (i.e. install fails without `../Editor`) — then the README rewrite in step 2 must say "required for development workflows", and plan 001's CI assumption is at risk; flag it for the maintainer.

## Maintenance notes

- Whenever a new env var is added to `turbo.json`'s `globalPassThroughEnv` or read in `scripts/*.ts`, `.env.example` should gain the variable in the same PR — reviewers should watch for drift.
- The four repaired docs keep their 🟡 status banners; content refresh (which phases/claims are still accurate) is deliberately left to the maintainer.
- If the editor packages ever go fully npm-only (glob + symlinks removed), simplify the README section back to a single mode.
