# Plan 005: Patch the vulnerable transitive dependencies flagged by `bun audit`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 445a97d..HEAD -- package.json apps/web/package.json apps/server/package.json bun.lock`
> If any of those changed since this plan was written, re-run `bun audit`
> (step 1) and compare against the advisory list below before proceeding.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: MED (a dependency bump can change runtime behavior of the markdown renderer / HTTP client)
- **Depends on**: none (lands cleaner after 001, so CI re-runs `bun audit` going forward — but not blocked by it)
- **Category**: security
- **Planned at**: commit `445a97d`, 2026-06-18

## Why this matters

`bun audit` reports 11 advisories. The ones that matter sit on **reachable
runtime paths**:

- **DOMPurify** (several moderate/low XSS advisories) is pulled in through
  `streamdown` / `@streamdown/mermaid`, which `apps/web` uses to render Markdown.
  In this app the Markdown being rendered includes **model / coding-agent
  output** — i.e. attacker-influenceable content — so an XSS-sanitizer bypass
  here is a genuine browser-side risk, not theoretical.
- **undici** `>=7.23.0 <7.28.0` (one **high**: TLS certificate validation bypass
  via SOCKS5 ProxyAgent) is pulled in through `cheerio`, which the server's font
  service uses to parse remote HTML (`apps/server/src/fonts/service.ts:1,158`).
  Exploitable only if a SOCKS5 proxy is configured, but it is the only _high_
  advisory and the fix is cheap.
- **@babel/core** (low: arbitrary file read via `sourceMappingURL`) via
  `@rolldown/plugin-babel` and `eslint-plugin-react-hooks` — build-time only,
  lowest priority, fold in if a bump is free.

After this plan: `bun audit` reports no **high** advisories and no
**moderate** advisories on the DOMPurify (markdown-render) path, and the app
still builds, typechecks, tests, and renders chat/markdown correctly.

## Current state

- Run `bun audit` from repo root to see the live list. As of `445a97d` it reports
  `11 vulnerabilities (1 high, 6 moderate, 4 low)`, with these reachable chains:
  - `workspace:web › streamdown › dompurify` and `workspace:web › @streamdown/mermaid › streamdown` (DOMPurify advisories)
  - `workspace:server › cheerio › undici` (undici high + moderate)
  - `workspace:web › @rolldown/plugin-babel › @babel/core`, `workspace:web › eslint-plugin-react-hooks › @babel/core` (babel low)
- Direct deps that own these chains:
  - `apps/web/package.json` — `"streamdown": "^2.5.0"` (line 63), `"@streamdown/mermaid": "^1.0.2"` (line 45); DOMPurify is **transitive** under these.
  - `apps/server/package.json` — `"cheerio": "^1.2.0"` (line 40); undici is **transitive** under it.
- The repo already uses the **`overrides`** mechanism in root `package.json` to pin transitive deps — current entries pin `brace-expansion`, `esbuild`, `ws`:

  ```json
  "overrides": {
    ... (the @singapor/* link entries) ...,
    "brace-expansion": "5.0.6",
    "esbuild": "0.28.1",
    "ws": "8.21.0"
  }
  ```

  This is the established, in-repo pattern for forcing a patched transitive version. Use it for any advisory that a plain `bun update` does not clear.

- Where the markdown renderer is actually used (so you know what to smoke-test): search `grep -rn "streamdown\|Streamdown\|Markdown" apps/web/src/features/chat` to find the chat message renderer; that is the surface DOMPurify protects.

## Commands you will need

| Purpose         | Command                      | Expected on success                |
| --------------- | ---------------------------- | ---------------------------------- |
| Audit           | `bun audit`                  | runs; lists advisories             |
| Install         | `bun install`                | exit 0                             |
| Update (compat) | `bun update <pkg>`           | exit 0; lockfile updated           |
| Typecheck       | `bun run typecheck`          | exit 0                             |
| Tests           | `bun run test`               | exit 0, all pass                   |
| Web build       | `bun run --filter web build` | exit 0 (catches renderer breakage) |

Run all from the repo root: `/Users/shaul/Desktop/D/platform`.

## Scope

**In scope** (the only files you should modify):

- Root `package.json` (add/adjust `overrides` entries only)
- `apps/web/package.json` / `apps/server/package.json` (only if a direct-dep minor/patch bump is the cleaner fix than an override)
- `bun.lock` (regenerated; commit the result)

**Out of scope** (do NOT touch):

- Any major-version dependency upgrade (e.g. streamdown 2 → 3, cheerio 1 → 2). If the only patched version requires a major bump, STOP and report — major bumps are their own plan.
- The `@singapor/*` `link:` overrides — leave them exactly as they are.
- Application source code. This plan changes dependency resolution only. (If a bump _forces_ a source change, that is a STOP condition.)
- The four low/moderate advisories that are not on the DOMPurify or undici paths, unless a free `bun update` happens to clear them.

## Git workflow

- **Work directly on `main`. Do NOT create a branch, worktree, or PR.** (Operator rule: everything happens on `main`.)
- Commit style: conventional commits — e.g. `chore(deps): patch undici and dompurify advisories`. **Only commit if the operator asked; otherwise leave changes for review.**
- Do NOT push.

## Steps

### Step 1: Record the baseline audit and a green test run

1. `bun audit > /tmp/audit-before.txt 2>&1` (capture the starting state).
2. `bun run typecheck && bun run test` — confirm green before touching anything.

**Verify**: tests pass. Note the exact advisory IDs/counts from the audit output. If tests are already red, STOP and report (do not bury a pre-existing failure under a dep change).

### Step 2: Clear undici (high) via cheerio

1. Try the compatible-range update first: `bun update undici cheerio`.
2. Re-run `bun audit` and check the `undici` chain. If undici is now `>=7.28.0`, done.
3. If `bun update` does not move undici (cheerio's range still resolves the vulnerable version), add an override to root `package.json` pinning undici to the patched line, e.g. `"undici": "7.28.0"` (use the lowest patched version `bun audit` names — re-read the advisory link if unsure).
4. `bun install`.

**Verify**: `bun audit` no longer lists the undici **high** advisory. `bun run --filter server test` → exit 0 (fonts service still parses).

### Step 3: Clear the DOMPurify advisories via streamdown

1. Try `bun update streamdown @streamdown/mermaid @streamdown/code @streamdown/math @streamdown/cjk` (move the whole streamdown family within its compatible range).
2. Re-run `bun audit`. If DOMPurify moderate/low advisories remain, add an override pinning `dompurify` to the patched version `bun audit` names (e.g. `"dompurify": "<patched>"`), then `bun install`.

**Verify**: `bun audit` no longer lists DOMPurify **moderate** advisories. Then smoke-test the renderer:

- `bun run --filter web build` → exit 0.
- `bun run --filter web test` → exit 0 (chat/markdown component tests, if any, still pass).
- Manually open the chat markdown surface in the already-running dev server and confirm a fenced code block + a mermaid block still render (note in your report that you did this; if the chat panel is not mounted — see plan 008 — say so and rely on the build + unit tests instead).

### Step 4: Opportunistically clear @babel/core (low)

Run `bun update @babel/core` (and let `@rolldown/plugin-babel` / `eslint-plugin-react-hooks` pick up the patched transitive if available). If it does not clear without a major bump, leave it — it is build-time and low severity. Do **not** add a `@babel/core` override that breaks the build.

**Verify**: `bun run typecheck` → exit 0.

### Step 5: Full verification

`bun run typecheck && bun run test && bun run --filter web build`.

**Verify**: all exit 0. Then `bun audit > /tmp/audit-after.txt 2>&1` and diff against `/tmp/audit-before.txt` — the high advisory and the DOMPurify moderates must be gone; record the remaining (acceptable) low advisories in your report.

## Test plan

- No new test files required (this is a dependency change). The existing
  `apps/web` and `apps/server` suites are the regression net — they must stay green.
- If `apps/web` has a chat/markdown rendering test, it is the most relevant
  guard; name it in your report. If none exists, note that the renderer was
  verified via `bun run --filter web build` plus a manual render check.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun audit` reports **0 high** advisories
- [ ] `bun audit` reports no **moderate** advisory on the `dompurify` (streamdown) chain
- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0
- [ ] `bun run --filter web build` exits 0
- [ ] Only `package.json`, `apps/*/package.json`, and `bun.lock` changed (`git status`); no source files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The only patched version of any package requires a **major** version bump (e.g. streamdown 2 → 3). Report which package and the version gap.
- Clearing an advisory forces a change to application source code (an API changed). Report the package and the break.
- A bump turns the test suite or web build red and the cause is not an obvious lockfile re-resolve you can revert. Report rather than patching source to compensate.
- `bun audit` still shows a **high** advisory after step 2 that cannot be cleared by an override within the compatible range.

## Maintenance notes

- After plan 001 lands, wire `bun audit` (e.g. `bun audit --audit-level=high`) into the CI workflow so new high advisories fail the build — that closes the loop this plan opens manually.
- The `overrides` you add here pin transitive versions; when you later bump `cheerio` / `streamdown` to majors, remove the now-redundant overrides so they don't mask future advisories.
- The DOMPurify path is the one to watch: any future change to how chat renders model output (raw HTML passthrough, custom sanitizer config) re-opens the XSS surface this advisory family is about.
