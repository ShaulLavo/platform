# Plan 016: Move `features/logs/` onto the theme tokens

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat ace313f..HEAD -- apps/web/src/features/logs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none. **Ordering note**: plan 010 _renames_ these files
  (`log-formatters.ts` → `utils/formatters.ts`, `logs-timeline-bar.tsx` →
  `components/timeline-bar.tsx`). If 010 has already run, use the new paths —
  the line numbers and code excerpts below are unchanged by a rename. Running
  this plan **before** 010 is simpler and is the recommended order.
- **Category**: tech-debt
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

`AGENTS.md` states the rule plainly:

> - Use theme tokens only. Color classes must resolve to a token:
>   `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`,
>   `bg-card`, `border-border`, etc.
> - Never use raw Tailwind palette colors (`bg-blue-600`, `text-red-500`,
>   `text-sky-300`, `amber-*`, `emerald-*`) or hex/`oklch()` literals in
>   components. They bypass theming and dark mode.
> - Status and diff colors have tokens — use them instead of picking a palette hue:
>   - error / danger → `destructive`
>   - info / primary action → `info`
>   - success / passed → `success`
>   - warning / degraded → `warning`
> - These tokens flip automatically between light and dark. Do not hand-roll
>   dark variants like `text-sky-700 dark:text-sky-300`; write `text-info` once.

`features/logs/` is the **only** feature in `apps/web` that breaks this. A
repo-wide grep for raw palette classes returns exactly 15 hits, and all 15 are
in three logs files. Every other feature — chat, search, editor, git, workbench,
settings, terminal, address, menus, chat-mode — is clean.

Verify that claim yourself before starting:

```bash
cd /Users/shaul/Desktop/D/platform
grep -rEn "(bg|text|border|ring|from|to)-(blue|red|green|yellow|amber|emerald|sky|slate|zinc|gray|neutral|stone|rose|orange|indigo|violet|purple|pink|teal|cyan|lime)-[0-9]" \
  apps/web/src packages/ui/src packages/tree/src --include="*.tsx" --include="*.ts"
```

→ expect 15 lines, all under `apps/web/src/features/logs/`.

The concrete cost: the log panel does not respond to the theme, and
`log-formatters.ts` hand-rolls `dark:` variants that the tokens already handle.
The fix is small, mechanical, and deletes code.

## Current state

Three files, 15 violations.

### 1. `apps/web/src/features/logs/log-formatters.ts:38-53`

```ts
export function logLevelClass(level: LogDashboardLevel) {
  if (level === 'error') return 'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-300'
  if (level === 'warn')
    return 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (level === 'debug') return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'

  return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
}

export function logLevelDotClass(level: LogDashboardLevel) {
  if (level === 'error') return 'bg-red-500'
  if (level === 'warn') return 'bg-amber-500'
  if (level === 'debug') return 'bg-sky-500'

  return 'bg-emerald-500'
}
```

These two are the textbook case: three hand-rolled `dark:` variants that exist
only because the palette does not flip.

### 2. `apps/web/src/features/logs/logs-timeline-bar.tsx:17-23`

```tsx
        className={cn(
          'w-full border-t transition-colors',
          tone === 'error' && 'border-red-400 bg-red-500/45',
          tone === 'warn' && 'border-amber-400 bg-amber-500/45',
          tone === 'slow' && 'border-sky-400 bg-sky-500/45',
          tone === 'ok' && 'border-emerald-400/70 bg-emerald-500/30',
        )}
        style={{ height }}
```

### 3. `apps/web/src/features/logs/logs-timeline-metric.tsx:13-18`

```tsx
        className={cn(
          'truncate font-mono text-[13px] leading-4 text-foreground tabular-nums',
          tone === 'error' && 'text-red-500',
          tone === 'warn' && 'text-amber-500',
          tone === 'slow' && 'text-sky-500',
        )}
```

### The tokens that exist

Defined in `packages/ui/src/styles/globals.css`. The `@theme inline` block at
lines 34–44 maps them to Tailwind color utilities:

```css
--color-destructive: var(--destructive);
--color-info: var(--info);
--color-info-foreground: var(--info-foreground);
--color-success: var(--success);
--color-success-foreground: var(--success-foreground);
--color-warning: var(--warning);
--color-warning-foreground: var(--warning-foreground);
```

Light values (`:root`, lines 122–128) and dark values (`.dark`, lines 279–285):

```css
/* :root */ /* .dark */
--destructive: oklch(0.55 0.17 18);
--destructive: oklch(0.74 0.145 18);
--info: oklch(0.55 0.17 230);
--info: oklch(0.74 0.145 230);
--success: oklch(0.55 0.17 165);
--success: oklch(0.74 0.145 165);
--warning: oklch(0.7 0.155 92);
--warning: oklch(0.82 0.14 92);
```

The hue families line up with what logs is hand-picking today: red≈18,
amber≈92, sky≈230, emerald≈165. So this is a near-exact color-preserving swap,
not a redesign.

`AGENTS.md` also confirms opacity modifiers work on tokens:

> A token works with opacity and every utility: `bg-success/10`,
> `border-warning/30`, `ring-info`.

### The mapping to use

| logs tone / level | token         | reason                     |
| ----------------- | ------------- | -------------------------- |
| `error`           | `destructive` | error / danger             |
| `warn`            | `warning`     | warning / degraded         |
| `debug`, `slow`   | `info`        | both render sky/blue today |
| `ok`, default     | `success`     | both render emerald today  |

## Commands you will need

| Purpose         | Command                                | Expected on success |
| --------------- | -------------------------------------- | ------------------- |
| Typecheck (web) | `cd apps/web && bun run typecheck`     | exit 0              |
| Test (web)      | `cd apps/web && bun run test`          | all pass            |
| Lint (web)      | `cd apps/web && bun run lint`          | exit 0              |
| Format          | `cd apps/web && bun run format`        | exit 0              |
| Full verify     | `bun run verify` (repo root)           | exit 0              |
| Dev server      | already running — **do not start one** | see note below      |

**A dev server is always running in this repo** (`AGENTS.md`: "Never spin up your
own server to test or verify changes — reuse the running one"). Use it for the
visual check in Step 4. It serves on `http://localhost:5173`.

## Scope

**In scope** (the only files you may modify):

- `apps/web/src/features/logs/log-formatters.ts`
- `apps/web/src/features/logs/logs-timeline-bar.tsx`
- `apps/web/src/features/logs/logs-timeline-metric.tsx`

(If plan 010 has already run, these are `utils/formatters.ts`,
`components/timeline-bar.tsx`, `components/timeline-metric.tsx`.)

**Out of scope** (do NOT touch):

- `packages/ui/src/styles/globals.css` — every token this plan needs already
  exists. You are **not** adding a token. If you believe one is missing, that is
  a STOP condition, not a reason to edit globals.css.
- Any other file in `features/logs/` — including `logs-event-row.tsx`, which
  merely _calls_ `logLevelClass`/`logLevelDotClass` and needs no change because
  the function signatures are unchanged.
- Any layout, spacing, sizing, typography, or structural change. This plan
  changes **color classes only**. Do not "improve" the timeline bar while you
  are in there.
- Renaming or moving files (that is plan 010's job).
- The `title={timelineTitle(bucket)}` native tooltip at
  `logs-timeline-bar.tsx:15` — replacing it with the `Tooltip` primitive is a
  real improvement but it is a different change with different risk. Leave it.

## Git workflow

Per the operator rule in `plans/README.md`: **all work happens on `main`** — no
new branches, worktrees, or PRs unless the operator explicitly asks.

Conventional commits. Example subject for this change:

```
fix(logs): the log panel reads the theme tokens like every other feature
```

One commit is fine; this is a small change.

## Steps

### Step 1: Convert `log-formatters.ts`

Replace the two functions' return values using the mapping table. Target shape:

```ts
export function logLevelClass(level: LogDashboardLevel) {
  if (level === 'error') return 'border-destructive/50 bg-destructive/10 text-destructive'
  if (level === 'warn') return 'border-warning/50 bg-warning/10 text-warning'
  if (level === 'debug') return 'border-info/40 bg-info/10 text-info'

  return 'border-success/35 bg-success/10 text-success'
}

export function logLevelDotClass(level: LogDashboardLevel) {
  if (level === 'error') return 'bg-destructive'
  if (level === 'warn') return 'bg-warning'
  if (level === 'debug') return 'bg-info'

  return 'bg-success'
}
```

Three things to note:

1. **The `dark:` variants are deleted, not translated.** `text-red-600
dark:text-red-300` becomes `text-destructive` — one class. The token already
   flips. Deleting them is the point of the change; if you find yourself writing
   `dark:` anywhere in this plan, stop and re-read.
2. **Keep the opacity modifiers exactly as they are** (`/50`, `/10`, `/40`,
   `/35`). They carry the visual weight and they work identically on tokens.
3. **Do not change the branch structure or the function signatures.** The guard
   clauses and early returns match the repo's never-nester rule; leave them.

**Verify**:

```bash
grep -nE "(red|amber|sky|emerald)-[0-9]|dark:" apps/web/src/features/logs/log-formatters.ts
```

→ no output.

### Step 2: Convert `logs-timeline-bar.tsx`

```tsx
        className={cn(
          'w-full border-t transition-colors',
          tone === 'error' && 'border-destructive bg-destructive/45',
          tone === 'warn' && 'border-warning bg-warning/45',
          tone === 'slow' && 'border-info bg-info/45',
          tone === 'ok' && 'border-success/70 bg-success/30',
        )}
```

The source uses `-400` for borders and `-500` for backgrounds — two different
palette steps. Tokens have one step, so the border loses its lighter shade.
Preserve the _relationship_ by keeping the `ok` border at `/70` as written; for
the other three, a full-opacity token border reads correctly against the
`/45` fill. If the result looks too heavy in Step 4, dial the borders to `/70`
uniformly — that is the one visual judgment this plan permits.

Leave `style={{ height }}` alone. `AGENTS.md` allows inline styles "for values
that must be computed at runtime (dynamic positions, measured sizes)", and a
percentage bar height is exactly that.

**Verify**:

```bash
grep -nE "(red|amber|sky|emerald)-[0-9]" apps/web/src/features/logs/logs-timeline-bar.tsx
```

→ no output.

### Step 3: Convert `logs-timeline-metric.tsx`

```tsx
        className={cn(
          'truncate font-mono text-[13px] leading-4 text-foreground tabular-nums',
          tone === 'error' && 'text-destructive',
          tone === 'warn' && 'text-warning',
          tone === 'slow' && 'text-info',
        )}
```

Leave `tabular-nums` in place — it is required here (`AGENTS.md`:
"`tabular-nums` should be the default for any number that updates") and this
component renders a live-updating count at line 20.

**Verify**:

```bash
grep -nE "(red|amber|sky|emerald)-[0-9]" apps/web/src/features/logs/logs-timeline-metric.tsx
```

→ no output.

### Step 4: Verify visually in both themes

The logs panel is reachable in the running app. Open the log panel, then check
**both light and dark**:

- Level badges (`logLevelClass`) — error/warn/debug/info are still visually
  distinguishable from each other and legible against the panel background.
- Level dots (`logLevelDotClass`) at `logs-event-row.tsx:86` — still visible at
  `size-1.5`.
- Timeline bars — the four tones still read as distinct.
- Timeline metrics — the error/warn/slow numbers still stand out from the plain
  `Events` count.

This step is a real gate, not a formality: a token swap can silently collapse
two tones into near-identical colors, and no automated check will catch it.
`debug` → `info` and `ok`/default → `success` are the pairs most worth
eyeballing, because the default (`info` log level) renders **green** today —
which is odd but is the existing behavior, and this plan preserves it rather
than redesigning it.

**Verify**: all four tones distinguishable in light mode and in dark mode.

### Step 5: Full verify

```bash
cd apps/web && bun run format && bun run lint && bun run test
cd /Users/shaul/Desktop/D/platform && bun run verify
```

**Verify**: all exit 0.

## Test plan

**No new tests.** There is no meaningful unit test for "this class name is a
token" that would not just restate the implementation, and the repo has no
visual-regression harness today. The real gate is Step 4's two-theme check plus
the repo-wide grep in the done criteria.

Existing tests that must still pass unchanged: the five suites in
`apps/web/src/features/logs/tests/` (`log-filter-params`, `log-live-batcher`,
`log-live-cache`, `log-row-interactions`, `log-toolbar-options`). None of them
assert on class names, so they should be unaffected — if one fails, that is a
STOP condition.

Verification: `cd apps/web && bun run test` → all pass, same count as before.

## Done criteria

ALL must hold:

- [ ] The repo-wide palette grep returns **zero** results:
      `bash
    grep -rEn "(bg|text|border|ring|from|to)-(blue|red|green|yellow|amber|emerald|sky|slate|zinc|gray|neutral|stone|rose|orange|indigo|violet|purple|pink|teal|cyan|lime)-[0-9]" \
      apps/web/src packages/ui/src packages/tree/src --include="*.tsx" --include="*.ts" | wc -l
    `
      → `0`
- [ ] `grep -rn "dark:" apps/web/src/features/logs/ | wc -l` → `0`
- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run test` exits 0, same test count as before
- [ ] `bun run verify` exits 0 from the repo root
- [ ] `packages/ui/src/styles/globals.css` is unmodified (`git status`)
- [ ] Exactly three files changed (`git diff --name-only` → the three in scope)
- [ ] The diff contains only class-name strings — no structural, layout, or
      logic changes
- [ ] Step 4's visual check passed in **both** light and dark
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The repo-wide palette grep returns hits **outside** `features/logs/` before you
  start. That means new violations landed since this plan was written and the
  scope is wrong.
- A token in the mapping table does not exist in `globals.css` (check the
  `@theme inline` block at lines 34–44). Do **not** add one — report it.
- The visual check in Step 4 shows two tones that are no longer
  distinguishable. Report which pair; do not invent a new color to separate them
  and do not add a token.
- Any test in `features/logs/tests/` fails — they do not assert class names, so a
  failure means something unexpected is coupled to these strings.
- You find yourself needing to edit `logs-event-row.tsx` or any fourth file. The
  two formatter functions keep their signatures, so no caller should need
  touching.

## Maintenance notes

- After this lands, `apps/web` has **zero** raw palette colors. That makes the
  grep in the done criteria a cheap invariant worth enforcing — consider adding
  it to CI as a one-line guard. That is deliberately not in this plan (it is a
  CI change, not a logs change), but it is what keeps the property true.
- A reviewer should check one thing: that no `dark:` variant survived. The
  presence of a `dark:` next to a token is the tell that someone translated
  instead of deleting.
- **Deliberately preserved oddity**: the `info` log level renders with the
  `success` (green) token, because that is what `emerald-500` did before. That
  is probably a design mistake — `info` level rendering green while `debug`
  renders blue is not obvious — but changing it is a design decision, not a
  refactor. Flag it to the maintainer rather than fixing it here.
- **Deferred**: `logs-timeline-bar.tsx:15` uses a native `title` attribute for
  its tooltip instead of the `Tooltip` primitive from `@workspace/ui`. Native
  `title` has a ~1s browser-controlled delay, no styling, and no keyboard
  support. Worth fixing, but it is interaction work, not theming.
- If plan 010 runs after this one, these three files get renamed; the color
  classes travel with them and nothing here needs redoing.
