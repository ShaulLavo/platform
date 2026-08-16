# Plan 024: Four design-engineering one-liners

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat ace313f..HEAD -- \
>   packages/ui/src/components/sonner.tsx \
>   apps/web/src/features/workbench/components/editor-tab-button.tsx \
>   apps/web/src/features/workbench/components/diagnostics-panel.tsx \
>   apps/web/src/features/workbench/components/tests/editor-tab-bar.test.tsx \
>   apps/web/src/features/chat/components/message-bubble.tsx \
>   apps/web/src/features/chat/components/tests/message-bubble.test.tsx
> ```
>
> Expected: **empty output**. Then check for _uncommitted_ drift too:
>
> ```bash
> git status --porcelain -- \
>   packages/ui/src/components/sonner.tsx \
>   apps/web/src/features/workbench/components/editor-tab-button.tsx \
>   apps/web/src/features/workbench/components/diagnostics-panel.tsx \
>   apps/web/src/features/workbench/components/tests/editor-tab-bar.test.tsx \
>   apps/web/src/features/chat/components/message-bubble.tsx \
>   apps/web/src/features/chat/components/tests/message-bubble.test.tsx
> ```
>
> Expected: **empty output**. If either command prints anything, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **The rest of the working tree is expected to be dirty.** At planning time
> ~20 unrelated files (settings, editor, `plans/009-*.md`) carried uncommitted
> work. That is someone else's WIP. Never stage it, never revert it, and never
> run a repo-wide formatter over it — see "Commands you will need".

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: design
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

This repo has a carefully tuned oklch status ramp (`destructive` 18, `warning`
92, `success` 165, `info` 230, at matched lightness/chroma, with a comment in
the CSS explaining the tuning) and a documented rule that every status color
must resolve to one of those tokens. Four surfaces never got the memo, and they
are not obscure ones: **toasts** (the app's loudest status channel — every
settings-save failure, git failure and clipboard failure lands there) render in
sonner's stock shadcn red/green; **editor tabs** (the most-clicked chrome in the
app) have no hover feedback at all and declare a CSS transition on a
`background-color` that nothing ever sets; the **diagnostics panel** — whose
entire job is severity — paints Errors, Warnings, Info and Hints in identical
neutral type; and the **assistant copy button** is a focusable, clickable,
fully-transparent tab stop rendered once per visible assistant turn.

This plan closes theme **T7 — "Design system stops at the token definition"**
from `plans/README.md`. Each of the four fixes is independent, small, and
revertable on its own. Total: roughly half a day.

## Current state

### File roles

Line markers written as `// :NN` or `{/* :NN */}` inside the excerpts below are
**annotations added by this plan**, not text present in the source. Never copy
them into the files.

| File                                                               | Role                                                                                                                                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/components/sonner.tsx`                            | The app's only `Toaster`. Wraps sonner's `Toaster` with theme CSS variables. Rendered once, at `apps/web/src/main.tsx:87`, via `apps/web/src/components/theme-aware-toaster.tsx`. |
| `apps/web/src/features/workbench/components/editor-tab-button.tsx` | One editor tab. The only place a tab's classes are decided — it exposes no `className` prop, so no caller can inject one.                                                         |
| `apps/web/src/features/workbench/components/diagnostics-panel.tsx` | The Problems panel. Live in two places: `workbench/components/bottom-panel.tsx:51` and `chat-mode/components/tool-pane.tsx:77`.                                                   |
| `apps/web/src/features/chat/components/message-bubble.tsx`         | One chat message. The assistant meta row (timestamp + copy button) lives at lines 163–179.                                                                                        |

### Excerpt 1 — `packages/ui/src/components/sonner.tsx` (whole file, 46 lines)

```tsx
import type { CSSProperties } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { cn } from '@workspace/ui/lib/utils'

type ToastThemeStyle = CSSProperties & Record<`--${string}`, string>

const toastThemeStyle = {
  // :8
  '--normal-bg': 'var(--popover)',
  '--normal-border': 'var(--border)',
  '--normal-border-hover': 'var(--border)',
  '--normal-bg-hover': 'var(--muted)',
  '--normal-text': 'var(--popover-foreground)',
  '--border-radius': 'var(--radius-md)',
} satisfies ToastThemeStyle // :15

export function Toaster({
  className,
  closeButton = true,
  richColors = true, // :20
  style,
  theme = 'system',
  toastOptions,
  ...props
}: ToasterProps) {
  const classNames = toastOptions?.classNames

  return (
    <Sonner
      closeButton={closeButton}
      className={cn('toaster group', className)}
      richColors={richColors} // :32
      style={{ ...toastThemeStyle, ...style }} // :33
      theme={theme}
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...classNames,
          toast: cn('surface-vibrancy', classNames?.toast),
          error: cn('border-destructive/40', classNames?.error), // :40
        },
      }}
      {...props}
    />
  )
}
```

**What is wrong.** `richColors` defaults to `true`, which switches sonner to a
status palette driven by CSS custom properties that this repo never defines.
Verified against the installed sonner 2.0.7
(`node_modules/.bun/sonner@2.0.7+*/node_modules/sonner/dist/styles.css`), whose
rules are exactly:

```css
[data-sonner-toaster][data-sonner-theme='light'] {
  --success-bg: hsl(143, 85%, 96%);
  --success-border: hsl(145, 92%, 87%);
  --success-text: hsl(140, 100%, 27%);
  --info-bg: hsl(208, 100%, 97%);
  --info-border: hsl(221, 91%, 93%);
  --info-text: hsl(210, 92%, 45%);
  --warning-bg: hsl(49, 100%, 97%);
  --warning-border: hsl(49, 91%, 84%);
  --warning-text: hsl(31, 92%, 45%);
  --error-bg: hsl(359, 100%, 97%);
  --error-border: hsl(359, 100%, 94%);
  --error-text: hsl(360, 100%, 45%);
}
/* …a matching dark block… */
[data-rich-colors='true'][data-sonner-toast][data-type='error'] {
  background: var(--error-bg);
  border-color: var(--error-border);
  color: var(--error-text);
}
/* …identical rules for success / info / warning, and for their [data-close-button] … */
```

`toastThemeStyle` sets only the `--normal-*` family, so **every** error, success,
warning and info toast in the app renders in those stock hsl values. Grep over
both repo stylesheets (`packages/ui/src/styles/globals.css`,
`packages/ui/src/styles/shadcn-tailwind.css`) finds no `[data-sonner-toast]` or
`--error-bg`-style override compensating for it.

Two mechanics you need in order to reason about this correctly:

1. **The inline `style` wins.** `style={{ ...toastThemeStyle, ...style }}` lands
   on the same `<ol data-sonner-toaster>` element that sonner's
   `[data-sonner-toaster][data-sonner-theme='…']` rule targets. Inline
   declarations beat stylesheet declarations, which is why `--normal-bg` already
   works today. Adding `--error-bg` etc. to the same object is therefore
   sufficient — no CSS file needs touching.
2. **Sonner's CSS is unlayered and therefore beats Tailwind utilities.** Sonner
   injects its stylesheet at runtime with a plain `document.createElement('style')`
   (`dist/index.mjs:2-9`), i.e. outside any `@layer`. Tailwind v4 emits utilities
   inside `@layer utilities`, and unlayered declarations win over layered ones
   regardless of specificity. Consequence: the `error: cn('border-destructive/40', …)`
   entry at `sonner.tsx:40` is **already dead** — sonner's
   `border-color: var(--error-border)` overrides it. Setting `--error-border`
   is what actually paints the border, so that entry gets deleted rather than
   kept.

Toasts also carry `surface-vibrancy` (via `classNames.toast`), a utility whose
material is a `background-image` stack. Sonner's rich-color rule uses the
`background` _shorthand_, which resets `background-image` — so status toasts
already lose the wallpaper layer today and keep only the `backdrop-filter`.
That is unchanged by this plan; keeping the fill translucent (see step 1) is
what preserves real glass under it.

### Excerpt 2 — `apps/web/src/features/workbench/components/editor-tab-button.tsx:51-70`

```tsx
  const trigger = (
    <button
      {...dragAttributes}
      {...dragListeners}
      aria-selected={tab.active}
      className={cn(
        'group/proof-tab flex h-9 w-36 min-w-24 max-w-48 shrink-0 cursor-grab touch-none items-center gap-1.5 rounded-t-md border px-2 text-left text-xs shadow-sm outline-none transition-[background-color,border-color,opacity,box-shadow] active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-ring/50',   // :57
        tab.active ? 'border-border text-foreground' : 'border-transparent text-muted-foreground',   // :58
        dragging && 'relative z-10 opacity-60',
      )}
      data-editor-tab-id={tab.id}
      data-editor-tab-path={tab.path}
      draggable={false}
      ref={buttonRef}
      role='tab'
      style={dragStyle}
      title={tab.title}
      type='button'
      onClick={handleSelectTab}
    >
```

**What is wrong.** Of the four properties in
`transition-[background-color,border-color,opacity,box-shadow]`, two are inert:
no `bg-*` utility appears anywhere in the file, and `shadow-sm` is static across
both states. There is no `hover:` of any kind. The entire active/inactive
distinction is a 1px border plus a text-color shift, in a theme where
`--border` in dark mode is `oklch(1 0 0 / 10%)` — a hairline at 10% alpha. The
only thing that reacts to hovering a tab is the close button fading in
(`tab-trailing-slot.tsx:64`), so pointing at a tab moves an icon but never
confirms which tab is under the cursor.

Surrounding surfaces you need for color choices:

- `code-panel.tsx:39` — the pane that hosts the strip is `bg-card-solid/95`.
- `editor-tab-bar.tsx:60` — the strip itself is
  `'no-scrollbar border-border flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b px-2 pt-1'`
  — a bottom border and nothing else. The background is not supplied one level up.

### Excerpt 3 — `apps/web/src/features/workbench/components/diagnostics-panel.tsx:57-122`

```tsx
  return (
    <div className='min-h-0 flex-1 overflow-auto p-3 text-xs'>
      <div className='text-muted-foreground mb-3 truncate'>{source.filePath}</div>
      <div className='grid grid-cols-4 gap-2'>                                   {/* :60 */}
        {renderDiagnosticCount('Errors', diagnostics.counts.error)}              {/* :61 */}
        {renderDiagnosticCount('Warnings', diagnostics.counts.warning)}
        {renderDiagnosticCount('Info', diagnostics.counts.information)}
        {renderDiagnosticCount('Hints', diagnostics.counts.hint)}                {/* :64 */}
      </div>
      {renderDiagnosticList({ … })}
    </div>
  )
}

function renderDiagnosticCount(label: string, value: number) {                   // :76
  return (
    <div className='rounded border px-2 py-1' key={label}>                       // :78
      <div className='text-muted-foreground'>{label}</div>
      <div className='text-foreground font-medium tabular-nums'>{value}</div>    // :80
    </div>
  )
}
```

and the list rows:

```tsx
<li className='rounded border' key={diagnosticKey(diagnostic, index)}>
  {' '}
  {/* :104 */}
  <button
    className='hover:bg-muted/55 focus-visible:ring-ring/50 block w-full rounded px-2 py-2 text-left outline-none focus-visible:ring-1'
    type='button'
    onClick={() => onOpenDiagnostic(target)}
    onFocus={() => onPreviewDiagnostic(target)}
    onMouseEnter={() => onPreviewDiagnostic(target)}
  >
    <div className='text-muted-foreground text-[11px]'>
      {' '}
      {/* :112 */}
      {diagnosticSeverityLabel(diagnostic.severity)}
    </div>
    <div className='text-foreground'>{diagnosticMessageText(diagnostic.message)}</div>
  </button>
</li>
```

and the severity discriminant, which already exists:

```tsx
function diagnosticSeverityLabel(severity: number | undefined) {
  // :139
  if (severity === 1) return 'Error'
  if (severity === 2) return 'Warning'
  if (severity === 3) return 'Information'
  if (severity === 4) return 'Hint'

  return 'Diagnostic'
}
```

**What is wrong.** All four counts are `text-foreground font-medium` in an
undifferentiated `grid-cols-4`, so a file with 40 errors and a file with 40
hints produce visually identical panels. Each row shows its severity as
muted 11px label text only: no icon, no color, no rule. Note the file does
**not** currently import `cn`.

### Excerpt 4 — `apps/web/src/features/chat/components/message-bubble.tsx:163-179`

```tsx
          {!user && assistantChrome.metaVisible ? (
            <div className='mt-1.5 flex items-center gap-2' data-assistant-message-meta='true'>
              <p className='text-muted-foreground/30 text-[10px] tabular-nums'>
                <AssistantMessageMeta … />
              </p>
              {assistantChrome.copyVisible && renderAssistantCopyButton ? (
                <div className='flex items-center opacity-0 transition-opacity duration-200 group-hover/assistant:opacity-100'>   {/* :174 */}
                  {renderAssistantCopyButton(assistantChrome.copyText ?? '')}                                                     {/* :175 */}
                </div>
              ) : null}
            </div>
          ) : null}
```

The `group/assistant` this refers to is set at `message-bubble.tsx:102`
(`assistant && 'group/assistant'`).

**What is wrong.** No `group-focus-within` counterpart and no
`pointer-events-none`, so the button stays focusable _and_ clickable while fully
transparent. `renderAssistantCopyButton` resolves through
`timeline-row.tsx:99` to `AssistantMessageCopyButton`, a real `<Button>` inside
a tooltip trigger (`assistant-message-copy-button.tsx:36-51`) with no
`tabIndex={-1}` — so tabbing through a transcript stops on an invisible control
once per rendered assistant turn. `duration-200` is also the app's only 200ms
transition (there are 8× `duration-100` and 5× `duration-150`), which reads as
lag on a hover-toolbar.

### The repo conventions that apply — quoted verbatim from `AGENTS.md`

The executor has not read `AGENTS.md`. These are the rules this plan is bound by:

> - Style with Tailwind classes and the `@workspace/ui` primitives. Do not write raw CSS or inline `style` props except for values that must be computed at runtime (dynamic positions, measured sizes).
> - Use theme tokens only. Color classes must resolve to a token: `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `bg-card`, `border-border`, etc.
> - Never use raw Tailwind palette colors (`bg-blue-600`, `text-red-500`, `text-sky-300`, `amber-*`, `emerald-*`) or hex/`oklch()` literals in components. They bypass theming and dark mode.
> - Status and diff colors have tokens — use them instead of picking a palette hue:
>   - error / danger → `destructive`
>   - info / primary action → `info`
>   - success / passed → `success`
>   - warning / degraded → `warning`
>   - diff added / removed → `diff-added` / `diff-removed`
> - These tokens flip automatically between light and dark. Do not hand-roll dark variants like `text-sky-700 dark:text-sky-300`; write `text-info` once.
> - A token works with opacity and every utility: `bg-success/10`, `border-warning/30`, `ring-info`.
> - Need a color with no token? Add it to `packages/ui/src/styles/globals.css` (light `:root`, `.dark`, and the `@theme inline` map) instead of inlining a palette class.
> - Opaque-on-purpose surfaces use the `-solid` utilities (`bg-background-solid`, `bg-card-solid`, ...). They deliberately ignore the user's transparency setting — use them for things that must never fade (e.g. switch thumbs, active tab fills).

Note the last bullet names **"active tab fills"** as the canonical `-solid` use
case — that is why step 2 uses `bg-background-solid`.

Also binding:

> - Do not use `else` after an early return.
> - Never use nested ternaries. Split the logic into `if` statements or a named helper.
> - Avoid manual React memoization. Do not add `memo`, `useMemo`, or `useCallback` for ordinary render values or callbacks.
> - A dev server is always running. Never spin up your own server to test or verify changes — reuse the running one.
> - Import `{ test, expect }` from `apps/web/test/fixtures.ts`, not from `vitest`, for app tests.
> - Use `render.tsx`; `renderWithProviders` mirrors the app's `main.tsx` provider stack.
> - Do not `mock.module` or `vi.mock` our server, client, or feature modules.

Both test files you touch already follow the last three rules — copy their
existing import block, do not invent one.

The theme tokens you will use, as they exist today in
`packages/ui/src/styles/globals.css` (light `:root` at lines 122–137, `.dark`
at 279–285):

| Token                  | Light                                                                           | Dark                                      |
| ---------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| `--destructive`        | `oklch(0.55 0.17 18)`                                                           | `oklch(0.74 0.145 18)`                    |
| `--info`               | `oklch(0.55 0.17 230)`                                                          | `oklch(0.74 0.145 230)`                   |
| `--success`            | `oklch(0.55 0.17 165)`                                                          | `oklch(0.74 0.145 165)`                   |
| `--warning`            | `oklch(0.7 0.155 92)`                                                           | `oklch(0.82 0.14 92)`                     |
| `--popover`            | `color-mix(in oklch, var(--popover-solid) var(--surface-opacity), transparent)` | same formula, `--popover-solid` redefined |
| `--popover-foreground` | `oklch(0.145 0.006 70)`                                                         | `oklch(0.985 0.006 70)`                   |
| `--background-solid`   | `oklch(1 0.006 70)`                                                             | `oklch(0.145 0.006 70)`                   |
| `--accent`             | translucent `--accent-solid` (`0.97` light / `0.269` dark)                      | —                                         |

## Commands you will need

| Purpose                            | Command                                                                                                                                        | Expected on success                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Typecheck everything               | `cd /Users/shaul/Desktop/D/platform && bun run typecheck`                                                                                      | exit 0, no errors                                                                     |
| Lint everything                    | `cd /Users/shaul/Desktop/D/platform && bun run lint`                                                                                           | exit 0 (warnings are printed and are pre-existing; only a non-zero exit is a failure) |
| Format check — `apps/web` files    | `cd /Users/shaul/Desktop/D/platform/apps/web && bun x oxfmt --check <paths relative to apps/web>`                                              | exit 0                                                                                |
| Format check — `packages/ui` files | `cd /Users/shaul/Desktop/D/platform/packages/ui && bun x oxfmt --check src/components/sonner.tsx`                                              | exit 0                                                                                |
| Auto-format a file you broke       | same command with `--write` instead of `--check`, **naming the exact files**                                                                   | exit 0                                                                                |
| Web tests (node + dom)             | `cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project node --project dom`                                             | 244+ files, 1764+ tests, all pass (~75 s)                                             |
| One web test file                  | `cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project dom src/features/chat/components/tests/message-bubble.test.tsx` | all pass                                                                              |
| Visual check                       | Open **http://localhost:5173** — a dev server is **already running**. Do NOT start one.                                                        | —                                                                                     |

**Never run `bun run format` or `bun run format:check` from the repo root, and
never run `oxfmt` with `.` or a directory as its argument.** Both were verified
at planning time: root `format:check` **already exits 1** on
`apps/web/src/features/settings/hooks/use-setting-inspection.ts`, an
out-of-scope file with someone else's uncommitted work. Running `bun run format`
would silently rewrite that WIP and every other dirty file in the repo. Always
pass the explicit in-scope paths, as the table shows.

Baselines measured at commit `ace313f` with the tree in its current dirty state:
`bun run typecheck` → exit 0. `bun run lint` → exit 0 (14 pre-existing warnings
in `packages/tree`, `keymap/commands.ts`, the settings widgets, `vitest.config.ts`
and `compare-saved-view.tsx` — none of them yours, do not fix them). `apps/web`
tests → 244 files / 1764 tests, all passing.

`packages/ui` has **no** `test` script (that gap is plan 013's job, not this
plan's). Do not add one. The gate for the sonner change is typecheck + lint +
scoped format + the visual check in step 1.

Do **not** use root `bun run test` as your gate. It fans out to `apps/server`,
whose suite currently opens and WAL-locks the developer's real
`~/.platform/fs-metadata.sqlite` (see `plans/013-test-baseline-repairs.md:31`) —
a known defect owned by plan 013 and unrelated to this work. Use the `apps/web`
command above.

## Scope

**In scope** (the only files you may modify):

- `packages/ui/src/components/sonner.tsx`
- `apps/web/src/features/workbench/components/editor-tab-button.tsx`
- `apps/web/src/features/workbench/components/diagnostics-panel.tsx`
- `apps/web/src/features/workbench/components/tests/editor-tab-bar.test.tsx`
- `apps/web/src/features/chat/components/message-bubble.tsx`
- `apps/web/src/features/chat/components/tests/message-bubble.test.tsx`
- `plans/README.md` (status row only, at the very end)

**Out of scope** (do NOT touch, even though they look related):

- `packages/ui/src/styles/globals.css` and
  `packages/ui/src/styles/shadcn-tailwind.css` — every color this plan needs
  already has a token (verified: `--color-destructive`, `--color-info`,
  `--color-success`, `--color-warning`, `--color-accent`,
  `--color-background-solid` are all in the `@theme inline` map). Adding one
  would mean the design decision was made wrong. The `* { @apply border-border }`
  base rule at `globals.css:472` is what makes `border-l-<token>` in step 3
  override only the left edge — do not touch it.
- `packages/ui/package.json` — do **not** add a `test` script so step 1 becomes
  testable. Plan 013 owns that, and a second runner config would collide with it.
- `apps/web/src/components/theme-aware-toaster.tsx` and
  `apps/web/src/main.tsx` — the `Toaster`'s mount point and theme wiring. Step 1
  changes the component's own defaults; the call site is already correct.
- `apps/web/src/lib/clipboard.ts` and
  `apps/web/src/features/workbench/utils/editor-tab-menu.ts` — step 1's visual
  check drives both (Copy Path → `toast.success('Copied path')`, and the
  `!navigator.clipboard?.writeText` guard → `toast.error(...)`). They are the
  _instrument_, not the subject. Read-only.
- `apps/web/src/features/logs/log-formatters.ts` — `logLevelDotClass` returns
  raw palette classes (`bg-red-500`, `bg-amber-500`, `bg-sky-500`,
  `bg-emerald-500`). It is cited below only as the _shape_ precedent for
  severity color; **do not copy its values**, and do not fix it here. Plan 016
  ("Move `features/logs/` onto the theme tokens") owns that file.
- `apps/web/src/features/workbench/components/tab-trailing-slot.tsx` — the
  reference implementation for the reveal-on-hover pattern. It is already
  correct. Read it, do not edit it.
- `apps/web/src/features/git/components/file-actions.tsx:10` and
  `apps/web/src/features/search/search-match-row.tsx:97` — the two other correct
  implementations of the same pattern. Read-only references.
- `apps/web/src/features/chat/components/assistant-message-copy-button.tsx` —
  the bug is in the **wrapper** in `message-bubble.tsx`, not in the button. The
  button's own classes are fine.
- `apps/web/src/features/chat/components/message-bubble.browser.tsx` — a
  `browser`-project test that asserts syntax-highlight colors. It does not touch
  the meta row. The `browser` project is known to hang at the RUN banner; do not
  run it and do not edit it.
- `hover:bg-muted/55` on the diagnostics list row
  (`diagnostics-panel.tsx:106`) and `bg-card-solid/95` on
  `code-panel.tsx:39` — pre-existing row/surface opacity values. Plan 041
  ("Row-state tokens") owns unifying those. Leave them exactly as they are.
- Any change to `richColors={richColors}` becoming `false`, or to the
  `surface-vibrancy` utility. Step 1 keeps richColors **on** and drives it
  through tokens.
- `packages/editor-*` — these are symlinks to a sibling checkout, never in scope
  for this repo's plans.
- The ~20 files already dirty in the working tree (settings, editor,
  `plans/009-*.md`, `apps/web/src/features/settings/utils/default-value.ts`).
  They are someone else's in-flight work. Do not format them, revert them,
  stage them, or "fix" the lint warnings they produce.

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks. If you are asked to commit, use
conventional commits with a lowercase descriptive subject. Real examples from
`git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

A fitting subject for this work: `fix(ui): put toasts, tabs, diagnostics and the copy button on the theme tokens`.

## Steps

Steps 1–4 are independent. Do them in order, but any one can be reverted alone
without breaking the others.

---

### Step 0: Record the working-tree baseline

The tree is already dirty with unrelated work, so "did I touch anything else?"
can only be answered against a snapshot taken _before_ you edit. Take it first:

```bash
cd /Users/shaul/Desktop/D/platform && git status --porcelain | sort > /tmp/plan-024-baseline.txt && wc -l < /tmp/plan-024-baseline.txt
```

→ prints a line count (59 at planning time — mostly untracked `plans/*.md`).
Whatever it prints is your baseline; step 5 compares against this file. Note
that `plans/README.md` is **already** ` M` at baseline, so editing it will not
show up as a new line — step 5 checks its content directly instead.

---

### Step 1: Drive sonner's rich colors through the theme tokens

Edit **`packages/ui/src/components/sonner.tsx`** only.

**1a.** Extend `toastThemeStyle` (currently lines 8–15) with the twelve status
variables. Keep the existing six `--normal-*`/`--border-radius` entries
untouched and unmoved. The result:

```tsx
const toastThemeStyle = {
  '--normal-bg': 'var(--popover)',
  '--normal-border': 'var(--border)',
  '--normal-border-hover': 'var(--border)',
  '--normal-bg-hover': 'var(--muted)',
  '--normal-text': 'var(--popover-foreground)',
  '--border-radius': 'var(--radius-md)',
  // richColors switches sonner to --{status}-bg/-border/-text. Left unset it
  // ships stock shadcn red/green, which bypasses the tuned oklch ramp on the
  // app's loudest status surface. Each status is the popover material with a
  // thin tint of its token mixed in, so a status toast keeps the same material
  // family as a normal one and only the hue changes.
  //
  // The mixes below are oklab, never oklch. The oklch space interpolates the
  // hue channel, and every surface token here sits at hue 70. Mixing 12% of
  // --info (hue 230) into it there rotates the result to hue ~89 and yields
  // yellow-green, not pale blue. Oklab has no hue channel, so a small mix just
  // tints toward the status color the way the eye expects.
  '--error-bg': 'color-mix(in oklab, var(--destructive) 12%, var(--popover))',
  '--error-border': 'color-mix(in oklab, var(--destructive) 45%, transparent)',
  '--error-text': 'color-mix(in oklab, var(--destructive) 70%, var(--popover-foreground))',
  '--success-bg': 'color-mix(in oklab, var(--success) 12%, var(--popover))',
  '--success-border': 'color-mix(in oklab, var(--success) 45%, transparent)',
  '--success-text': 'color-mix(in oklab, var(--success) 70%, var(--popover-foreground))',
  '--warning-bg': 'color-mix(in oklab, var(--warning) 12%, var(--popover))',
  '--warning-border': 'color-mix(in oklab, var(--warning) 45%, transparent)',
  '--warning-text': 'color-mix(in oklab, var(--warning) 70%, var(--popover-foreground))',
  '--info-bg': 'color-mix(in oklab, var(--info) 12%, var(--popover))',
  '--info-border': 'color-mix(in oklab, var(--info) 45%, transparent)',
  '--info-text': 'color-mix(in oklab, var(--info) 70%, var(--popover-foreground))',
} satisfies ToastThemeStyle
```

Why each formula:

- `-bg` keeps `var(--popover)` as the base, so the toast stays translucent and
  the `backdrop-filter` from `surface-vibrancy` still produces real glass. A
  solid status fill would go opaque and read as a foreign surface.
- `-border` at 45% alpha reproduces exactly what `border-destructive/40` was
  _trying_ to do at line 40, and now applies to all four states.
- `-text` mixes toward `--popover-foreground` because the raw tokens are tuned
  as fills, not as 13px body text: `--warning` is `oklch(0.7 …)` in light mode
  and is illegible on a pale tint. Mixing 30% of the foreground in darkens it
  in light mode and brightens it in dark mode, from one formula.

**1b.** Delete the now-dead error special case. Change:

```tsx
        classNames: {
          ...classNames,
          toast: cn('surface-vibrancy', classNames?.toast),
          error: cn('border-destructive/40', classNames?.error),
        },
```

to:

```tsx
        classNames: {
          ...classNames,
          toast: cn('surface-vibrancy', classNames?.toast),
        },
```

(`border-destructive/40` is a Tailwind utility inside `@layer utilities`;
sonner's unlayered `border-color: var(--error-border)` already overrides it, and
`--error-border` now carries the same value for all four states.)

**Verify (mechanical)**:

```bash
cd /Users/shaul/Desktop/D/platform && bun run typecheck && bun run lint
```

→ exit 0 (lint prints its 14 pre-existing warnings; ignore them).

```bash
cd /Users/shaul/Desktop/D/platform/packages/ui && bun x oxfmt --check src/components/sonner.tsx
```

→ exit 0. If it fails, re-run with `--write` **on that one path** and re-check.

```bash
cd /Users/shaul/Desktop/D/platform && grep -c "color-mix(in oklab" packages/ui/src/components/sonner.tsx
```

→ `12`

```bash
cd /Users/shaul/Desktop/D/platform && grep -n "border-destructive/40\|color-mix(in oklch" packages/ui/src/components/sonner.tsx
```

→ no output (exit 1). Both would be mistakes: the first means 1b was skipped,
the second means the wrong color space was used. (The pattern is
`color-mix(in oklch`, not bare `in oklch` — the comment you just wrote mentions
oklch in prose on purpose, and a bare pattern would match it.)

```bash
cd /Users/shaul/Desktop/D/platform && grep -c "70%, var(--popover-foreground)" packages/ui/src/components/sonner.tsx
```

→ `4`. All four `-text` mixes must share one number. (If you later exercise the
judgement call below and drop to `55%`, this becomes `grep -c "55%, var(--popover-foreground)"` → `4`; it must never be a mix of the two.)

**Verify (visual — required)**: at **http://localhost:5173** (already running).
Two toasts, both themes.

1. Right-click any editor tab → **Copy Path**. That routes through
   `use-editor-tab-menu.ts:18` → `copyTextToClipboard` → `toast.success('Copied path')`.
   Expected: a toast whose fill is a _faint green-tinted_ version of the normal
   popover glass, a green-tinted border, and legible green-leaning title text —
   **not** the flat mint-green `hsl(143, 85%, 96%)` block it renders today.
2. In DevTools console run `Object.defineProperty(navigator, 'clipboard', { value: undefined })`,
   then right-click a tab → **Copy Path** again. That hits the
   `if (!navigator.clipboard?.writeText)` guard in `apps/web/src/lib/clipboard.ts:10`
   and fires `toast.error('Clipboard is unavailable')`. Expected: the same
   treatment in the `destructive` hue. Reload the page afterwards to restore
   `navigator.clipboard`.
3. Repeat both in the other theme: **Settings → Appearance → `workbench.colorTheme`**
   (registry key at `packages/contracts/src/settings/keys.ts:29`; values
   `dark` / `light` / `system`).

Judgement call you are allowed to make: if the **warning** or **success** title
text looks too pale to read in **light** mode, lower the `-text` mix from `70%`
to `55%` for **all four** statuses (keep it one number — do not tune them
individually). Anything else, STOP.

---

### Step 2: Give editor tabs a real hover and active fill

Edit **`apps/web/src/features/workbench/components/editor-tab-button.tsx`** only.

Replace the `className={cn(...)}` block at lines 56–60 with:

```tsx
      className={cn(
        'group/proof-tab flex h-9 w-36 min-w-24 max-w-48 shrink-0 cursor-grab touch-none items-center gap-1.5 rounded-t-md border px-2 text-left text-xs outline-none transition-[background-color,border-color,opacity,box-shadow] active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-ring/50',
        tab.active
          ? 'border-border bg-background-solid text-foreground shadow-sm'
          : 'border-transparent text-muted-foreground shadow-none hover:bg-accent hover:text-accent-foreground',
        dragging && 'relative z-10 opacity-60',
      )}
```

Exactly three things changed:

1. `shadow-sm` moved **out** of the base string and into the active branch;
   inactive tabs get `shadow-none`. This is the one state cue that works in
   light mode, where `--background-solid` and `--card-solid` happen to be the
   same value (`oklch(1 0.006 70)`), so the fill alone is invisible there.
2. Active tabs get `bg-background-solid` — the token `AGENTS.md` names for
   "active tab fills". In dark mode this is `oklch(0.145)` against a
   `bg-card-solid/95` (`oklch(0.205)`) strip, so the active tab reads as
   _connected to the editor below_ and the inactive ones as recessed. This is
   the VS Code convention.
3. Inactive tabs get `hover:bg-accent hover:text-accent-foreground` — the same
   pair `bottom-panel.tsx:74` already uses for its active bottom-tab. Because
   inactive tabs rest at no background, the hover is unambiguous in both themes.

The transition list is now fully live: `background-color` (hover + active fill),
`border-color` (active border), `opacity` (dragging), `box-shadow` (active
elevation). Do **not** remove `box-shadow` from the list.

**Verify (mechanical)**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web/src/features/workbench/components && for c in bg-background-solid hover:bg-accent hover:text-accent-foreground shadow-none; do printf '%s: ' "$c"; grep -c -- "$c" editor-tab-button.tsx; done
```

→ `1` for every one of the four. (`grep -n` on all four at once returns **two**
lines, not four — `bg-background-solid` sits on the active branch and the other
three share the inactive branch. Count per class, not per line.)

```bash
cd /Users/shaul/Desktop/D/platform && grep -c "shadow-sm" apps/web/src/features/workbench/components/editor-tab-button.tsx
```

→ `1`, and it must be on the **active** branch line, not in the base string.
This is the "did the transition list go inert again" check.

```bash
cd /Users/shaul/Desktop/D/platform && bun run typecheck && bun run lint
```

→ exit 0.

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun x oxfmt --check src/features/workbench/components/editor-tab-button.tsx src/features/workbench/components/tests/editor-tab-bar.test.tsx
```

→ exit 0.

**Verify (test)**: add one test to
`apps/web/src/features/workbench/components/tests/editor-tab-bar.test.tsx`,
directly after the existing `'hides the horizontal tab strip scrollbar'` test.
The file's existing helpers `editorTabElement(container, id)` and `editorTabs()`
already give you an active `tab-a` and inactive `tab-b`/`tab-c`. Model the
assertion on the existing `expect(...).toHaveClass('no-scrollbar')` line.

```tsx
test('only the active tab carries a background fill, and inactive tabs react to hover', () => {
  const { container } = renderWithProviders(<TestEditorTabs tabs={editorTabs()} />)

  expect(editorTabElement(container, 'tab-a')).toHaveClass('bg-background-solid')
  expect(editorTabElement(container, 'tab-a')).not.toHaveClass('hover:bg-accent')
  expect(editorTabElement(container, 'tab-b')).not.toHaveClass('bg-background-solid')
  expect(editorTabElement(container, 'tab-b')).toHaveClass('hover:bg-accent')
})
```

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project dom src/features/workbench/components/tests/editor-tab-bar.test.tsx
```

→ all pass, 6 tests (5 existing + 1 new).

**Verify (visual)**: at http://localhost:5173, open at least three files so the
strip has three tabs. Hover an inactive tab → its background visibly fills and
its label brightens. The active tab is visibly distinct at rest. Check both
`light` and `dark` via Settings → Appearance.

---

### Step 3: Color the diagnostics panel by severity

Edit **`apps/web/src/features/workbench/components/diagnostics-panel.tsx`** only.

**3a.** Add the `cn` import (the file does not import it today). Put it with the
other `@workspace` imports at the top:

```tsx
import { cn } from '@workspace/ui/lib/utils'
```

**3b.** Give `renderDiagnosticCount` an options object with the LSP severity
number, and thread the tone through. Replace lines 60–64 and 76–83 with:

```tsx
<div className='grid grid-cols-4 gap-2'>
  {renderDiagnosticCount({ label: 'Errors', severity: 1, value: diagnostics.counts.error })}
  {renderDiagnosticCount({
    label: 'Warnings',
    severity: 2,
    value: diagnostics.counts.warning,
  })}
  {renderDiagnosticCount({
    label: 'Info',
    severity: 3,
    value: diagnostics.counts.information,
  })}
  {renderDiagnosticCount({ label: 'Hints', severity: 4, value: diagnostics.counts.hint })}
</div>
```

```tsx
function renderDiagnosticCount({
  label,
  severity,
  value,
}: {
  readonly label: string
  readonly severity: number
  readonly value: number
}) {
  return (
    <div
      className={cn('rounded border px-2 py-1', diagnosticTileClass(severity, value))}
      key={label}
    >
      <div className='text-muted-foreground'>{label}</div>
      <div className={cn('font-medium tabular-nums', diagnosticValueClass(severity, value))}>
        {value}
      </div>
    </div>
  )
}
```

The exact line wrapping of the four `renderDiagnosticCount(...)` calls is
oxfmt's decision, not yours — write them however and let `oxfmt --write` settle
it. What matters is the four `severity:` values: `1`, `2`, `3`, `4`, in that
order, matching Errors / Warnings / Info / Hints.

**3c.** Add three helpers next to the existing `diagnosticSeverityLabel`
(`:139`), written in that function's own guard-clause style — no `else` after a
return, no nested ternaries:

```tsx
/**
 * LSP severities: 1 error, 2 warning, 3 information, 4 hint. Hints have no
 * status token by design — the lowest severity should recede, not compete.
 */
function diagnosticValueClass(severity: number, value: number) {
  if (value === 0) return 'text-muted-foreground'
  if (severity === 1) return 'text-destructive'
  if (severity === 2) return 'text-warning'
  if (severity === 3) return 'text-info'

  return 'text-foreground'
}

function diagnosticTileClass(severity: number, value: number) {
  if (value === 0) return 'border-border'
  if (severity === 1) return 'border-destructive/30 bg-destructive/10'
  if (severity === 2) return 'border-warning/30 bg-warning/10'
  if (severity === 3) return 'border-info/30 bg-info/10'

  return 'border-border'
}

function diagnosticRuleClass(severity: number | undefined) {
  if (severity === 1) return 'border-l-destructive'
  if (severity === 2) return 'border-l-warning'
  if (severity === 3) return 'border-l-info'

  return 'border-l-border'
}
```

`bg-destructive/10` and `border-warning/30` are the exact idiom `AGENTS.md`
blesses: _"A token works with opacity and every utility: `bg-success/10`,
`border-warning/30`, `ring-info`."_ These are status **tints**, not surface
material — the separate "never hand-roll material with `/NN` opacity modifiers"
rule is about faking glass on `bg-background`/`bg-card`/`bg-popover`, and does
not apply here.

**3d.** Give each list row a severity rule. Change line 104 from:

```tsx
          <li className='rounded border' key={diagnosticKey(diagnostic, index)}>
```

to:

```tsx
          <li
            className={cn('rounded border border-l-2', diagnosticRuleClass(diagnostic.severity))}
            key={diagnosticKey(diagnostic, index)}
          >
```

Leave the row's severity label (`:112`, `text-muted-foreground text-[11px]`) and
its `hover:bg-muted/55` button exactly as they are — the rule alone carries the
color, and doubling it up on the label would be loud.

**Verify (mechanical)**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web/src/features/workbench/components
grep -c "text-destructive\|text-warning\|text-info" diagnostics-panel.tsx
grep -c "border-l-destructive\|border-l-warning\|border-l-info" diagnostics-panel.tsx
grep -c "bg-destructive/10\|bg-warning/10\|bg-info/10" diagnostics-panel.tsx
grep -c "if (value === 0)" diagnostics-panel.tsx
```

→ `3`, `3`, `3`, `2` on four lines. The last one is the negative case: **both**
helpers must short-circuit a zero count back to neutral, so an empty Errors tile
does not glow red.

```bash
cd /Users/shaul/Desktop/D/platform && grep -nE "(text|bg|border)-(red|amber|sky|emerald|yellow|green|blue|orange|rose)-[0-9]" apps/web/src/features/workbench/components/diagnostics-panel.tsx
```

→ no output (exit 1). Raw palette classes are banned.

```bash
cd /Users/shaul/Desktop/D/platform && bun run typecheck && bun run lint
```

→ exit 0.

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun x oxfmt --check src/features/workbench/components/diagnostics-panel.tsx
```

→ exit 0.

**Verify (visual)**: at http://localhost:5173, open a TypeScript file with a
real error in it (e.g. temporarily type a nonsense identifier in an open editor
tab, then undo — do **not** save), then open the bottom panel's **Problems**
tab. Expected: the Errors tile has a red-tinted fill, border and count; zero-count
tiles stay neutral; every list row has a colored left rule matching its severity.
Confirm in both `light` and `dark`.

No new automated test for this step. There is no existing `diagnostics-panel`
test file, and creating one would mean standing up a live
`EditorStatusBarSource` plus a language-server diagnostics summary — a fixture
several times larger than the change, testing Tailwind class strings. The
mechanical greps plus the visual check are the gate. Say so in your report.

---

### Step 4: Reveal the assistant copy button on focus, and stop it eating clicks

Edit **`apps/web/src/features/chat/components/message-bubble.tsx`** and its test.

**4a.** Replace line 174 with:

```tsx
                <div
                  className='pointer-events-none flex items-center opacity-0 transition-opacity duration-150 group-focus-within/assistant:pointer-events-auto group-focus-within/assistant:opacity-100 group-hover/assistant:pointer-events-auto group-hover/assistant:opacity-100'
                  data-assistant-copy-actions='true'
                >
```

This is the same class shape as `tab-trailing-slot.tsx:64`, which is the repo's
established treatment:

```
'pointer-events-none opacity-0 group-focus-within/proof-tab:pointer-events-auto group-focus-within/proof-tab:opacity-100 group-hover/proof-tab:pointer-events-auto group-hover/proof-tab:opacity-100'
```

Three changes: `group-focus-within/assistant:opacity-100` added (keyboard focus
now reveals the control it lands on), `pointer-events-none` added with a
hover/focus re-enable (an invisible control no longer swallows clicks aimed at
the message), and `duration-200` → `duration-150` (matching the 5 other
`duration-150` transitions in the app rather than being the sole 200ms one).
`pointer-events` does not affect tab order, so the button stays reachable by
keyboard and reveals itself when focused.

The `data-assistant-copy-actions='true'` attribute is a stable test hook,
matching the `data-assistant-message-meta='true'` convention two lines above.

Nothing else on that JSX element changes: the `{renderAssistantCopyButton(...)}`
child and the `assistantChrome.copyVisible && renderAssistantCopyButton`
condition around it stay exactly as they are.

**4b.** Extend the test helper in
`apps/web/src/features/chat/components/tests/message-bubble.test.tsx`. Its
current `renderBubble` is:

```tsx
function renderBubble(
  message: ReturnType<typeof chatMessage>,
  { showAssistantCopyButton = false }: { showAssistantCopyButton?: boolean } = {},
) {
  return renderWithProviders(
    withProviders(
      <MessageBubble message={message} showAssistantCopyButton={showAssistantCopyButton} />,
    ),
  )
}
```

Change it to accept and forward `renderAssistantCopyButton`:

```tsx
function renderBubble(
  message: ReturnType<typeof chatMessage>,
  {
    renderAssistantCopyButton,
    showAssistantCopyButton = false,
  }: {
    renderAssistantCopyButton?: (text: string) => ReactNode
    showAssistantCopyButton?: boolean
  } = {},
) {
  return renderWithProviders(
    withProviders(
      <MessageBubble
        message={message}
        renderAssistantCopyButton={renderAssistantCopyButton}
        showAssistantCopyButton={showAssistantCopyButton}
      />,
    ),
  )
}
```

`ReactNode` is already imported at the top of that file
(`import type { ReactNode } from 'react'`).

**4c.** Add one test, after the existing
`'only the terminal assistant message shows its metadata row'` test:

```tsx
test('the assistant copy button reveals on keyboard focus and never eats a click while hidden', () => {
  const { container } = renderBubble(chatMessage({ text: 'Done.' }), {
    renderAssistantCopyButton: (text) => <button type='button'>{`Copy ${text}`}</button>,
    showAssistantCopyButton: true,
  })

  const actions = container.querySelector<HTMLElement>('[data-assistant-copy-actions]')

  expect(actions).not.toBeNull()
  // The negative: hiding it must not have unmounted it.
  expect(actions?.querySelector('button')?.textContent).toBe('Copy Done.')
  expect(actions).toHaveClass('pointer-events-none')
  expect(actions).toHaveClass('group-focus-within/assistant:opacity-100')
  expect(actions).toHaveClass('group-focus-within/assistant:pointer-events-auto')
  expect(actions).toHaveClass('group-hover/assistant:pointer-events-auto')
})
```

Two notes on why this test is shaped that way:

- It injects a **plain `<button>`** rather than the real
  `AssistantMessageCopyButton`. The real one wraps a base-ui `Tooltip`, and
  base-ui components are unreliable under happy-dom (`ScrollArea` throws there
  because `getAnimations` is missing). The wrapper `<div>` is what this plan
  changed; the button is out of scope.
- It asserts **class presence**, not computed opacity. happy-dom does not run
  Tailwind, so `getComputedStyle(...).opacity` would be meaningless. Class
  assertions are the established level here — see
  `expect(screen.getByRole('tablist', …)).toHaveClass('no-scrollbar')` in
  `editor-tab-bar.test.tsx`.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project dom src/features/chat/components/tests/message-bubble.test.tsx
```

→ all pass, 9 tests (8 existing + 1 new).

```bash
cd /Users/shaul/Desktop/D/platform && grep -n "duration-200" apps/web/src/features/chat/components/message-bubble.tsx
```

→ no output (exit 1). `duration-200` appeared exactly once in the whole app
(this line); after step 4 the app has 8× `duration-100`, 6× `duration-150`,
0× `duration-200`.

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun x oxfmt --check src/features/chat/components/message-bubble.tsx src/features/chat/components/tests/message-bubble.test.tsx
```

→ exit 0.

Do **not** run `--project browser`; `message-bubble.browser.tsx` sits in the same
folder and that project is known to hang at the RUN banner.

**Verify (visual)**: at http://localhost:5173, open a chat thread with at least
one completed assistant turn. Click into the transcript and press `Tab`
repeatedly. When focus reaches a copy button it must become visible. With the
mouse away from any message, clicking the empty space to the right of an
assistant timestamp must not activate anything.

---

### Step 5: Full verification and index update

```bash
cd /Users/shaul/Desktop/D/platform && bun run typecheck && bun run lint
```

→ exit 0 for both.

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun x oxfmt --check \
  src/features/workbench/components/editor-tab-button.tsx \
  src/features/workbench/components/diagnostics-panel.tsx \
  src/features/workbench/components/tests/editor-tab-bar.test.tsx \
  src/features/chat/components/message-bubble.tsx \
  src/features/chat/components/tests/message-bubble.test.tsx
cd /Users/shaul/Desktop/D/platform/packages/ui && bun x oxfmt --check src/components/sonner.tsx
```

→ exit 0 for both.

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project node --project dom
```

→ all pass: 1766 tests (1764 baseline + the 2 new ones), 0 failures.

Now diff the working tree against the Step 0 baseline. This — not a bare
`git status` — is the "did I touch anything else" check, because the tree was
already dirty before you started:

```bash
cd /Users/shaul/Desktop/D/platform && git status --porcelain | sort | comm -13 /tmp/plan-024-baseline.txt -
```

→ exactly **six** lines, one per in-scope source file:
`packages/ui/src/components/sonner.tsx`,
`apps/web/src/features/workbench/components/editor-tab-button.tsx`,
`apps/web/src/features/workbench/components/diagnostics-panel.tsx`,
`apps/web/src/features/workbench/components/tests/editor-tab-bar.test.tsx`,
`apps/web/src/features/chat/components/message-bubble.tsx`,
`apps/web/src/features/chat/components/tests/message-bubble.test.tsx`.
`plans/README.md` is deliberately absent — it was already ` M` at baseline, so
its line is unchanged. Any seventh line, or any path not on that list, is an
out-of-scope edit — revert it before reporting.

```bash
cd /Users/shaul/Desktop/D/platform && git status --porcelain | sort | comm -23 /tmp/plan-024-baseline.txt -
```

→ **empty**. A non-empty result means a baseline file stopped being dirty, i.e.
you reverted or formatted someone else's work. Restore it.

Set plan 024's Status cell in `plans/README.md:60` to `DONE` — change only the
last cell of that one row:

```bash
cd /Users/shaul/Desktop/D/platform && grep -n "024-design-one-liners" plans/README.md
```

→ one line, ending `| P3 | S | — | DONE |`.

## Test plan

Two new tests, both class-presence assertions in existing files. No new test
files.

| File                                                                       | Test                                                                                      | Covers                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/workbench/components/tests/editor-tab-bar.test.tsx` | `only the active tab carries a background fill, and inactive tabs react to hover`         | Step 2 — active tab has `bg-background-solid`, inactive does not, inactive has `hover:bg-accent`. Model: the file's existing `expect(...).toHaveClass('no-scrollbar')` test.                                                                                                    |
| `apps/web/src/features/chat/components/tests/message-bubble.test.tsx`      | `the assistant copy button reveals on keyboard focus and never eats a click while hidden` | Step 4 — the wrapper has `pointer-events-none` plus both `group-focus-within/assistant:*` classes. Model: the file's existing `only the terminal assistant message shows its metadata row` test, which uses the same `renderBubble` helper and `container.querySelector` shape. |

**Steps 1 and 3 get no new test**, for the reasons given at the end of each of
those steps. Do not add one; say so in your report instead.

The existing `apps/web` suite (1764 passing tests at baseline) is the regression
gate for all four steps: none of these edits changes behavior, props, exports,
or DOM structure other than one added `data-` attribute.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck` (repo root) exits 0
- [ ] `bun run lint` (repo root) exits 0
- [ ] `bun x oxfmt --check` over the six in-scope paths (per workspace, as in step 5) exits 0. **Not** root `format:check` — it is red on out-of-scope WIP and always will be for this plan.
- [ ] `cd apps/web && bun --bun vitest run --project node --project dom` exits 0, reporting 1766 tests with the 2 new ones present and passing
- [ ] `grep -c "color-mix(in oklab" packages/ui/src/components/sonner.tsx` → `12`
- [ ] `grep -c "70%, var(--popover-foreground)" packages/ui/src/components/sonner.tsx` → `4` (or `55%` → `4` if the judgement call in step 1 was exercised; never a mix)
- [ ] `grep -n "border-destructive/40" packages/ui/src/components/sonner.tsx` → no output
- [ ] `grep -n "color-mix(in oklch" packages/ui/src/components/sonner.tsx` → no output
- [ ] `grep -c "bg-background-solid" apps/web/src/features/workbench/components/editor-tab-button.tsx` → `1`
- [ ] `grep -c "hover:bg-accent" apps/web/src/features/workbench/components/editor-tab-button.tsx` → `1`
- [ ] `grep -c "shadow-none" apps/web/src/features/workbench/components/editor-tab-button.tsx` → `1`
- [ ] `grep -c "if (value === 0)" apps/web/src/features/workbench/components/diagnostics-panel.tsx` → `2`
- [ ] `grep -nE "(text|bg|border)-(red|amber|sky|emerald|yellow|green|blue|orange|rose)-[0-9]" apps/web/src/features/workbench/components/diagnostics-panel.tsx` → no output
- [ ] `grep -n "duration-200" apps/web/src/features/chat/components/message-bubble.tsx` → no output
- [ ] All four visual checks confirmed in **both** `light` and `dark` at http://localhost:5173
- [ ] The two `comm` checks in step 5 pass: exactly the six in-scope source files are new relative to `/tmp/plan-024-baseline.txt`, and nothing that was dirty at baseline has changed state
- [ ] `grep -n "024-design-one-liners" plans/README.md` → one row ending `| DONE |`

## STOP conditions

Stop and report back (do not improvise) if:

- Either of the two drift-check commands prints anything (they are scoped to the
  six in-scope paths — a dirty tree elsewhere is expected and is _not_ a stop),
  or any "Current state" excerpt does not match the live file at the stated line.
- A status toast renders **beige, olive, or yellow-green** after step 1. That is
  the signature of `color-mix(in oklch, …)` rotating the hue toward the surface
  tokens' hue 70. Confirm you wrote `in oklab`; if you did and it still happens,
  stop — the theme has changed underneath this plan.
- After step 1, toasts render **opaque** (no content ghosting through). The
  `-bg` formulas must keep `var(--popover)` as the base; if a solid token slipped
  in, fix that. If they are still opaque with `var(--popover)`, stop — something
  changed `--surface-opacity` or the `surface-vibrancy` utility.
- After step 2, the active tab becomes _less_ distinguishable than before in
  either theme, or the drag ghost (`dragging && 'relative z-10 opacity-60'`)
  stops being visibly translucent while dragging a tab.
- `bun run lint` reports a React Compiler rule **error** (exit non-zero).
  Nothing in this plan touches hooks or render-time state; an error means you
  changed more than the plan asked. Pre-existing _warnings_ — the `no-new-array`
  ones in `packages/tree`, `set-state-in-effect` in the settings widgets,
  `exhaustive-deps` in `keymap/commands.ts` and `compare-saved-view.tsx` — are
  baseline noise. Never report them and never fix them.
- `bun run typecheck` fails. It was green at baseline over the same dirty tree,
  so a failure is yours. But if the error names a file you did not edit (the
  settings or editor WIP), stop — someone else's work landed mid-flight.
- `git status --porcelain` shows a file you did not intend to modify — most
  likely because a formatter was run without explicit paths. Restore it with
  `git checkout --` **only** if it was clean at baseline; if it was already
  dirty at baseline you have destroyed uncommitted work, so stop and say so
  loudly rather than trying to reconstruct it.
- A verification fails twice after one reasonable fix attempt.
- Fixing something appears to require editing `packages/ui/src/styles/globals.css`,
  `packages/ui/package.json`, `log-formatters.ts`, or any other out-of-scope file.
- You discover the assumption **"the inline `style` on the Toaster overrides
  sonner's own `[data-sonner-toaster][data-sonner-theme='…']` block"** is false —
  i.e. step 1's variables have no visible effect on a real toast.

## Maintenance notes

**What interacts with this later.**

- **Plan 015 (motion system)** will introduce `--duration-enter` /
  `--duration-exit` tokens. When it lands, the `duration-150` in step 4 and the
  `transition-[…]` list in step 2 are the first two call sites that should move
  onto those tokens. Leaving them as raw Tailwind durations here is deliberate —
  015 does not exist yet and inventing half of it would collide.
- **Plan 016 (logs theme tokens)** will replace `logLevelDotClass`'s raw palette
  classes. The `diagnosticValueClass` / `diagnosticRuleClass` helpers written in
  step 3 are the shape 016 should converge on — severity → token, guard clauses,
  no dark variants.
- **Plan 041 (row-state tokens)** will unify the ten different `hover:bg-*`
  values in the app. Step 2 deliberately picks `hover:bg-accent` (already used
  by `bottom-panel.tsx:74`) rather than inventing an eleventh, so 041 has one
  fewer value to reconcile. The `hover:bg-muted/55` left untouched in
  `diagnostics-panel.tsx:106` is 041's, not this plan's.
- **Plan 013 (test baseline)** will give `packages/ui` a `test` script. When it
  does, the sonner change becomes testable — a happy-dom render asserting the
  twelve custom properties land on the toaster element is a reasonable first
  test for that workspace.

**What a reviewer should scrutinize.**

1. The color space in step 1. `in oklab` vs `in oklch` is the single highest-risk
   detail in this plan and the failure mode (a beige "error" toast) is subtle
   enough to ship.
2. The light-mode readability of the `-text` mixes, particularly `warning`
   (`oklch(0.7 0.155 92)` is the palest token in the ramp). The plan permits
   lowering `70%` → `55%` uniformly; check the executor did not tune the four
   statuses to four different numbers.
3. That the transition list in step 2 is now fully backed by real state changes —
   the original bug was a transition list describing properties nothing set, and
   it would be easy to re-create it by, say, dropping `shadow-none` from the
   inactive branch.
4. That nothing outside the six in-scope files moved.

**Deliberately deferred.**

- **Turning `richColors` off and driving status entirely from
  `toastOptions.classNames`.** That would preserve the `surface-vibrancy`
  `background-image` layer (sonner's `background` shorthand currently resets it
  on status toasts) but requires arbitrary-variant selectors like
  `[&_[data-icon]]:text-destructive` to reach sonner's internal nodes. Higher
  complexity, uglier, and it fights the library. Revisit only if the flat-fill
  status toasts read as foreign next to the vibrant normal ones.
- **A severity dot on each diagnostics row** (matching
  `apps/web/src/features/logs/logs-event-row.tsx:86`).
  The left rule chosen in step 3 carries the same information with no extra
  element. If a future design pass wants icons per severity, the
  `diagnosticRuleClass` helper is where the mapping already lives.
- **Tinting the diagnostics row severity label** in addition to the rule. Two
  color cues on an 11px label is louder than the panel needs.
- **Anything about `--destructive-foreground`.** The token does not exist
  (light/dark define `--info-foreground`, `--success-foreground`,
  `--warning-foreground`, but no destructive counterpart). Nothing in this plan
  needs it; do not add it here.
