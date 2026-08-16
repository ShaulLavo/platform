# Plan 041: Row-state tokens and one empty/loading/error primitive

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
> cd /Users/shaul/Desktop/D/platform
> git diff --stat ace313f..HEAD -- \
>   packages/ui/src/styles/globals.css \
>   packages/ui/src/components/command.tsx \
>   packages/ui/src/components/skeleton.tsx \
>   apps/web/src/features/search \
>   apps/web/src/features/git \
>   apps/web/src/features/logs/logs-event-row.tsx \
>   apps/web/src/features/workbench/components/code-panel.tsx \
>   apps/web/src/features/workbench/components/diagnostics-panel.tsx \
>   apps/web/src/features/editor/components/language-server-references-pane.tsx \
>   apps/web/src/components/file-picker/list.tsx
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Baseline check (run second, before any edit)**:
>
> ```bash
> cd /Users/shaul/Desktop/D/platform
> git status --short > /tmp/041-baseline.txt && cat /tmp/041-baseline.txt
> ```
>
> At `ace313f` the working tree is **not** clean: it already carries unrelated
> modifications (settings, editor, contracts, `docs/settings-reference.md`,
> `bun.lock`) and every file under `plans/` — this plan included — is untracked.
> That is expected and is **not** yours to clean up, revert, or commit. Keep
> `/tmp/041-baseline.txt` — the "no out-of-scope files touched" check at the end
> is a diff against it, not against an empty `git status`.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none technically. **Land together with plans 015 (motion
  system) and 016 (logs theme tokens)** — 015 also edits
  `packages/ui/src/styles/globals.css` (it adds motion tokens; this plan adds
  color tokens, so they touch different blocks and do not conflict
  semantically), and 016 also edits `apps/web/src/features/logs/`. They are the
  same reviewer's batch. Order within the batch does not matter; if 016 has
  already run, `logs-event-row.tsx` is still untouched by it — 016's scope list
  explicitly excludes that file.
- **Category**: design
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

This closes half of **theme T7 — "the design system stops at the token
definition"** and part of **T3 — "no shared home for a 10-line utility → N
copies"** from `plans/README.md`.

**Half (a) — row states.** A list row is one control. The app spells it
seventeen ways. Counted at `ace313f`:

```bash
grep -rhoE "hover:bg-[a-z-]+(/[0-9]+)?" apps/web/src packages/ui/src packages/tree/src \
  --include="*.tsx" --include="*.ts" | sort | uniq -c | sort -rn
```

→ 17 distinct values. Seven of them are on list rows and are what this plan
unifies: `hover:bg-muted` (`search-result-file-header.tsx:32`),
`hover:bg-muted/35` (logs), `/55` (search, diagnostics, references), `/70` (git,
file picker), plus `bg-accent`, `bg-muted/60` and `bg-info/10` on the selected
side. The rest (`hover:bg-muted/50`, `hover:bg-input/50`,
`hover:bg-foreground/10`, `hover:bg-background/NN`, `hover:bg-primary/NN`,
`hover:bg-secondary/80`, `hover:bg-destructive/NN`, `hover:bg-transparent`,
`hover:bg-accent` on buttons) are buttons, badges, drag handles and chat
bubbles — explicitly out of scope, see the Scope section.

The sharpest defect is inside a single list. In the search results panel there
are three row types and **three different interaction treatments**:

| row type              | selected      | hovered             |
| --------------------- | ------------- | ------------------- |
| file group header     | `bg-muted/60` | `hover:bg-muted/55` |
| name-match row        | `bg-muted/60` | `hover:bg-muted/55` |
| **content-match row** | `bg-muted/60` | **nothing at all**  |

Two of those are a 5-percentage-point opacity delta, and the third row type —
the majority row type in any results list — gives the pointer no feedback
whatsoever.

The `/60` vs `/55` pair is worse than it looks in light mode. Work the token
arithmetic through: `--muted` is
`color-mix(in oklch, oklch(0.97 0.006 70) 80%, transparent)`, so it already
carries alpha `0.8`; Tailwind's `/60` multiplies that to `0.48` and `/55` to
`0.44`. Composited over the panel ground (L ≈ 1.0 in light mode) that gives
L ≈ 0.9856 for the selected row and L ≈ 0.9868 for the hovered one — a **0.12%
lightness difference**. The selected row and the hovered row are the same color
to the eye, and the selected row is barely distinguishable from the panel
itself. (That is arithmetic from the token definitions in
`packages/ui/src/styles/globals.css`, not a measurement — but it is arithmetic
you can check.)

Meanwhile git change rows hover at `bg-muted/70` and log rows, in a panel docked
right next to them, hover at `bg-muted/35` — exactly half the intensity. The
workbench reads as several apps stitched together.

**Half (b) — empty / loading / error.** Seven surfaces answer "there is nothing
here yet" seven different ways, at three type sizes and two alignments. Worse,
**two of them render the loading state through the same treatment as the empty
state**, so:

- `Loading Git` and `No Git repository` are typographically identical
  (`git/panel.tsx:33` and `:39`, both through `PanelShell`)
- `Diagnostics loading`, `Diagnostics unavailable` and `No problems reported`
  are typographically identical (`diagnostics-panel.tsx:132-136`)

The moment the app should feel responsive is indistinguishable from the moment
it has nothing to show. And `packages/ui/src/components/skeleton.tsx` — the
primitive that exists precisely to fix this — has **zero importers anywhere in
the repo**. The intent was written down and never wired.

After this plan: two tokens decide every row's hover and selected appearance,
one primitive renders every empty/error state, one primitive renders every
pending panel, and `Skeleton` finally has a consumer.

## Current state

Every excerpt below was read at `ace313f`. Confirm each before editing it.

### The rule you must honor (`AGENTS.md`, "Styling" — quoted verbatim)

The executor has not read `AGENTS.md`. These lines are binding:

> - Style with Tailwind classes and the `@workspace/ui` primitives. Do not write
>   raw CSS or inline `style` props except for values that must be computed at
>   runtime (dynamic positions, measured sizes).
> - Use theme tokens only. Color classes must resolve to a token:
>   `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`,
>   `bg-card`, `border-border`, etc.
> - Never use raw Tailwind palette colors (`bg-blue-600`, `text-red-500`,
>   `text-sky-300`, `amber-*`, `emerald-*`) or hex/`oklch()` literals in
>   components. They bypass theming and dark mode.
> - These tokens flip automatically between light and dark. Do not hand-roll
>   dark variants like `text-sky-700 dark:text-sky-300`; write `text-info` once.
> - A token works with opacity and every utility: `bg-success/10`,
>   `border-warning/30`, `ring-info`.
> - **Need a color with no token? Add it to
>   `packages/ui/src/styles/globals.css` (light `:root`, `.dark`, and the
>   `@theme inline` map) instead of inlining a palette class.**
> - Compose the shared primitives; do not restyle them ad-hoc or reach for a raw
>   `<button>`/`<input>` when a primitive exists.
> - Surface material is built into the theme: `bg-background`, `bg-card`,
>   `bg-popover`, `bg-muted`, `bg-accent` are already translucent via
>   `--surface-opacity`. Never hand-roll material with `/NN` opacity modifiers or
>   ad-hoc `backdrop-blur-*` on a surface.

That last bullet is the diagnosis of half (a): every one of the ten row values
is exactly the forbidden pattern — a `/NN` opacity modifier hand-rolled on a
surface token.

Also binding, from `AGENTS.md` "React Code" and "Code Organization":

> - One component per file. Do not export multiple components from one component
>   file.
> - Keep pure helpers out of component and hook files.
> - Import exact files through `@/`. Do not add barrel `index.ts` files.
> - Avoid manual React memoization. Do not add `memo`, `useMemo`, or
>   `useCallback` for ordinary render values or callbacks.

And from "Greenfield, No Backward Compatibility":

> - No backward compatibility shims, no legacy aliases, no deprecation windows.
>   Update every call site in the same pass.

That is why this plan **deletes** `PanelShell` and the three search state
components rather than leaving them as wrappers.

And from "Control Flow":

> - Never use nested ternaries. Split the logic into `if` statements or a named
>   helper.

A single non-nested ternary inside `cn(...)` is fine and is used throughout the
repo; nesting one inside another is not.

### (a) The row sites, exactly as they read today

`apps/web/src/features/search/search-match-row.tsx:52-59` — the **content**
match row. Note there is no hover class anywhere in this `cn`:

```tsx
      <div
        className={cn(
          'group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 overflow-hidden px-2 py-1.5 text-left text-xs',
          compact && 'h-6 gap-1 px-1.5 py-0',
          active && 'bg-muted/60',
          className,
        )}
      >
```

`apps/web/src/features/search/search-results-view.tsx:273-275` confirms no
hover arrives via `className` either — the wrapper only carries layout:

```tsx
      <div className={cn('ml-4 border-l', compact && 'ml-3')}>
        <SearchMatchRow
          active={active}
```

`apps/web/src/features/search/search-match-row.tsx:152-158` — the **name** match
row:

```tsx
        className={cn(
          'grid w-full min-w-0 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5 overflow-hidden px-2 py-1.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
          compact && 'h-6 grid-cols-[14px_minmax(0,1fr)_auto] gap-1 px-1.5 py-0',
          active && 'bg-muted/60',
          !active && 'hover:bg-muted/55',
          className,
        )}
```

`apps/web/src/features/search/search-file-group.tsx:35-41` — the group header,
the same pair copied:

```tsx
        className={cn(
          'grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5 px-2 py-1.5 text-left',
          compact && 'h-6 gap-1 overflow-hidden px-1.5 py-0',
          active && 'bg-muted/60',
          !active && 'hover:bg-muted/55',
          className,
        )}
```

`apps/web/src/features/search/search-result-file-header.tsx:29-33` — a **fifth**
convention in the same feature (`bg-accent` for selected):

```tsx
        className={cn(
          'grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 rounded-sm border-l border-transparent px-2 py-1.5 text-left',
          active && 'bg-accent',
          !active && 'hover:bg-muted',
        )}
```

`apps/web/src/components/file-picker/list.tsx:306-313` — a **hue** for selected
against a **neutral** for hover:

```tsx
      className={cn(
        'grid h-11 w-full grid-cols-[minmax(0,1fr)_80px_116px_74px] items-center gap-3 rounded-md px-1.5 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring/50 max-sm:grid-cols-[minmax(0,1fr)_68px]',
        'active:scale-[0.995] motion-reduce:active:scale-100',
        selected && 'bg-info/10 text-foreground',
        !selected && interactive && 'hover:bg-muted/70',
        !interactive && 'cursor-not-allowed text-muted-foreground/60',
        interactive && !pickable && 'text-muted-foreground/75',
      )}
```

`apps/web/src/features/git/components/file-row.tsx:42` — hover only, no
selected concept:

```tsx
className =
  'group/row hover:bg-muted/70 focus-visible:ring-ring/50 grid h-6 cursor-pointer grid-cols-[22px_minmax(0,1fr)_auto_28px] items-center px-2 text-xs leading-4 outline-none focus-visible:ring-1'
```

`apps/web/src/features/git/components/change-group.tsx:50`:

```tsx
className =
  'group/group hover:bg-muted/70 flex h-7 w-full items-center px-2 text-xs font-medium transition-colors'
```

`apps/web/src/features/logs/logs-event-row.tsx:74` — half the intensity of the
git rows in the panel next door:

```tsx
className =
  'hover:bg-muted/35 grid min-h-[54px] w-full cursor-pointer grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2 transition-colors'
```

`apps/web/src/features/workbench/components/diagnostics-panel.tsx:106`:

```tsx
className =
  'hover:bg-muted/55 focus-visible:ring-ring/50 block w-full rounded px-2 py-2 text-left outline-none focus-visible:ring-1'
```

`apps/web/src/features/editor/components/language-server-references-pane.tsx:132`
and `:174` — two rows, same value:

```tsx
className =
  'hover:bg-muted/55 focus-visible:ring-ring/50 grid h-7 w-full grid-cols-[14px_14px_minmax(0,1fr)_auto] items-center gap-1.5 px-2 text-left text-xs outline-none focus-visible:ring-1'
```

```tsx
className =
  'group hover:bg-muted/55 focus-visible:ring-ring/50 grid h-6 w-full grid-cols-[38px_minmax(0,1fr)] items-center gap-2 px-2 pl-7 text-left text-xs outline-none focus-visible:ring-1'
```

`packages/ui/src/components/command.tsx:155-161` — a fourth base color for
"row is current", `data-selected:bg-foreground/10`:

```tsx
    <CommandPrimitive.Item
      data-slot='command-item'
      className={cn(
        "group/command-item relative flex cursor-default items-center gap-2.5 rounded-none px-3 py-2 text-xs outline-hidden select-none in-data-[slot=dialog-content]:rounded-none! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-foreground/10 data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-selected:*:[svg]:text-foreground",
        className,
      )}
```

### Look-alikes that are NOT row states — do not touch them

Two `bg-muted/NN` strings are **pill/badge backgrounds**, not row states. A
blind sed would break them:

- `apps/web/src/features/search/search-result-file-header.tsx:62` —
  `bg-muted/55` on the match-count pill
- `apps/web/src/features/editor/components/language-server-references-pane.tsx:73`
  — `bg-muted/70` on the reference-count pill
- `apps/web/src/features/search/search-match-row.tsx:87` and `:169`,
  `apps/web/src/features/search/search-file-group.tsx:68` — `bg-muted/50` on the
  `unsaved` / `name` / count pills

Also not a row state: `search-result-file-header.tsx:37`, a `hover:bg-muted` on
a `size-5` icon **button** inside the header row. That is button affordance, not
row affordance.

### (b) The empty/loading/error sites, exactly as they read today

`apps/web/src/features/workbench/components/code-panel.tsx:50-63` — the most
designed of the seven: icon + `text-sm` title + `⌘P` kbd hint:

```tsx
        ) : (
          <div className='grid h-full place-items-center'>
            <div className='flex flex-col items-center gap-3'>
              <FileDashedIcon className='text-muted-foreground/50 size-8' />
              <p className='text-muted-foreground text-sm'>No file selected</p>
              <p className='text-muted-foreground/70 flex items-center gap-2 text-xs'>
                <kbd className='border-border bg-muted text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[10px]'>
                  ⌘P
                </kbd>
                Quick access
              </p>
            </div>
          </div>
        )}
```

`apps/web/src/components/file-picker/list.tsx:342-374` — a second designed
treatment, different in every dimension (`min-h-80`, duotone icon,
`font-medium` title, `text-xs` description):

```tsx
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className='flex min-h-80 items-center justify-center p-6'>
      <div className='flex max-w-sm flex-col items-center gap-3 text-center'>
        <WarningCircleIcon className='text-destructive size-8' weight='duotone' />
        <div>
          <div className='font-medium'>Could not load this folder</div>
          <p className='text-muted-foreground mt-1 text-xs'>{message}</p>
        </div>
        <Button onClick={onRetry} size='sm' type='button' variant='outline'>
          <ArrowClockwiseIcon data-icon='inline-start' />
          Retry
        </Button>
      </div>
    </div>
  )
}

function EmptyState({ mode }: { mode: FilePickerMode }) {
  const copy = pickerCopy(mode)

  return (
    <div className='flex min-h-80 items-center justify-center p-6'>
      <div className='flex max-w-sm flex-col items-center gap-3 text-center'>
        <FolderOpenIcon className='text-muted-foreground size-8' weight='duotone' />
        <div>
          <div className='font-medium'>Nothing here</div>
          <p className='text-muted-foreground mt-1 text-xs'>{copy.emptyDescription}</p>
        </div>
      </div>
    </div>
  )
}
```

`apps/web/src/features/git/components/panel-shell.tsx` — the whole file. A
left-aligned bare string that serves loading, error **and** empty:

```tsx
import { cn } from '@workspace/ui/lib/utils'

export function PanelShell({
  className,
  label,
  tone = 'muted',
}: {
  className?: string
  label: string
  tone?: 'error' | 'muted'
}) {
  return (
    <section
      className={cn(
        'h-full min-h-0 px-4 py-3 text-xs',
        tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
    >
      {label}
    </section>
  )
}
```

`apps/web/src/features/git/panel.tsx:32-40` — the triple duty:

```tsx
if (status.isPending) {
  return <PanelShell className={className} label='Loading Git' />
}
if (status.isError) {
  return <PanelShell className={className} label={errorMessage(status.error)} tone='error' />
}
if (!repository) {
  return <PanelShell className={className} label='No Git repository' />
}
```

`apps/web/src/features/workbench/components/diagnostics-panel.tsx:124-137` — the
same triple duty with a different treatment again:

```tsx
function renderDiagnosticsEmpty(message: string) {
  return (
    <div className='text-muted-foreground grid min-h-0 flex-1 place-items-center p-4 text-xs'>
      {message}
    </div>
  )
}

function emptyDiagnosticsMessage(status: LanguageServerStatus) {
  if (status === 'loading') return 'Diagnostics loading'
  if (status === 'error') return 'Diagnostics unavailable'

  return 'No problems reported'
}
```

It is also called at `:36` with `renderDiagnosticsEmpty('No active editor diagnostics')`.

`apps/web/src/features/editor/components/language-server-references-pane.tsx:90-91`:

```tsx
        {groups.length === 0 ? (
          <div className='text-muted-foreground px-3 py-4 text-xs'>No references found</div>
```

Search's four state components (`apps/web/src/features/search/`):

```tsx
// search-centered-state.tsx
export function SearchCenteredState({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 items-center justify-center p-4 text-xs text-muted-foreground',
        className,
      )}
    >
      <div className='flex flex-col items-center gap-2'>{children}</div>
    </div>
  )
}

// search-empty-state.tsx
export function SearchEmptyState({
  className,
  description,
  title,
}: {
  className?: string
  description: string
  title: string
}) {
  return (
    <SearchCenteredState className={className}>
      <MagnifyingGlassIcon className='text-muted-foreground size-5' />
      <span className='text-foreground font-medium'>{title}</span>
      <span className='text-muted-foreground max-w-48 text-center text-[11px]'>{description}</span>
    </SearchCenteredState>
  )
}

// search-error-state.tsx
export function SearchErrorState({
  className,
  message,
}: {
  className?: string
  message: string | null
}) {
  return (
    <div className={cn('flex min-h-0 items-center justify-center p-4', className)}>
      <div className='flex max-w-52 flex-col items-center gap-3 text-center text-xs'>
        <WarningCircleIcon className='text-destructive size-6' weight='duotone' />
        <div>
          <div className='font-medium'>Search failed</div>
          <p className='text-muted-foreground mt-1 text-[11px]'>{message ?? 'Search failed.'}</p>
        </div>
      </div>
    </div>
  )
}

// search-idle-state.tsx — NOT an empty state, it is a spacer. Leave it alone.
export function SearchIdleState({ className }: { className?: string }) {
  return <div className={cn('min-h-0', className)} />
}
```

`apps/web/src/features/search/search-pending-or-empty.tsx` — this is the one
surface that gets loading right today, with a spinner:

```tsx
export function SearchPendingOrEmpty({
  className,
  status,
}: {
  className?: string
  status: SearchBufferStatus
}) {
  if (status === 'loading') {
    return (
      <SearchCenteredState className={className}>
        <CircleNotchIcon className='size-4 animate-spin' />
        Searching
      </SearchCenteredState>
    )
  }

  return (
    <SearchEmptyState
      className={className}
      description='Try a different query.'
      title='No matches'
    />
  )
}
```

### The unused primitive

`packages/ui/src/components/skeleton.tsx` — the whole file, zero importers:

```tsx
import type { ComponentProps } from 'react'

import { cn } from '@workspace/ui/lib/utils'

function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      className={cn('animate-pulse rounded-none bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
```

Confirm the zero-importer claim yourself:

```bash
grep -rn "components/skeleton" apps packages --include="*.ts" --include="*.tsx"
```

→ no output (build artifacts under `apps/web/dist` and `apps/desktop/build` are
not source and are not matched by those includes).

Note: `bun run unused:exports` (knip) does **not** flag `Skeleton`, and never
did — `packages/ui/package.json` exports `"./components/*"`, so knip treats every
file in `packages/ui/src/components/` as a package entry point. That command is
irrelevant to this plan; the grep above is the only check that means anything
here. (It also exits 1 unconditionally at `ace313f` — 76 pre-existing unused
exports — so it can never be a pass/fail gate.)

### Where tokens live

`packages/ui/src/styles/globals.css` is 712 lines with three blocks you will
edit:

- `@theme inline { ... }` — lines 16–78. Maps `--color-X: var(--X)` so `bg-X`
  becomes a utility. The last color entry before the radius block is
  `--color-accent-solid: var(--accent-solid);` at line 66.
- `:root { ... }` — lines 80–257, light values.
- `.dark { ... }` — lines 259–392, dark values.

The `.dark` block carries a comment that matters here (lines 261–264):

```css
/* Only the -solid inputs are redefined here; the translucent formulas live
     once in :root and re-resolve because .dark sits on <html> (the :root
     element). Re-adding e.g. `--card: ...` here would override the formula
     and make dark mode ignore --surface-opacity. */
```

The row tokens you add are **not** surface tokens — they are overlay tints with
fixed alpha, so they get an explicit value in **both** blocks. That is the
opposite of what the comment describes, and it is correct; say so in a comment
next to the tokens so the next reader does not "fix" it.

### Package exports

`packages/ui/package.json` exports `"./components/*": "./src/components/*.tsx"`,
so a new file `packages/ui/src/components/empty-state.tsx` is imported as
`@workspace/ui/components/empty-state`. No barrel, no export map change.

## Commands you will need

| Purpose            | Command                                                                                                                           | Expected on success                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Typecheck (ui)     | `cd /Users/shaul/Desktop/D/platform/packages/ui && bun run typecheck`                                                             | exit 0                                                                                  |
| Typecheck (web)    | `cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck`                                                                | exit 0                                                                                  |
| Lint (web)         | `cd /Users/shaul/Desktop/D/platform/apps/web && bun run lint`                                                                     | exit 0                                                                                  |
| Lint (ui)          | `cd /Users/shaul/Desktop/D/platform/packages/ui && bun run lint`                                                                  | exit 0                                                                                  |
| Format (web)       | `cd /Users/shaul/Desktop/D/platform/apps/web && bun run format`                                                                   | exit 0                                                                                  |
| Format (ui)        | `cd /Users/shaul/Desktop/D/platform/packages/ui && bun run format`                                                                | exit 0                                                                                  |
| Tests (web)        | `cd /Users/shaul/Desktop/D/platform/apps/web && bun run test`                                                                     | all pass                                                                                |
| One test file      | `cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project dom src/features/search/tests/row-states.test.tsx` | pass                                                                                    |
| Full verify        | `cd /Users/shaul/Desktop/D/platform && bun run verify`                                                                            | exit 0                                                                                  |
| Skeleton importers | `cd /Users/shaul/Desktop/D/platform && grep -rn "components/skeleton" apps packages --include="*.ts" --include="*.tsx"`           | before: no output; after Step 5: exactly `packages/ui/src/components/loading-state.tsx` |

Do **not** use `bun run unused:exports` as a gate — see "The unused primitive"
above: it exits 1 at `ace313f` with 76 pre-existing findings and it has never
listed `Skeleton`.

`packages/ui` has **no `test` script** at `ace313f` (that gap is plan 013), so
both new tests go in `apps/web`, which runs `bun --bun vitest run --project node
--project dom`.

**A dev server is already running at http://localhost:5173.** `AGENTS.md`: "A
dev server is always running. Never spin up your own server to test or verify
changes — reuse the running one." Use it for the visual checks. Do not start
one, and do not run `bun run dev`.

## Scope

**In scope** (the only files you may modify, create, or delete):

Tokens and primitives:

- `packages/ui/src/styles/globals.css` — add two color tokens (three edits: the
  `@theme inline` map, `:root`, `.dark`)
- `packages/ui/src/components/empty-state.tsx` — **create**
- `packages/ui/src/components/loading-state.tsx` — **create**
- `packages/ui/src/components/skeleton.tsx` — one class swap
- `packages/ui/src/components/command.tsx` — row-state token on the palette item

Row-state migration (`apps/web/src/`):

- `features/search/search-match-row.tsx`
- `features/search/search-file-group.tsx`
- `features/search/search-result-file-header.tsx`
- `components/file-picker/list.tsx`
- `features/git/components/file-row.tsx`
- `features/git/components/change-group.tsx`
- `features/logs/logs-event-row.tsx`
- `features/workbench/components/diagnostics-panel.tsx`
- `features/editor/components/language-server-references-pane.tsx`

State migration (`apps/web/src/`):

- `features/workbench/components/code-panel.tsx`
- `features/git/panel.tsx`
- `features/git/components/panel-shell.tsx` — **delete**
- `features/search/search-empty-state.tsx` — **delete**
- `features/search/search-error-state.tsx` — **delete**
- `features/search/search-centered-state.tsx` — **delete**
- `features/search/search-pending-or-empty.tsx`
- `features/search/search-buffer-status-state.tsx` (the `SearchErrorState` call
  site at line 17 only — Step 9c)
- `features/search/search-results-view.tsx` (the `SearchErrorState` import at
  line 33 and its use at line 120 only — Step 9d)

Tests (create):

- `apps/web/src/features/search/tests/row-states.test.tsx`
- `apps/web/src/features/git/tests/panel-states.test.tsx`

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/features/chat/components/*` — `hover:bg-background/80`, `/60`,
  `/55` in `message-bubble.tsx`, `assistant-changed-files-tree.tsx`,
  `assistant-changed-files-section.tsx`,
  `assistant-message-copy-button.tsx`. These rows sit **inside a chat bubble**,
  not on a panel ground, so `bg-background` is a _lift_ out of the bubble rather
  than a tint over a pane. Same class name, different job. Retuning them needs
  the bubble's material considered as a whole.
- `apps/web/src/features/chat-mode/components/session-row.tsx` — its three
  states (`hover:bg-accent`, `active && bg-accent`, `marked && ring-ring/40`)
  are deliberate and carry an explanatory comment at lines 57–64 about why fill
  and ring must be readable simultaneously. Changing the fill breaks a
  three-state distinction this plan has not designed for.
- `apps/web/src/features/chat-mode/components/stage-empty-state.tsx` and
  `stage-notice.tsx` — chat-mode already has its own shared notice shell with a
  dedicated test suite (`components/tests/stage-empty-state.test.tsx`), and it
  is an interactive full-stage recovery screen with two action buttons, not a
  panel state. Folding it in is a separate, larger call.
- `apps/web/src/features/git/panel.tsx:70` — the
  `<div className='text-muted-foreground px-7 py-4 text-xs'>Working tree clean</div>`
  note. Its `px-7` deliberately aligns with the change-row indent inside the
  scrolling list; it is an inline list note, not a panel state, and centering it
  would be a visible regression.
- `packages/ui/src/components/button-variants.ts` and `badge-variants.ts` —
  their `hover:bg-muted/50`, `hover:bg-input/50`, `hover:bg-muted` are **button
  and badge** affordances with their own variant semantics. Row tokens do not
  apply.
- `packages/ui/src/components/resizable.tsx` — `hover:bg-foreground/10` on a
  drag handle, not a row.
- Every `bg-muted/NN` used as a **pill/badge background** (listed under
  "Look-alikes" above). Leave them exactly as they are.
- `apps/web/src/features/search/search-idle-state.tsx` — renders an empty
  `div` as a layout spacer. It is not an empty state and must survive.
- **`packages/tree/src/styles/style.css`** — the file tree is the biggest list in
  the app and it _is_ tempting, but its rows are styled by a self-contained
  `--trees-*` variable system (`--trees-theme-list-hover-bg`,
  `--trees-selected-bg`, `--trees-selected-focused-border-color`, plus
  `-override` hooks) with its own focused/unfocused and drag-hover states. It has
  no Tailwind hover class to swap, and folding it onto `--row-*` is a design job
  of its own. Do not touch `packages/tree/` at all.
- `packages/ui/src/components/spinner.tsx` — Step 9b stops search from rendering
  a spinner, which makes this component look newly unused. It is not: leave it
  alone, do not delete it, and do not rebuild `LoadingState` on top of it.
- `apps/web/src/components/file-picker/navigation/navigation-styles.ts` and
  `apps/web/src/components/file-picker/model.ts` / `entry-ui.tsx` /
  `file-picker-dialog.tsx` — they also carry `bg-info/10`, but on nav buttons,
  badges and dialog icon chips, not rows. Only the `bg-info/10` at
  `file-picker/list.tsx:309` changes.
- `apps/web/src/features/search/search-result-file-header.tsx:37` — the
  `hover:bg-muted` on the `size-5` icon **button** inside the header row. Only
  line 32 (the row itself) changes in that file.
- `hover:bg-accent` on buttons and menu items: `features/chat/components/activity-row.tsx:72`,
  `features/chat/components/context-usage-ring.tsx:42`,
  `components/workspace-project-menu.tsx:55`,
  `features/git/components/branch-actions.tsx:54`. Same class, button semantics.
- `apps/web/src/features/logs/log-formatters.ts`,
  `logs-timeline-bar.tsx`, `logs-timeline-metric.tsx` — plan 016 owns those.
- Any layout, spacing, virtualization, or data change. This plan changes
  **color classes and state components only**.

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks.

Conventional commits, lowercase descriptive subject. Real examples from
`git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

Two commits are natural here:

```
feat(ui): one hover/selected vocabulary for every list row
feat(ui): one empty state, and a loading state that is not the empty state
```

## Steps

### Step 1: Add the two row-state tokens

Three edits in `packages/ui/src/styles/globals.css`, exactly as `AGENTS.md`
prescribes ("light `:root`, `.dark`, and the `@theme inline` map").

**1a.** In the `@theme inline` block, immediately after
`--color-accent-solid: var(--accent-solid);` (line 66 at `ace313f`, the last
color entry before `--radius-sm`), add:

```css
/* Row interaction states. Overlay tints, not surfaces — see :root. */
--color-row-hover: var(--row-hover);
--color-row-selected: var(--row-selected);
```

**1b.** In `:root`, immediately after the `--warning-foreground: oklch(0.205 0.006 70);`
line (line 128 at `ace313f`, just above the `/* "new / recently added" marker` comment),
add:

```css
/* One vocabulary for list-row interaction. These are OVERLAY TINTS, not
     surfaces: they are painted on top of a pane that has already resolved
     --surface-opacity, so they carry their own fixed alpha and are defined
     in full in both :root and .dark rather than deriving from a -solid input.
     Mixing --foreground rather than --muted is what makes them visible in
     light mode: --muted at /60 over a white pane is a 1.4% lightness change,
     and the /55 hover it was paired with was 0.12% away from it.
     Selected must always outrank hover — keep the ratio at roughly 2.5x.
     Do NOT apply an opacity modifier to these (no `bg-row-hover/50`); the
     alpha is the design. */
--row-hover: color-mix(in oklch, var(--foreground) 5%, transparent);
--row-selected: color-mix(in oklch, var(--foreground) 12%, transparent);
```

**1c.** In `.dark`, immediately after the `--warning-foreground: oklch(0.205 0.006 70);`
line (line 285 at `ace313f`, just above `--update: oklch(0.74 0.145 300);`), add:

```css
/* Dark needs slightly more alpha for the same perceived step. These land the
     hovered row on roughly --card-solid (L 0.205) and the selected row on
     roughly --muted-solid (L 0.269), so rows sit in the existing dark ramp. */
--row-hover: color-mix(in oklch, var(--foreground) 7%, transparent);
--row-selected: color-mix(in oklch, var(--foreground) 14%, transparent);
```

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
grep -c -- "--row-hover" packages/ui/src/styles/globals.css
grep -c -- "--row-selected" packages/ui/src/styles/globals.css
```

→ `3` and `3` (one in `@theme inline`, one in `:root`, one in `.dark`, for each).

### Step 2: Migrate the row sites

The rule for every site, in order of precedence:

1. A row that can be **selected/active** gets `bg-row-selected` when it is, and
   `hover:bg-row-hover` **only when it is not**. Keep the existing
   `!active && ...` / `!selected && ...` guard — never let both classes apply to
   the same element.
2. A row with no selected concept gets `hover:bg-row-hover` and nothing else.
3. Do not add, remove, or reorder any other class. Do not add `transition-colors`
   where it is absent, and do not remove it where it is present.

Site by site:

| File                                                                          | Line    | From                                                                                             | To                                                                                                     |
| ----------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `apps/web/src/features/search/search-match-row.tsx`                           | 57      | `active && 'bg-muted/60',`                                                                       | `active && 'bg-row-selected',` **and add a new line under it:** `!active && 'hover:bg-row-hover',`     |
| `apps/web/src/features/search/search-match-row.tsx`                           | 155–156 | `active && 'bg-muted/60',` / `!active && 'hover:bg-muted/55',`                                   | `active && 'bg-row-selected',` / `!active && 'hover:bg-row-hover',`                                    |
| `apps/web/src/features/search/search-file-group.tsx`                          | 38–39   | same pair                                                                                        | same replacement                                                                                       |
| `apps/web/src/features/search/search-result-file-header.tsx`                  | 31–32   | `active && 'bg-accent',` / `!active && 'hover:bg-muted',`                                        | `active && 'bg-row-selected',` / `!active && 'hover:bg-row-hover',`                                    |
| `apps/web/src/components/file-picker/list.tsx`                                | 309–310 | `selected && 'bg-info/10 text-foreground',` / `!selected && interactive && 'hover:bg-muted/70',` | `selected && 'bg-row-selected text-foreground',` / `!selected && interactive && 'hover:bg-row-hover',` |
| `apps/web/src/features/git/components/file-row.tsx`                           | 42      | `hover:bg-muted/70`                                                                              | `hover:bg-row-hover`                                                                                   |
| `apps/web/src/features/git/components/change-group.tsx`                       | 50      | `hover:bg-muted/70`                                                                              | `hover:bg-row-hover`                                                                                   |
| `apps/web/src/features/logs/logs-event-row.tsx`                               | 74      | `hover:bg-muted/35`                                                                              | `hover:bg-row-hover`                                                                                   |
| `apps/web/src/features/workbench/components/diagnostics-panel.tsx`            | 106     | `hover:bg-muted/55`                                                                              | `hover:bg-row-hover`                                                                                   |
| `apps/web/src/features/editor/components/language-server-references-pane.tsx` | 132     | `hover:bg-muted/55`                                                                              | `hover:bg-row-hover`                                                                                   |
| `apps/web/src/features/editor/components/language-server-references-pane.tsx` | 174     | `hover:bg-muted/55`                                                                              | `hover:bg-row-hover`                                                                                   |
| `packages/ui/src/components/command.tsx`                                      | 158     | `data-selected:bg-foreground/10`                                                                 | `data-selected:bg-row-selected`                                                                        |

The content-match row at `search-match-row.tsx:57` is the one that **gains** a
class rather than swapping one. After the edit that `cn` reads:

```tsx
        className={cn(
          'group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 overflow-hidden px-2 py-1.5 text-left text-xs',
          compact && 'h-6 gap-1 px-1.5 py-0',
          active && 'bg-row-selected',
          !active && 'hover:bg-row-hover',
          className,
        )}
```

The command-palette swap is small by construction: `bg-foreground/10` → the same
`--foreground` at 12% in light and 14% in dark. It is the closest existing value
to the new token, which is the evidence the token values are in the right
register — but it is not identical, so expect a slight darkening in dark mode
rather than no change at all.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
grep -rnE "hover:bg-muted/(35|55|70)|active && 'bg-muted/60'|selected && 'bg-info/10|data-selected:bg-foreground/10|active && 'bg-accent'" \
  apps/web/src packages/ui/src --include="*.tsx" --include="*.ts"
```

→ no output.

```bash
grep -rn "bg-row-hover\|bg-row-selected" apps/web/src packages/ui/src \
  --include="*.tsx" --include="*.ts" | wc -l
```

→ `17` at this point in the plan. (Five sites carry a pair of classes —
`search-match-row.tsx` twice, `search-file-group.tsx`, `search-result-file-header.tsx`,
`file-picker/list.tsx` — and seven carry one, so 5×2 + 7 = 17.) Confirm every hit
is one of the sites in the table; a hit anywhere else means you edited an
out-of-scope file. **After Step 5 this count becomes 18**, because
`packages/ui/src/components/skeleton.tsx` picks up `bg-row-hover` too.

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck
cd /Users/shaul/Desktop/D/platform/packages/ui && bun run typecheck
```

→ both exit 0.

### Step 3: Verify the row states in the running app

> **This step needs browser tooling you can actually drive** (Playwright MCP,
> Chrome MCP, or a human at the keyboard). If you have none, **skip it, say so
> explicitly in your final report, and continue to Step 4.** Do not fabricate a
> result, and do not treat the missing check as a failure. It is an
> operator-observed check, not a machine gate — the Done criteria list it
> separately for that reason.

Open http://localhost:5173. Check **both** light and dark (the theme is the
`workbench.colorTheme` setting; switch it in Settings).

1. **Search results** — run a search that returns file-name matches, group
   headers and content matches. Arrow through the results, then move the mouse
   over a _different_ row. The keyboard-selected row must stay obviously darker
   than the hovered one, and every one of the three row types must visibly react
   to the pointer. This is the defect the plan exists to fix; if the selected and
   hovered rows still look alike, that is a STOP condition.
2. **Git panel next to the logs panel** — hover a change row, then hover a log
   row. The two must respond with the same intensity.
3. **Command palette** (`⌘P`) — the selected item goes from `--foreground` at
   10% to the token's 12% (light) / 14% (dark). A small darkening is expected
   and correct; a jump large enough to change the palette's character is not.
4. **File picker** — the selected row is now neutral rather than blue. Confirm it
   still reads clearly as "this is the one you have picked" against the hover.

**Verify**: all four checks pass in light and in dark, **or** you report that you
had no way to drive a browser.

### Step 4: Create the `EmptyState` primitive

Create `packages/ui/src/components/empty-state.tsx`. One component per file, no
barrel, `cn` from `@workspace/ui/lib/utils`, no memoization:

```tsx
import type { ReactNode } from 'react'

import { cn } from '@workspace/ui/lib/utils'

/**
 * The one answer to "there is nothing here". Every panel's empty and error
 * state renders through this so they stay the same shape; a *pending* panel
 * renders LoadingState instead, which is the whole point — an empty panel and a
 * loading panel must never look alike.
 *
 * `align='start'` is for states that live inside a list's flow (a references
 * pane, a sidebar section); `align='center'` is for a state that owns a whole
 * pane.
 */
function EmptyState({
  action,
  align = 'center',
  className,
  description,
  hint,
  icon,
  title,
  tone = 'muted',
}: {
  action?: ReactNode
  align?: 'center' | 'start'
  className?: string
  description?: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  title: string
  tone?: 'error' | 'muted'
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 p-4 text-xs',
        align === 'center' ? 'items-center justify-center' : 'items-start',
        className,
      )}
      data-slot='empty-state'
    >
      <div className={cn('flex flex-col gap-2', align === 'center' && 'items-center text-center')}>
        {icon ? (
          <span
            aria-hidden='true'
            className={cn(
              '[&>svg]:size-6',
              tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {icon}
          </span>
        ) : null}
        <span
          className={cn('font-medium', tone === 'error' ? 'text-destructive' : 'text-foreground')}
        >
          {title}
        </span>
        {description ? (
          <span className='text-muted-foreground max-w-64 text-[11px]'>{description}</span>
        ) : null}
        {hint ? (
          <span className='text-muted-foreground/70 flex items-center gap-2 text-[11px]'>
            {hint}
          </span>
        ) : null}
        {action ? <span className='mt-1'>{action}</span> : null}
      </div>
    </div>
  )
}

export { EmptyState }
```

Note the ternaries are single, never nested — `AGENTS.md` forbids nesting them.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/packages/ui && bun run typecheck && bun run lint
```

→ exit 0.

### Step 5: Create the `LoadingState` primitive and give `Skeleton` its first consumer

**5a.** Change one class in `packages/ui/src/components/skeleton.tsx`:

```tsx
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      // bg-row-hover, not bg-muted: --muted is a SURFACE token carrying
      // --surface-opacity, so on a light pane it composites to ~2% contrast and
      // the bar is invisible. The row tint is an overlay with fixed alpha,
      // which is what a skeleton bar actually is.
      className={cn('animate-pulse rounded-none bg-row-hover', className)}
      {...props}
    />
  )
}
```

**5b.** Create `packages/ui/src/components/loading-state.tsx`:

```tsx
import { Skeleton } from '@workspace/ui/components/skeleton'
import { cn } from '@workspace/ui/lib/utils'

// Descending widths so the block reads as content rather than a progress bar.
const LOADING_ROW_WIDTHS = ['w-full', 'w-11/12', 'w-4/5', 'w-3/4', 'w-2/3', 'w-1/2'] as const

/**
 * What a panel shows while it is fetching. Deliberately NOT EmptyState: a
 * sentence that says "Loading X" is typographically identical to one that says
 * "No X", so the user cannot tell a slow panel from an empty one. Structure
 * says "something is coming" without claiming to know what.
 *
 * `label` is the accessible name only — nothing is drawn for it.
 */
function LoadingState({
  className,
  label,
  rows = 3,
}: {
  className?: string
  label: string
  rows?: number
}) {
  return (
    <div
      aria-busy='true'
      aria-label={label}
      className={cn('flex min-h-0 flex-col gap-2 p-3', className)}
      data-slot='loading-state'
      role='status'
    >
      {LOADING_ROW_WIDTHS.slice(0, Math.min(rows, LOADING_ROW_WIDTHS.length)).map((width) => (
        <Skeleton className={cn('h-4', width)} key={width} />
      ))}
    </div>
  )
}

export { LoadingState }
```

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/packages/ui && bun run typecheck && bun run lint
cd /Users/shaul/Desktop/D/platform
grep -rn "components/skeleton" apps packages --include="*.ts" --include="*.tsx"
```

→ typecheck and lint exit 0; the grep now returns exactly one hit,
`packages/ui/src/components/loading-state.tsx`.

### Step 6: Migrate the git panel — the loading/empty collision

**6a.** Delete `apps/web/src/features/git/components/panel-shell.tsx`.

**6b.** In `apps/web/src/features/git/panel.tsx`, replace the `PanelShell`
import (line 13) with the two primitives, and rewrite lines 32–40:

```tsx
import { EmptyState } from '@workspace/ui/components/empty-state'
import { LoadingState } from '@workspace/ui/components/loading-state'
```

```tsx
if (status.isPending) {
  return <LoadingState className={className} label='Loading Git' rows={4} />
}
if (status.isError) {
  return (
    <EmptyState
      align='start'
      className={className}
      description={errorMessage(status.error)}
      title='Git is unavailable'
      tone='error'
    />
  )
}
if (!repository) {
  return <EmptyState align='start' className={className} title='No Git repository' />
}
```

`align='start'` preserves `PanelShell`'s left alignment, which is what the git
sidebar wants — it is a narrow column, not a pane.

This is the user-visible fix: `Loading Git` is now four pulsing bars and
`No Git repository` is a left-aligned title. They are no longer the same
picture.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
test ! -f apps/web/src/features/git/components/panel-shell.tsx && echo "deleted"
grep -rn "PanelShell" apps/web/src
cd apps/web && bun run typecheck
```

→ `deleted`, the grep returns no output, typecheck exits 0.

### Step 7: Migrate the diagnostics panel — the second loading/empty collision

In `apps/web/src/features/workbench/components/diagnostics-panel.tsx`:

**7a.** Add the imports:

```tsx
import { EmptyState } from '@workspace/ui/components/empty-state'
import { LoadingState } from '@workspace/ui/components/loading-state'
```

**7b.** Replace `renderDiagnosticsEmpty` and `emptyDiagnosticsMessage`
(lines 124–137) with a single status-aware renderer. Keep the guard-clause
shape; no nesting, no `else`:

```tsx
function renderDiagnosticsState(status: LanguageServerStatus) {
  if (status === 'loading') {
    return <LoadingState className='flex-1' label='Loading diagnostics' rows={3} />
  }
  if (status === 'error') {
    return <EmptyState className='min-h-0 flex-1' title='Diagnostics unavailable' tone='error' />
  }

  return <EmptyState className='min-h-0 flex-1' title='No problems reported' />
}
```

**7c.** Update the two call sites:

- line 54, inside `renderDiagnosticsStatus`:
  `return renderDiagnosticsEmpty(emptyDiagnosticsMessage(status))`
  → `return renderDiagnosticsState(status)`
- line 36, the no-active-editor branch:
  `renderDiagnosticsEmpty('No active editor diagnostics')`
  → `<EmptyState className='min-h-0 flex-1' title='No active editor' description='Open a file to see its diagnostics.' />`

The `min-h-0 flex-1` classes preserve the old flex behavior inside the
`section` at line 28 — do not drop them.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
grep -rn "renderDiagnosticsEmpty\|emptyDiagnosticsMessage" apps/web/src
cd apps/web && bun run typecheck
```

→ no output from the grep; typecheck exits 0.

### Step 8: Migrate the three remaining hand-rolled states

**8a.** `apps/web/src/features/workbench/components/code-panel.tsx` — replace
lines 50–63's inline block:

```tsx
        ) : (
          <EmptyState
            className='h-full'
            hint={
              <>
                <kbd className='border-border bg-muted text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[10px]'>
                  ⌘P
                </kbd>
                Quick access
              </>
            }
            icon={<FileDashedIcon className='size-8' />}
            title='No file selected'
          />
        )}
```

Add `import { EmptyState } from '@workspace/ui/components/empty-state'`. The
`FileDashedIcon` import stays; drop its `text-muted-foreground/50` class — the
primitive colors the icon slot.

**8b.** `apps/web/src/components/file-picker/list.tsx` — replace the local
`ErrorState` (lines 342–358) and `EmptyState` (lines 360–374) function
declarations. The local `EmptyState` name **collides** with the imported one, so
rename the local wrapper away entirely: delete both functions and inline the
primitive at the two call sites (lines 77–82):

```tsx
if (loadState.status === 'error') {
  return (
    <EmptyState
      action={
        <Button onClick={onRetry} size='sm' type='button' variant='outline'>
          <ArrowClockwiseIcon data-icon='inline-start' />
          Retry
        </Button>
      }
      className='min-h-80 p-6'
      description={loadState.message}
      icon={<WarningCircleIcon className='size-8' weight='duotone' />}
      title='Could not load this folder'
      tone='error'
    />
  )
}
if (entries.length === 0) {
  return (
    <EmptyState
      className='min-h-80 p-6'
      description={pickerCopy(mode).emptyDescription}
      icon={<FolderOpenIcon className='size-8' weight='duotone' />}
      title='Nothing here'
    />
  )
}
```

`FileList` already receives `mode` and `onRetry` as props, so nothing new needs
threading. Add
`import { EmptyState } from '@workspace/ui/components/empty-state'`. `CircleNotchIcon`
(used by `ListHeader` at line 38) and every other import must stay.

**8c.** `apps/web/src/features/editor/components/language-server-references-pane.tsx`
— replace line 91:

```tsx
<EmptyState align='start' className='px-3 py-4' title='No references found' />
```

Add the import. `align='start'` preserves the current left alignment.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun run typecheck && bun run lint
```

→ exit 0. In particular, typecheck must not report a duplicate `EmptyState`
binding in `file-picker/list.tsx`.

### Step 9: Move search onto the shared primitive

Search already distinguishes loading from empty (it has a spinner), so this step
is about giving that shape one home rather than fixing a defect.

**9a.** Delete three files:

- `apps/web/src/features/search/search-centered-state.tsx`
- `apps/web/src/features/search/search-empty-state.tsx`
- `apps/web/src/features/search/search-error-state.tsx`

Keep `search-idle-state.tsx` — it is a layout spacer, not a state.

**9b.** Rewrite `apps/web/src/features/search/search-pending-or-empty.tsx`:

```tsx
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { EmptyState } from '@workspace/ui/components/empty-state'
import { LoadingState } from '@workspace/ui/components/loading-state'

import type { SearchBufferStatus } from '@/features/search/search-buffer-state'

export function SearchPendingOrEmpty({
  className,
  status,
}: {
  className?: string
  status: SearchBufferStatus
}) {
  if (status === 'loading') {
    return <LoadingState className={className} label='Searching' rows={5} />
  }

  return (
    <EmptyState
      className={className}
      description='Try a different query.'
      icon={<MagnifyingGlassIcon className='size-5' />}
      title='No matches'
    />
  )
}
```

The spinner becomes skeleton rows. That is a deliberate behavior change and the
point of the (b) half: a results list that is loading should show the shape of
results. `CircleNotchIcon` is no longer imported here.

**9c.** In `apps/web/src/features/search/search-buffer-status-state.tsx`, drop
the `SearchErrorState` import, add

```tsx
import { WarningCircleIcon } from '@phosphor-icons/react'
import { EmptyState } from '@workspace/ui/components/empty-state'
```

and replace the use at line 17:

```tsx
return (
  <EmptyState
    description={error ?? 'Search failed.'}
    icon={<WarningCircleIcon className='size-6' weight='duotone' />}
    title='Search failed'
    tone='error'
  />
)
```

**9d.** In `apps/web/src/features/search/search-results-view.tsx`, drop the
`SearchErrorState` import at line 33, add the same two imports as 9c, and make
the same replacement at line 120
(`<SearchErrorState className={className} message={error} />`), passing
`className={className}` through to `EmptyState`. Leave the `SearchIdleState`
import at line 34 and its use at line 117 untouched.

**Verify**:

```bash
cd /Users/shaul/Desktop/D/platform
grep -rn "SearchCenteredState\|SearchEmptyState\|SearchErrorState" apps/web/src
cd apps/web && bun run typecheck && bun run lint
```

→ no output from the grep; typecheck and lint exit 0.

### Step 10: Add the two tests

See "Test plan" for the cases. Then:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web
bun --bun vitest run --project dom src/features/search/tests/row-states.test.tsx
bun --bun vitest run --project dom src/features/git/tests/panel-states.test.tsx
```

→ both pass.

### Step 11: Visual check of the state surfaces, then full verify

Same rule as Step 3: if you have no browser tooling, skip the five checks below,
say so in your report, and go straight to the commands at the end of this step —
those are the machine gate and they are not optional.

In the running app at http://localhost:5173, in **both** themes:

1. Open a workspace with no file open → the code panel's "No file selected"
   still shows the icon, the title and the `⌘P` hint.
2. Open the git sidebar on a workspace that is **not** a git repo →
   "No Git repository", left-aligned, with no pulsing bars.
3. Reload with the git sidebar open on a real repo → you should briefly see
   pulsing skeleton bars, not the sentence "Loading Git".
4. Open the file picker on an empty folder → "Nothing here" with the folder
   icon; break the path to see the error state with the Retry button.
5. Run a search that matches nothing → "No matches" with the magnifier icon.

Then:

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun run format
cd /Users/shaul/Desktop/D/platform/packages/ui && bun run format
cd /Users/shaul/Desktop/D/platform && bun run verify
```

→ `bun run verify` exits 0.

## Test plan

Two new files. Both are real regression gates, not restatements of the
implementation.

### 1. `apps/web/src/features/search/tests/row-states.test.tsx` (dom project)

Model after `apps/web/src/features/git/tests/git-store-provider.test.tsx` for
the import shape (`{ expect, test }` from the shared fixtures,
`renderWithProviders` from the shared render helper) — a pure-render test does
not destructure the `server`/`client` fixtures, so no server is started.

```tsx
import { screen } from '@testing-library/react'

import { SearchMatchRow, SearchNameMatchRow } from '@/features/search/search-match-row'
import { expect, test } from '../../../../test/fixtures'
import { renderWithProviders } from '../../../../test/render'
```

Cases:

1. **`every search row type reacts to the pointer`** — render an inactive
   `SearchMatchRow` (a `kind: 'content'` match) and an inactive
   `SearchNameMatchRow` (a `kind: 'name'` match); assert each root element's
   `className` contains `hover:bg-row-hover`. This is the regression that
   matters: the content row had no hover class at all at `ace313f`.
2. **`the selected row never also carries a hover class`** — render both row
   types with `active`; assert `className` contains `bg-row-selected` and does
   **not** contain `hover:bg-row-hover`. This is what keeps selected outranking
   hover; the `/60`-vs-`/55` collision could not have survived it.
3. **`no row paints a raw surface opacity`** — assert neither row's `className`
   matches `/bg-muted\/\d+/`. This stops the old vocabulary creeping back in.

Reach the root element with a `data-testid` on the wrapper you render, or with
`screen.getByRole('button')` for the name row (it renders a `<button>`) and
`container.firstElementChild` for the content row (it renders a `<div>`). Use
whichever is simplest; do not add props to the components to make them testable.

Minimal match fixtures (the `WorkspaceSearchMatch` shape, copied from the
existing `apps/web/src/features/search/tests/search-match-row.test.ts`):

```ts
const contentMatch = {
  column: 1,
  endColumn: 7,
  kind: 'content',
  line: 1,
  path: 'repo/src/app.ts',
  preview: 'needle here',
  previewStartColumn: 1,
  source: 'disk',
  type: 'file',
} as const

const nameMatch = {
  kind: 'name',
  path: 'repo/needle-file.ts',
  source: 'disk',
  type: 'file',
} as const
```

Required props, read off the component signatures at
`search-match-row.tsx:11-47` and `:128-145`:

- `SearchMatchRow` (renders a `<div>`): `match`, `query`, `replaceQuery={null}`,
  `replaceText=''`, `onOpenMatch`. `active` is optional and defaults to
  `undefined`, which is the inactive case.
- `SearchNameMatchRow` (renders a `<button>`): `match`, `query`, `onOpenMatch`.

Neither component reads a feature provider, so `renderWithProviders` is enough
and no fixture needs destructuring.

### 2. `apps/web/src/features/git/tests/panel-states.test.tsx` (dom project)

Model after `apps/web/src/features/git/components/tests/branch-actions.test.tsx`
— it creates a real git repo under `server.root` and renders against the real
in-process server. Do **not** mock the client or the server; `AGENTS.md`: "Do not
`mock.module` or `vi.mock` our server, client, or feature modules."

`Panel` calls `useGitState` and `useFocus` before its pending guard, so both
feature providers are required even for the loading render:

```tsx
renderWithProviders(
  <FocusProvider>
    <GitStoreProvider rootPath='repo'>
      <Panel rootPath='repo' />
    </GitStoreProvider>
  </FocusProvider>,
)
```

- `FocusProvider` — `@/components/workspace/focus/providers/focus-provider`
- `GitStoreProvider` — `@/features/git/providers/git-store-provider`
- `Panel` — `@/features/git/panel`

**The test signature must destructure `client`**, exactly as
`branch-actions.test.tsx` does — the `client` fixture is what calls `setClient`,
so without it the component's `getClient()` never reaches the in-process server
(`apps/web/test/fixtures.ts:46-53`):

```tsx
test('the git panel loading state is not its empty state', async ({ client, server }) => {
  void client
  // ...
})
```

Inline the git helper rather than importing it across test files
(`branch-actions.test.tsx:68-70`):

```ts
import { execFileSync } from 'node:child_process'

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' })
}
```

One case:

**`the git panel's loading state is not its empty state`**

- `await mkdir(path.join(server.root, 'repo'), { recursive: true })`, then
  `git(repo, 'init', '-b', 'main')` plus the `user.email` / `user.name` config
  lines from `branch-actions.test.tsx:56-57` (git refuses some commands without
  an identity, and CI has none).
- Render as above. **Synchronously, before any `await`**, assert
  `expect(screen.getByRole('status')).toBeVisible()`. TanStack Query is always
  pending on first render (`useStatus` at
  `apps/web/src/features/git/hooks/use-status.ts:6-12` — `enabled: Boolean(rootPath)`
  and no seeded cache), so this is deterministic.
- Still synchronously, assert two things about that same first render:
  `expect(screen.getByRole('status')).toHaveAccessibleName('Loading Git')` (the
  label survives as an accessible name) and
  `expect(screen.queryByText('Loading Git')).toBeNull()` (it is no longer drawn
  as a sentence). The second is the assertion that fails against the code at
  `ace313f`, so it is the regression gate.
- Then `await waitFor(() => expect(screen.queryByRole('status')).toBeNull())`.
- **The negative half — the settled panel must not reuse the loading
  affordance.** After that `waitFor`, assert
  `expect(screen.queryByRole('status')).toBeNull()` and that the panel actually
  rendered: `expect(await screen.findByText('Changes')).toBeVisible()` — the
  literal string `Header` always draws (`git/components/header.tsx:40`),
  independent of branch or commit count. Without that second assertion the first
  passes on an unmounted tree and proves nothing.

That single test is the machine-checkable form of "loading and empty are not the
same picture": before this plan `getByRole('status')` found nothing, because the
loading state was a `<section>` with a string in it.

`toBeVisible` / `toHaveAccessibleName` come from the jest-dom matchers the `dom`
project loads via `apps/web/test/env/dom.ts` — no extra import needed.

### Existing tests

No existing test asserts on any of the strings or class names this plan
changes — verified with:

```bash
grep -rn "No Git repository\|Loading Git\|No problems reported\|Diagnostics loading\|No file selected\|No references found\|Nothing here\|Could not load this folder" \
  apps/web/src apps/web/test --include="*.test.ts" --include="*.test.tsx"
```

→ no output at `ace313f`. The whole `apps/web` suite is therefore the
behavior-preservation gate; any failure in it is a STOP condition.

## Done criteria

ALL must hold:

- [ ] `grep -c -- "--row-hover" packages/ui/src/styles/globals.css` → `3`
- [ ] `grep -c -- "--row-selected" packages/ui/src/styles/globals.css` → `3`
- [ ] `grep -rnE "hover:bg-muted/(35|55|70)" apps/web/src packages/ui/src --include="*.tsx" --include="*.ts"`
      → no output
- [ ] `grep -rn "data-selected:bg-foreground/10" packages/ui/src` → no output
- [ ] `grep -n "bg-info/10" apps/web/src/components/file-picker/list.tsx` → no
      output. **Do not widen this grep**: `bg-info/10` legitimately survives in
      seven other places (nav buttons, badges, dialog icon chips) that this plan
      does not touch.
- [ ] `grep -rn "PanelShell\|SearchCenteredState\|SearchEmptyState\|SearchErrorState\|renderDiagnosticsEmpty\|emptyDiagnosticsMessage" apps/web/src`
      → no output
- [ ] `grep -rn "components/skeleton" apps packages --include="*.ts" --include="*.tsx"`
      → exactly one hit, in `packages/ui/src/components/loading-state.tsx`
- [ ] These four files no longer exist: `apps/web/src/features/git/components/panel-shell.tsx`,
      `apps/web/src/features/search/search-centered-state.tsx`,
      `apps/web/src/features/search/search-empty-state.tsx`,
      `apps/web/src/features/search/search-error-state.tsx`
- [ ] `apps/web/src/features/search/search-idle-state.tsx` still exists
- [ ] `cd packages/ui && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run test` exits 0, with the two new test files passing
      (4 new cases total)
- [ ] `bun run verify` exits 0 from the repo root
- [ ] `git status --short | diff /tmp/041-baseline.txt -` shows only files from
      the "In scope" list (plus `plans/README.md`). The baseline is not empty —
      see the Baseline check at the top.
- [ ] `plans/README.md` status row for 041 updated

Operator-observed, **not** machine-checkable — report the outcome, and report
plainly if you had no browser tooling to run them:

- [ ] Step 3's four row checks, in light and in dark
- [ ] Step 11's five state checks, in light and in dark

## STOP conditions

Stop and report back (do not improvise) if:

- **The row-state grep at Step 2 finds `hover:bg-muted/55` in a file not listed
  in the table.** New row sites landed since this plan was written and the token
  values were not chosen against them.
- **`bg-row-hover` or `bg-row-selected` does not resolve to a visible color in
  the running app.** Tailwind v4 picks tokens up from `@theme inline` via the
  `@source` globs at `globals.css:7-9`; if the class produces no background, the
  token was added to the wrong block. Do **not** work around it by inlining a
  `color-mix()` in a component — `AGENTS.md` forbids literals in components.
- **The command palette's selected item changes enough to look like a different
  design** after the Step 2 swap (a slight darkening — 10% → 12% light, 10% → 14%
  dark — is expected and fine). Report the observation rather than retuning the
  token, because retuning it moves every other row too.
- **Step 3's search check still shows the selected and hovered rows as the same
  color.** That means the tokens are not being applied (see above) — it cannot
  mean the values are too close, since selected is 2.4× hover.
- **You need to touch a file outside the In-scope list** to make something
  compile. In particular, if `file-picker/list.tsx` fights the imported
  `EmptyState` name, the answer is deleting the local functions (Step 8b), never
  aliasing the import or renaming the primitive.
- **Any existing test fails.** None of them assert on the strings or classes this
  plan changes, so a failure means something is coupled in a way this plan did
  not find.
- **The `role='status'` assertion in the git panel test is flaky.** If the first
  synchronous render is ever not pending, the assumption behind the test is
  wrong; report it rather than adding a `waitFor` that would make the test prove
  nothing.
- **`bun run verify` already fails before you make any edit.** Run it once at the
  start if you can afford the time. The working tree at `ace313f` carries
  unrelated modifications (see the Baseline check), so a pre-existing
  `format:check` or test failure is not yours — report it and stop, rather than
  spending the plan's budget fixing someone else's WIP or, worse, reverting it.
- **You find yourself editing a file under `packages/tree/`.** The file tree's
  row states are a separate `--trees-*` system with no Tailwind hover class to
  swap; needing to touch it means the scope was misread.

## Maintenance notes

For whoever owns this next:

- **The invariant to keep**: a row element never carries `bg-row-selected` and
  `hover:bg-row-hover` at the same time. Every migrated site guards it with
  `!active &&` / `!selected &&`. A reviewer should check that guard on any new
  row, because losing it silently reintroduces exactly the defect this plan
  fixed — the hover would paint over the selected row.
- **The one judgment call worth a second opinion**: the file picker's selected
  row loses its blue (`bg-info/10` → neutral `bg-row-selected`). For a _modal_
  picker where selection is a commitment, an accent hue is defensible. It was
  made neutral for consistency with every other list. If the maintainer prefers
  the hue, the right fix is a third token (`--row-selected-accent`), not a
  one-off class.
- **Deliberately deferred — `--row-selected-inactive`.** The original finding
  suggested a third token for "selected, but this list does not have focus". No
  component in the repo tracks list focus today, so registering it would ship an
  inert token that nothing reads. Add it in the same pass as the first consumer,
  not before.
- **Deliberately deferred — git's missing selected state.** `git/components/file-row.tsx`
  still has no selected treatment, so the change whose diff is open in the editor
  is unmarked. Fixing that is not a styling change: it needs the active diff
  document plumbed into the row, which is state work. The token
  (`bg-row-selected`) is now waiting for it.
- **Deliberately deferred — chat and chat-mode rows.** `features/chat/` hovers
  with `bg-background/NN` because its rows sit inside a bubble rather than on a
  pane, and `chat-mode/components/session-row.tsx` has a documented three-state
  design. Both need their own ground considered; neither is a copy-paste of this
  plan.
- **Deliberately deferred — `chat-mode`'s `StageNotice`.** It is a second shared
  state shell with its own test suite and two action buttons. `EmptyState` now
  has an `action` slot, so folding `StageNotice` into it is a plausible
  follow-up, but it would have to keep
  `components/tests/stage-empty-state.test.tsx` green and that suite asserts on
  its current structure.
- **Interacts with plan 015**: 015 adds motion tokens to the same
  `@theme inline` block in `globals.css`. Different lines, no semantic overlap,
  but if both are in flight expect a textual merge conflict there and resolve it
  by keeping both blocks.
- **Interacts with plan 016**: 016 converts `features/logs/`'s palette colors to
  status tokens and explicitly excludes `logs-event-row.tsx`, which is the only
  logs file this plan touches. No conflict.
- **Interacts with plans 009/010** (the folder reorg): they rename many of these
  files. Class strings and imports travel with a rename; nothing here needs
  redoing. Running 041 before them is the cheaper order.
- **Interacts with plan 013**: it gives `packages/ui` a `test` script. Once that
  lands, the `EmptyState`/`LoadingState` contract (does `LoadingState` expose
  `role='status'`? does `EmptyState` not?) belongs in a `packages/ui` test rather
  than being implied by the git panel test in `apps/web`.
- **Steps 3 and 11 are hand-driven** because `packages/ui` has no rendered
  primitives gallery. If one is ever built, `EmptyState`, `LoadingState` and the
  two row tokens are the first things it should show.
