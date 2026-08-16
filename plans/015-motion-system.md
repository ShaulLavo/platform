# Plan 015: Give `@workspace/ui` a real motion system

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat ace313f..HEAD -- packages/ui/src`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none. Pairs naturally with plan 018 (primitives gallery),
  which makes the visual checks in this plan far easier — **if 018 is already
  DONE, use the gallery for every visual verification step here.**
- **Category**: tech-debt (design engineering)
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

`packages/ui` has good bones — 34 primitives on Base UI, consistent `cva`
variants, disciplined theme tokens. What it does not have is a **motion
system**. Motion is currently decided per-component by whoever wrote that
component, and the results disagree:

- **`button-variants.ts` uses `transition-all`** with no duration and no easing.
  It is the most-used interactive primitive in the app, and `transition: all`
  animates every property that ever changes — including the press feedback,
  which should be instant.
- **The tooltip has no `duration-` class** while dialog, popover, dropdown,
  context-menu, select, and hover-card all have `duration-100`. So the tooltip
  silently runs at tw-animate-css's 150ms default while every sibling runs at
  100ms. Nobody chose that.
- **Nothing specifies easing.** Across 120K lines of `apps/web` there are
  exactly **two** `ease-out` occurrences, and `globals.css` defines zero easing
  tokens. Every overlay therefore animates on tw-animate-css's default, which is
  plain `ease` — a symmetric curve. Entering elements want `ease-out`: it starts
  fast, which is what makes an interface feel like it is responding rather than
  thinking.
- **`prefers-reduced-motion` is honored in 2 places in the entire app**, neither
  of them a shared primitive. Every dialog, popover, tooltip, dropdown, select,
  and hover-card zooms and slides regardless of the OS setting.
- **Enter and exit run at the same speed.** Exit should be faster — the user has
  already decided; the system is just getting out of the way.

The payoff is not "nicer animations". It is that motion becomes a **decision made
once, in tokens**, instead of 34 independent guesses. After this plan, changing
the app's motion feel is a three-line edit in `globals.css`, and
`prefers-reduced-motion` is handled structurally instead of per-component.

This plan deliberately does **not** touch animation _frequency_ or add any new
animation. It fixes the vocabulary of the motion that already exists.

## Current state

### How the animation utilities actually resolve

This is the load-bearing technical fact of the whole plan. `packages/ui` imports
`tw-animate-css` (v1.4.0) at `packages/ui/src/styles/globals.css:2`:

```css
@import 'tw-animate-css';
```

Its `@theme inline` block defines:

```css
--animate-in: enter var(--tw-animation-duration, var(--tw-duration, 0.15s)) var(--tw-ease, ease)...;
--animate-out: exit var(--tw-animation-duration, var(--tw-duration, 0.15s)) var(--tw-ease, ease)...;
```

Three consequences you must rely on:

1. **`duration-100` works** — Tailwind's `duration-*` utility sets `--tw-duration`,
   which `--animate-in` reads. The existing `duration-100` classes are taking
   effect.
2. **`ease-*` works** — Tailwind's `ease-*` utility sets `--tw-ease`, which
   `--animate-in` reads. Adding an easing class to these components will change
   the keyframe animation's timing function. This is the mechanism this plan
   uses; it needs no new CSS plumbing.
3. **The default easing is `ease`, and the default duration is 150ms.** Anything
   without an explicit class gets those.

### The primitives and what each declares today

Verified by reading each file:

| File                 | duration          | easing | origin-aware                     | reduced-motion |
| -------------------- | ----------------- | ------ | -------------------------------- | -------------- |
| `dialog.tsx`         | `duration-100`    | none   | n/a (centered, correct)          | none           |
| `popover.tsx`        | `duration-100`    | none   | ✅ `origin-(--transform-origin)` | none           |
| `dropdown-menu.tsx`  | `duration-100`    | none   | ✅                               | none           |
| `context-menu.tsx`   | `duration-100`    | none   | ✅                               | none           |
| `select.tsx`         | `duration-100`    | none   | ✅                               | none           |
| `hover-card.tsx`     | `duration-100`    | none   | ✅                               | none           |
| `tooltip.tsx`        | **none (→150ms)** | none   | ✅                               | none           |
| `button-variants.ts` | none (→150ms)     | none   | n/a                              | none           |

**Credit where due — do not "fix" these, they are already right:**

- Every popup uses `origin-(--transform-origin)`, so popups scale from their
  trigger rather than from their center. That is correct and non-obvious.
- The dialog is centered with no transform-origin override. Also correct —
  modals are not anchored to a trigger, so they should scale from center.
- Every zoom uses `zoom-in-95` / `zoom-out-95`, never bare `zoom-in`. That
  matters: bare `zoom-in` sets `--tw-enter-scale: 0`, and nothing in the real
  world appears from nothing. Starting at 95% is the right call.

### The button

`packages/ui/src/components/button-variants.ts:5` (the `cva` base string):

```
group/button inline-flex shrink-0 items-center justify-center rounded-none
border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap
transition-all outline-none focus-visible:border-ring focus-visible:ring-1
focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px
disabled:pointer-events-none disabled:opacity-50 ...
```

Two problems in that string:

- `transition-all` — animates every animatable property. Tailwind v4 resolves it
  to `transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1)`.
- `active:not-aria-[haspopup]:translate-y-px` is the press feedback, and
  `transition-all` makes it take 150ms on an _ease-in-out_ curve. Press feedback
  should be effectively instant — the whole point is confirming the interface
  heard the click.

The 1px downward nudge itself is a good choice for dense IDE chrome (subtler
than a scale, and it reads as a physical key press). **Keep it.** Only its
transition is wrong.

### The one file that already does it right

`apps/web/src/components/file-picker/navigation/navigation-styles.ts:10`:

```ts
'h-7 shrink-0 rounded-md border px-2 text-xs transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none focus-visible:ring-1 focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:active:scale-100'
```

Enumerated properties instead of `all`, an explicit duration, a strong custom
ease-out curve, press feedback, and a `motion-reduce:` guard. **This is the
target quality bar, and it already exists in the repo** — the plan is to make it
the default rather than an outlier. The curve it uses,
`cubic-bezier(0.23, 1, 0.32, 1)`, is the token value adopted below.

### The repo's styling rules

Quoted from `AGENTS.md`:

> - Style with Tailwind classes and the `@workspace/ui` primitives. Do not write
>   raw CSS or inline `style` props except for values that must be computed at
>   runtime.
> - Compose the shared primitives; do not restyle them ad-hoc.
> - Need a color with no token? Add it to `packages/ui/src/styles/globals.css`
>   (light `:root`, `.dark`, and the `@theme inline` map) instead of inlining a
>   palette class.

That last rule is about color, but its shape is the precedent this plan
follows for motion: **new design primitives go in `globals.css` as tokens.**

### Where the tokens go

`packages/ui/src/styles/globals.css` is 712 lines. Its `@theme inline` block
starts at line 16 and already holds non-color design tokens — radii, the mono
font stack, and two animation shorthands:

```css
--radius-sm: calc(var(--radius) * 0.6);
--radius-md: calc(var(--radius) * 0.8);
--font-mono: 'JetBrains Mono Nerd Font', ..., monospace;
--animate-accordion-down: app-accordion-down 150ms ease-out;
--animate-accordion-up: app-accordion-up 150ms ease-out;
```

So `@theme inline` is the established home for this. In Tailwind v4 the
`--ease-*` namespace generates `ease-*` utilities automatically, which is what
makes Step 1 work with no other plumbing.

## Commands you will need

| Purpose         | Command                                                                       | Expected on success     |
| --------------- | ----------------------------------------------------------------------------- | ----------------------- |
| Typecheck (web) | `cd apps/web && bun run typecheck`                                            | exit 0                  |
| Test (web)      | `cd apps/web && bun run test`                                                 | all pass                |
| Lint (web)      | `cd apps/web && bun run lint`                                                 | exit 0                  |
| Format          | `cd apps/web && bun run format`                                               | exit 0                  |
| UI pkg checks   | `cd packages/ui && bun run typecheck && bun run lint && bun run format:check` | exit 0                  |
| Full verify     | `bun run verify` (repo root)                                                  | exit 0                  |
| Dev server      | **already running** — do not start one                                        | `http://localhost:5173` |

`AGENTS.md`: "A dev server is always running. Never spin up your own server to
test or verify changes — reuse the running one."

## Scope

**In scope**:

- `packages/ui/src/styles/globals.css` — add motion tokens and one
  reduced-motion block. **Additive only**; do not modify existing color tokens.
- `packages/ui/src/components/button-variants.ts`
- `packages/ui/src/components/tooltip.tsx`
- `packages/ui/src/components/dialog.tsx`
- `packages/ui/src/components/popover.tsx`
- `packages/ui/src/components/dropdown-menu.tsx`
- `packages/ui/src/components/context-menu.tsx`
- `packages/ui/src/components/select.tsx`
- `packages/ui/src/components/hover-card.tsx`

**Out of scope** (do NOT touch):

- **Any file under `apps/web/src/`.** This plan changes the shared primitives
  only. Feature-level motion is a separate pass — it needs the gallery from plan
  018 to review properly.
- `packages/tree/src/**` — Preact, separate rendering path, separate concerns.
- `packages/ui/src/components/sonner.tsx` — Sonner ships its own motion system,
  tuned as a whole. Overriding half of it produces something worse than either.
  Leave it.
- `packages/ui/src/components/resizable.tsx` — already has explicit
  `duration-150 ease-out`. It is correct; leave it.
- `packages/ui/src/components/carousel.tsx`, `accordion.tsx`,
  `collapsible.tsx`, `progress.tsx`, `scroll-area.tsx` — not in the
  overlay family; a later pass.
- **Converting `animate-in` keyframes to `data-starting-style` transitions.**
  This is the single most tempting change here and it is deliberately excluded —
  see "Maintenance notes". It is a behavior change requiring per-component
  verification, not a token change.
- Adding, removing, or re-timing any animation that does not already exist.
- Changing `zoom-in-95` values, `slide-in-from-*` values, or
  `origin-(--transform-origin)` — all already correct.
- Changing the button's `active:...:translate-y-px` press affordance itself.

## Git workflow

Per the operator rule in `plans/README.md`: **all work happens on `main`** — no
new branches, worktrees, or PRs unless the operator explicitly asks.

Conventional commits. Example subjects:

```
feat(ui): motion becomes a token instead of 34 independent guesses
fix(ui): the button stops animating its own press feedback
```

Commit after Step 1 (tokens), Step 3 (button), and Step 5 (reduced motion), so
each behavior change is separately revertable.

## Steps

### Step 1: Add the motion tokens

In `packages/ui/src/styles/globals.css`, inside the existing `@theme inline`
block (starts line 16), next to the `--animate-accordion-*` entries, add:

```css
/* Motion. Built-in CSS easings are too weak to read as intentional; these are
     the stronger variants. Entering and exiting UI uses --ease-out-strong;
     things that move or morph on screen use --ease-in-out-strong. Never ease-in
     for UI — it delays the first frame, which is exactly when the user is
     looking. */
--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out-strong: cubic-bezier(0.77, 0, 0.175, 1);

/* Enter is the system arriving; exit is the system getting out of the way
     after the user already decided. Exit is therefore faster. */
--duration-enter: 140ms;
--duration-exit: 100ms;
```

Tailwind v4 turns the `--ease-*` namespace into `ease-*` utilities, so
`ease-out-strong` becomes usable immediately. The `--duration-*` names are
referenced as arbitrary values (`duration-(--duration-enter)`) rather than
generating utilities; that is fine and intentional.

**Verify**:

```bash
grep -n "ease-out-strong\|duration-enter" packages/ui/src/styles/globals.css
```

→ the four new declarations appear inside `@theme inline` (before its closing
brace at approximately line 79). Then:

```bash
cd apps/web && bun run typecheck
```

→ exit 0.

Then load the running app at `http://localhost:5173` and open any dropdown.
**Verify**: nothing has changed visually yet — this step only defines tokens.
If something _did_ change, you edited an existing declaration; revert and retry.

### Step 2: Apply enter/exit easing and timing to the six overlay primitives

For each of `dialog.tsx`, `popover.tsx`, `dropdown-menu.tsx`,
`context-menu.tsx`, `select.tsx`, `hover-card.tsx`:

- Replace the existing `duration-100` with the paired form:
  `data-open:duration-(--duration-enter) data-closed:duration-(--duration-exit)`
- Add easing: `ease-out-strong`

Because `--animate-in` and `--animate-out` both read `var(--tw-ease, ease)`,
a single `ease-out-strong` on the element covers both directions.

Concretely, in `popover.tsx` the fragment

```
... surface-vibrancy outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 ...
```

becomes

```
... surface-vibrancy outline-hidden ease-out-strong data-open:duration-(--duration-enter) data-closed:duration-(--duration-exit) data-[side=bottom]:slide-in-from-top-2 ...
```

`dialog.tsx` has **two** `duration-100` occurrences — one on `DialogOverlay`
(the backdrop, line ~30) and one on `DialogPrimitive.Popup` (line ~55). Update
both.

Do not reorder or otherwise disturb the rest of the class strings. These are
long and easy to corrupt; change only the duration and add the easing.

**Verify**:

```bash
grep -c "duration-100" packages/ui/src/components/{dialog,popover,dropdown-menu,context-menu,select,hover-card}.tsx
```

→ every file reports `0`.

```bash
grep -L "ease-out-strong" packages/ui/src/components/{dialog,popover,dropdown-menu,context-menu,select,hover-card}.tsx
```

→ no output (every file contains the class).

Then in the running app, open a dropdown menu and a dialog. **Verify**: both
still animate, both still open from the right origin, and the close feels
slightly quicker than the open. If either fails to animate at all, the class
string was corrupted — that is a STOP condition.

### Step 3: Fix the button transition

In `packages/ui/src/components/button-variants.ts`, in the `cva` base string:

- Replace `transition-all` with an enumerated list:
  `transition-[background-color,border-color,color,box-shadow]`
- Add `duration-(--duration-exit) ease-out-strong`

Rationale, and the part that matters: **`transform` is deliberately absent from
that list.** The press affordance
(`active:not-aria-[haspopup]:translate-y-px`) should land on the frame the
pointer goes down, not 150ms later. Removing `transform` from the transitioned
properties is what makes the press feel connected to the click. Everything
else — hover background, border, focus ring — still animates.

Leave every other class in the string untouched, including the `active:` rule
itself, all the `variant`/`size` definitions, and the `[&_svg]` selectors.

**Verify**:

```bash
grep -c "transition-all" packages/ui/src/components/button-variants.ts
```

→ `0`

```bash
cd packages/ui && bun run typecheck && bun run lint
```

→ exit 0.

Then in the running app: hover a button and press-and-hold it.
**Verify**: the hover background still fades in smoothly, and the 1px press
nudge is immediate with no perceptible lag. This is the one change in the plan
a user will actually feel; do not skip the manual check.

### Step 4: Give the tooltip an explicit duration and a hover delay

Two changes in `packages/ui/src/components/tooltip.tsx`.

**4a — duration and easing.** `TooltipContent`'s class string has no
`duration-*` at all, so it silently runs at 150ms. Add the same pair as Step 2:
`ease-out-strong data-open:duration-(--duration-enter)
data-closed:duration-(--duration-exit)`.

Note this string also carries `data-[state=delayed-open]:animate-in` alongside
`data-open:animate-in`. Leave both; just add the duration and easing classes.

**4b — the provider delay.** Line 5:

```tsx
function TooltipProvider({ delay = 0, ...props }: TooltipPrimitive.Provider.Props) {
```

`delay = 0` means every hover fires a tooltip immediately. In dense IDE chrome —
a toolbar of icon buttons — that means sweeping the pointer across the toolbar
strobes tooltips. A tooltip should wait long enough to prove the hover was
intentional.

Change the default to `delay = 400`. Base UI's provider then applies the delay
to the _first_ tooltip in a group and opens subsequent ones instantly while the
group stays active — which is exactly the behavior you want: deliberate on
entry, fast once the user is clearly reading tooltips.

Do not add a `closeDelay`; do not change any call site that passes an explicit
`delay`.

**Verify**:

```bash
grep -n "delay = 400" packages/ui/src/components/tooltip.tsx
grep -c "duration-(--duration-enter)" packages/ui/src/components/tooltip.tsx
```

→ the delay line matches and the duration count is `1`.

Then in the running app, find a toolbar with several icon buttons.
**Verify**: sweeping the pointer across them no longer strobes tooltips; pausing
on one shows it after a beat; moving to an adjacent one then shows instantly.

**If Base UI's `Provider` in this version does not implement group-instant
behavior** — i.e. every tooltip now takes 400ms — reduce the default to `200`
and note it in your report. A uniform 400ms delay is worse than the current
behavior, so do not leave it that way.

### Step 5: Honor `prefers-reduced-motion` for all of them

Add to `packages/ui/src/styles/globals.css`, inside the existing
`@layer base` block (starts at line 471):

```css
/* Reduced motion means fewer and gentler animations, not zero. Opacity still
     carries the state change — what goes away is movement: the zoom, the slide,
     and the transform transitions. */
@media (prefers-reduced-motion: reduce) {
  [data-slot='dialog-content'],
  [data-slot='dialog-overlay'],
  [data-slot='popover-content'],
  [data-slot='dropdown-menu-content'],
  [data-slot='context-menu-content'],
  [data-slot='select-content'],
  [data-slot='hover-card-content'],
  [data-slot='tooltip-content'] {
    --tw-enter-scale: 1;
    --tw-exit-scale: 1;
    --tw-enter-translate-x: 0;
    --tw-enter-translate-y: 0;
    --tw-exit-translate-x: 0;
    --tw-exit-translate-y: 0;
  }
}
```

This works because tw-animate-css drives its `enter`/`exit` keyframes entirely
from those custom properties (verified in its dist CSS). Neutralizing scale and
translate leaves `--tw-enter-opacity` / `--tw-exit-opacity` untouched, so the
fade survives and only the movement is removed. That is the correct reading of
reduced motion — the user still gets the state-change cue, without the
vestibular trigger.

**Before writing the selectors, confirm each `data-slot` value actually exists.**
Every primitive sets one (e.g. `data-slot='popover-content'` in `popover.tsx`),
but verify rather than trust:

```bash
grep -rhno "data-slot='[a-z-]*content'\|data-slot='dialog-overlay'" packages/ui/src/components/ | sort -u
```

Fix any selector that does not match a real value.

**Verify**: in the running app, enable Reduce Motion at the OS level (macOS:
System Settings → Accessibility → Display → Reduce motion), reload, and open a
dialog, a dropdown, and a tooltip.
**Verify**: each still fades in and out, and none of them zooms or slides.
Then turn Reduce Motion back off and confirm the zoom/slide returns.

### Step 6: Full verify

```bash
cd packages/ui && bun run format && bun run lint && bun run typecheck
cd /Users/shaul/Desktop/D/platform && bun run verify
```

**Verify**: all exit 0.

## Test plan

**No new unit tests.** There is no assertion about a class string that would not
simply restate the implementation, and this repo has no visual-regression
harness. Writing `expect(className).toContain('ease-out-strong')` tests the test.

The verification is therefore (a) the greps in the done criteria, which are
exact, and (b) the manual checks in Steps 2–5, which are the real gate. Those
checks are specified as concrete observations, not judgment calls.

**Existing tests that must still pass**: the full `apps/web` suite. Several
component tests render Base UI primitives, and the repo has a known trap
recorded in its own notes — base-ui's `ScrollArea` throws in happy-dom because
`getAnimations` is missing. If a test starts failing with a
`getAnimations`-shaped error after your change, you have introduced an animation
where a test environment cannot handle one; that is a STOP condition.

Verification: `cd apps/web && bun run test` → all pass, same count as before.
Record the baseline first: `cd apps/web && bun run test 2>&1 | tail -5`.

**If plan 018 (primitives gallery) is DONE**, use the gallery for every visual
check instead of hunting for each primitive in the app. Review the animations at
reduced speed via Chrome DevTools → Animations panel → playback rate 25%. A
crossfade that looks fine at full speed often shows two distinct overlapping
states in slow motion.

## Done criteria

ALL must hold:

- [ ] `grep -c "ease-out-strong" packages/ui/src/styles/globals.css` → ≥ `1`
      (token defined in `@theme inline`)
- [ ] `grep -rc "transition-all" packages/ui/src/components/` → `0` in
      `button-variants.ts`
- [ ] `grep -rl "duration-100" packages/ui/src/components/` → no output
- [ ] All seven overlay primitives (`dialog`, `popover`, `dropdown-menu`,
      `context-menu`, `select`, `hover-card`, `tooltip`) contain
      `ease-out-strong`
- [ ] `grep -n "delay = 400\|delay = 200" packages/ui/src/components/tooltip.tsx`
      → matches (whichever value Step 4b settled on)
- [ ] `globals.css` contains a `prefers-reduced-motion: reduce` block covering
      all eight `data-slot` selectors
- [ ] `cd packages/ui && bun run typecheck && bun run lint && bun run format:check`
      → exit 0
- [ ] `bun run verify` exits 0 from the repo root
- [ ] `cd apps/web && bun run test` → same test count as baseline
- [ ] `git status` shows **no** modified files under `apps/web/src/`,
      `packages/tree/`, or `apps/server/`
- [ ] Manual checks passed: button press is immediate (Step 3); overlays animate
      with a faster exit than enter (Step 2); tooltips no longer strobe across a
      toolbar (Step 4); reduced motion removes movement but keeps the fade
      (Step 5)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- An overlay stops animating entirely after Step 2 — a long `cva`/`cn` class
  string was corrupted. Revert that file and report which one.
- `ease-out-strong` has no effect (the animation still uses the default curve).
  That would mean Tailwind is not generating the utility from the `--ease-*`
  token in this setup, and the whole token approach needs rethinking rather than
  patching with arbitrary-value classes everywhere.
- Base UI's `TooltipProvider` applies the 400ms delay to _every_ tooltip with no
  group-instant behavior. Fall back to `200` as instructed, and report it —
  the intended interaction is "deliberate first, instant after".
- A test fails with a `getAnimations`-shaped error, or any existing test in
  `apps/web` fails.
- You find yourself wanting to edit a file under `apps/web/src/` to make
  something look right. Feature-level motion is explicitly a later pass; report
  what you found instead.
- The reduced-motion block does not disable movement (Step 5's check fails).
  Do not escalate to `animation: none !important` — that removes the fade too,
  which is the wrong reading of the setting. Report it.
- `globals.css` diff shows changes to any existing color token. This plan is
  additive to that file.

## Maintenance notes

- **What this plan deliberately did not do, and why it is the natural next
  step**: every overlay still animates with `animate-in`/`animate-out`, which
  are CSS _keyframes_. Keyframes restart from zero when re-triggered; CSS
  _transitions_ retarget from wherever they currently are. For anything a user
  can toggle rapidly — sweeping across a toolbar of tooltips, reopening a
  dropdown — transitions are visibly smoother. Base UI supports this directly
  via `data-starting-style` / `data-ending-style`, and the app is already on
  Base UI, so the migration is available. It is excluded here because it changes
  behavior per-component and needs the plan-018 gallery to verify honestly.
  That is the right follow-up plan.
- **Frequency was not audited.** The framework rule is that anything a user
  triggers 100+ times a day should not animate at all — the command palette is
  the obvious candidate (Raycast ships with no open/close animation for exactly
  this reason). Checking which surfaces are keyboard-driven and removing their
  animation is a separate, higher-judgment pass.
- A reviewer should check: no `apps/web/` file is in the diff, and `transform`
  is absent from the button's transitioned-property list (Step 3's whole point).
- If `--duration-enter` / `--duration-exit` later want to be user-configurable,
  they are already tokens — plan 019 wires them to a settings registry entry.
  Keep them as tokens rather than inlining the values back into components.
- The `file-picker/navigation/navigation-styles.ts` string that inspired these
  tokens still hardcodes `cubic-bezier(0.23, 1, 0.32, 1)` and `duration-150`. It
  should eventually use `ease-out-strong`, but it lives in `apps/web/` and is
  out of scope here. Worth a one-line follow-up.
