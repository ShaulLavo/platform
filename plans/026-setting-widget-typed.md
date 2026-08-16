# Plan 026: Bind `SettingWidget` to its schema type

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat ace313f..HEAD -- packages/contracts/src/settings packages/contracts/src/index.ts packages/contracts/src/tests apps/web/src/features/settings scripts/generate-settings-reference.ts docs/settings-reference.md`
>
> **This repo had uncommitted work in these paths when the plan was written.**
> The excerpts in "Current state" were read from the _working tree_ at
> `ace313f` + that in-flight settings work, not from the commit. So the drift
> check above is advisory; the binding check is Step 0, which compares the
> four excerpts against whatever you actually have. Locate code by **symbol
> name**, not by line number — the line numbers below are working-tree numbers
> and do not match the same symbols at `ace313f`.
>
> **Two premises were verified against the live code before handoff**, so do not
> re-derive them: (1) the `WidgetFor` in Step 1 accepts all **34** shipping
> registry entries with zero edits to `keys.ts`; (2) the `@ts-expect-error`
> directives in the Test plan must sit above the `widget:` **property**, not
> above the `const` — TypeScript reports the mismatch at the property line.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/022-delete-unreachable-code.md` — it rewrites
  `packages/contracts/src/index.ts`, which this plan also edits (one added
  export line). Run 022 first so you are adding to the shrunk barrel. If 022
  has not been run, this plan still works; you will just be adding a line to a
  larger file.
- **Category**: api-design
- **Planned at**: commit `ace313f`, 2026-08-16
- **Closes**: cross-cutting theme **T2 — typed contracts that stop being typed
  exactly where the consumer needs them** (this is the settings instance of it;
  plans 027 and 031 close the other two).

## Why this matters

`packages/contracts/src/settings/registry.ts` builds a genuinely careful type
tower — `SettingsValues`, `SettingValue<K>`, per-key schemas, `default` bound to
`schema` by a per-entry generic — and then declares `widget` as a free 11-member
string union with no relationship to the schema at all. So
`defineSetting({ schema: v.boolean(), widget: 'font' })` compiles, passes
`registryProblems`, passes every test, and ships a control that cannot render its
own value. The single place the settings UI turns a registry entry into a control
pays the bill in casts: `apps/web/src/features/settings/components/setting-row.tsx`
declares `onChange: (next: never) => void` and `value: unknown` and then re-casts
at every branch — eight unchecked `as` casts including `<ProviderSection saved={value as never} />`.
The one generic consumer outside the app, `scripts/generate-settings-reference.ts`,
had to write `descriptorFor(id as never)` to compile.

After this plan: the widget tag is checked against the value type at the
`defineSetting` call site (the same trick `default` already uses, in the same
file), contracts exports a discriminated `settingControl(id, value)` that narrows
once, and `setting-row.tsx` dispatches with **zero** `as` casts. Adding a new
widget kind becomes another checked branch instead of another cast.

## Current state

### Files and their roles

| File                                                        | Role                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/settings/registry.ts`               | Descriptor type + `defineSetting` + `registryProblems`. Where the binding goes.                            |
| `packages/contracts/src/settings/keys.ts`                   | `SETTINGS_REGISTRY` (34 entries), `SettingId`, `SettingsValues`, `descriptorFor`. Not edited by this plan. |
| `packages/contracts/src/settings/control.ts`                | **New.** The discriminated narrowing accessor.                                                             |
| `packages/contracts/src/index.ts`                           | The package's only entry point (`exports: { ".": "./src/index.ts" }`). One line added.                     |
| `apps/web/src/features/settings/components/setting-row.tsx` | The one place a registry entry becomes a control. All eight casts live here.                               |
| `scripts/generate-settings-reference.ts`                    | Doc generator. Holds the ninth cast, `descriptorFor(id as never)`.                                         |

### Excerpt A — `packages/contracts/src/settings/registry.ts:33-45`

```ts
/** Which control the settings page renders. Presentation only; never affects resolution. */
export type SettingWidget =
  | 'boolean'
  | 'font'
  | 'number'
  | 'string'
  | 'multiline'
  | 'enum'
  | 'list'
  | 'record'
  | 'providers'
  | 'models'
  | 'complex'
```

### Excerpt B — `packages/contracts/src/settings/registry.ts:64-73` and `:116-128`

```ts
export type SettingDescriptor<TSchema extends v.GenericSchema = v.GenericSchema> = {
  /** Validates a stored value. Also the source of the key's TypeScript type. */
  readonly schema: TSchema
  /**
   * Bound to `schema` on purpose: `v.InferOutput<TSchema>` makes a mistyped
   * default a compile error rather than a runtime surprise on first read.
   */
  readonly default: v.InferOutput<TSchema>
  readonly scope: SettingScope
  readonly widget: SettingWidget
```

```ts
/**
 * Identity function whose only job is to bind `default` to `schema`.
 *
 * Written as a per-entry generic rather than a constraint on the whole table:
 * a whole-map `Record<string, SettingDescriptor<unknown>>` constraint widens
 * `default` to `unknown` and then accepts `{ schema: v.boolean(), default: 3 }`
 * without complaint. Per-entry, that is a type error at the call site.
 */
export function defineSetting<TSchema extends v.GenericSchema>(
  descriptor: SettingDescriptor<TSchema>,
): SettingDescriptor<TSchema> {
  return descriptor
}
```

**This is the precedent you are copying.** `default: v.InferOutput<TSchema>` is
exactly the technique; `widget` is the field it was never applied to.

### Excerpt C — `apps/web/src/features/settings/components/setting-row.tsx:95-198`

The whole `SettingControl` component and its `enumOptions` helper, verbatim:

```tsx
function SettingControl({
  disabled,
  id,
  onChange,
  value,
}: {
  disabled: boolean
  id: SettingId
  onChange: (next: never) => void
  value: unknown
}) {
  const descriptor = descriptorFor(id)

  if (descriptor.widget === 'boolean') {
    return (
      <BooleanWidget
        checked={value === true}
        disabled={disabled}
        id={id}
        onChange={onChange as (next: boolean) => void}
      />
    )
  }

  if (descriptor.widget === 'number') {
    return (
      <NumberWidget
        disabled={disabled}
        id={id}
        onCommit={onChange as (next: number) => void}
        value={Number(value)}
      />
    )
  }

  // The two keys whose value is a whole domain object rather than a scalar. They
  // render the editors that already know how to source their rows — providers
  // from the running snapshots, models from the provider catalogue — because
  // neither list lives in the settings document.
  if (descriptor.widget === 'providers') {
    return <ProviderSection saved={value as never} />
  }

  if (descriptor.widget === 'models') {
    return <ModelSection />
  }

  if (descriptor.widget === 'record') {
    return (
      <RecordWidget
        disabled={disabled}
        id={id}
        onChange={onChange as (next: Record<string, string | null>) => void}
        recorder={id === 'keybindings.overrides'}
        value={(value ?? {}) as Record<string, string | null>}
      />
    )
  }

  if (descriptor.widget === 'font') {
    return (
      <FontWidget
        disabled={disabled}
        id={id}
        onChange={onChange as (next: string) => void}
        value={String(value)}
      />
    )
  }

  if (descriptor.widget === 'string' || descriptor.widget === 'multiline') {
    return (
      <StringWidget
        disabled={disabled}
        id={id}
        onCommit={onChange as (next: string) => void}
        value={String(value)}
      />
    )
  }

  if (descriptor.widget === 'enum') {
    return (
      <EnumWidget
        disabled={disabled}
        id={id}
        onChange={onChange as (next: string) => void}
        options={enumOptions(descriptor.schema)}
        value={String(value)}
      />
    )
  }

  // Lists, records and provider config get real editors in a later phase. Saying
  // so beats rendering a control that cannot represent the value.
  return <span className='text-muted-foreground text-xs'>Edit in settings.json</span>
}

function enumOptions(schema: unknown): readonly string[] {
  if (!schema || typeof schema !== 'object') return []
  const options = (schema as { options?: unknown }).options

  return Array.isArray(options) ? options.map(String) : []
}
```

Its call site, `setting-row.tsx:83-88` (unchanged by this plan):

```tsx
<SettingControl
  disabled={disabledReason !== null}
  id={id}
  onChange={(next) => setSetting(id, next, scope)}
  value={value}
/>
```

`value` comes from `setting-row.tsx:32`: `const value = snapshot.values[id]`, so
its real type is `SettingsValues[SettingId]` — the union of every registered
key's value type. `setSetting` is
`<K extends SettingId>(key: K, value: SettingsValues[K], target?) => void`
(`apps/web/src/features/settings/hooks/use-settings-actions.ts:68-74`).

### Excerpt D — `scripts/generate-settings-reference.ts:11`, `:20-22`, `:64-68`

```ts
import { SETTING_IDS, descriptorFor } from '../packages/contracts/src/index'
```

```ts
function table(ids: readonly string[]) {
  const rows = ids.map((id) => {
    const descriptor = descriptorFor(id as never)
```

```ts
const byCategory = new Map<string, string[]>()
for (const id of SETTING_IDS) {
  const category = descriptorFor(id).category
  byCategory.set(category, [...(byCategory.get(category) ?? []), id])
}
```

### The widget kinds actually in use

`SETTINGS_REGISTRY` (34 entries) uses only seven of the eleven — verified with
`bun -e "import('./packages/contracts/src/index.ts').then(m=>{const w={};for(const id of m.SETTING_IDS)w[m.descriptorFor(id).widget]=(w[m.descriptorFor(id).widget]||0)+1;console.log(m.SETTING_IDS.length,w)})"`
→ `34 { enum: 8, number: 13, boolean: 8, font: 1, providers: 1, models: 2, record: 1 }`. `string`,
`multiline`, `list` and `complex` are unused by the shipping registry —
`string`/`multiline` and `list` appear only in the fixture registries inside
`packages/contracts/src/tests/`. **Do not delete any of the eleven.** Deleting
`list` breaks `packages/contracts/src/tests/settings-registry.test.ts:105`, and
`complex` is the deliberate escape hatch this plan keeps working (see Step 1).

### Repo conventions that apply (quoted from `AGENTS.md` — you have not read it)

- **Settings**: "Every user-facing knob is a registry entry in
  `packages/contracts/src/settings/keys.ts`." … "Regenerate
  `docs/settings-reference.md` with `bun run settings:reference` after changing
  the registry." (Step 5 does this.)
- **Greenfield**: "This project is greenfield and not live: no releases, no
  external users, no data anyone needs migrated." / "No backward compatibility
  shims, no legacy aliases, no deprecation windows. Update every call site in
  the same pass."
- **Code organization**: "Import exact files through `@/`. Do not add barrel
  `index.ts` files. Barrel files are allowed only at package entry points such
  as `packages/*/src/index.ts` that back the package's `"."` export."
- **Control flow**: "Keep nesting depth to 3 or less. Use guard clauses and
  early returns… Do not use `else` after an early return. Never use nested
  ternaries."
- **React**: "One component per file." / "Avoid manual React memoization. Do not
  add `memo`, `useMemo`, or `useCallback` for ordinary render values or
  callbacks."
- **TypeScript fixes**: "Treat readonly/mutable mismatches as contract bugs
  first. Do not copy containers just to satisfy TypeScript… Avoid fake fixes
  like `sizes: [...node.sizes]`."
- **Errors**: "Never throw `new Error`." (Nothing in this plan throws. If you
  think it needs to, it doesn't — return the `'unsupported'` control instead.)
- **Testing**: "Import `{ test, expect }` from `apps/web/test/fixtures.ts`, not
  from `vitest`, for app tests." / "Do not `mock.module` or `vi.mock` our
  server, client, or feature modules." / "Use `render.tsx`;
  `renderWithProviders` mirrors the app's `main.tsx` provider stack."
- **Dev server**: "A dev server is always running. Never spin up your own server
  to test or verify changes — reuse the running one." (It is at
  <http://localhost:5173>.)

## Commands you will need

| Purpose                   | Command                                                                   | Expected on success                                                |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Contracts typecheck       | `cd packages/contracts && bun run typecheck`                              | exit 0, no output                                                  |
| Contracts tests           | `cd packages/contracts && bun run test`                                   | all pass                                                           |
| Web typecheck             | `cd apps/web && bun run typecheck`                                        | exit 0                                                             |
| Web tests (settings only) | `cd apps/web && bun --bun vitest run --project dom src/features/settings` | all pass                                                           |
| Web tests (full)          | `cd apps/web && bun run test`                                             | all pass                                                           |
| Regenerate settings doc   | `bun run settings:reference` (from repo root)                             | prints `wrote …/docs/settings-reference.md (34 settings)`          |
| Lint                      | `bun run lint` (root)                                                     | exit 0                                                             |
| Format check              | `bun run format:check` (root)                                             | see the warning below — **not** guaranteed exit 0 on a clean start |
| Format (fix), scoped      | `./node_modules/.bin/oxfmt --write <paths>` (root)                        | rewrites only the paths you name                                   |
| Everything                | `bun run verify` (root)                                                   | typecheck + lint + format:check + test                             |

`apps/web`'s `test` script is `bun --bun vitest run --project node --project dom`.
The `browser` project is separate (`bun run test:browser`) and **is not used by
this plan** — it is known to hang at the RUN banner in this repo.

> ⚠️ **Do not run root `bun run format`.** It expands to
> `bun run --filter '*' format` → `oxfmt --write .` in every workspace, and this
> repo has substantial uncommitted in-flight work outside this plan's scope.
> A repo-wide rewrite would put unrelated files in your diff and break the
> "no files outside the in-scope list are modified" done criterion. Format only
> the files you touched, by path.
>
> ⚠️ **`bun run format:check` was already failing when this plan was written**,
> on two files this plan must not touch:
> `packages/contracts/src/settings/keys.ts` and
> `apps/web/src/features/settings/hooks/use-setting-inspection.ts`. That makes
> `bun run verify` red before you start. Step 0 records the exact baseline
> offenders; Step 7 compares against it rather than demanding a clean exit 0.
> **Do not format either file to "fix" verify** — `keys.ts` in particular is on
> the Out-of-scope list, and a `cd packages/contracts && bun run format` would
> rewrite it as a side effect.

## Scope

**In scope** (the only files you may modify or create):

- `packages/contracts/src/settings/registry.ts` — add `WidgetFor`, change
  `defineSetting`'s parameter type.
- `packages/contracts/src/settings/control.ts` — **create**.
- `packages/contracts/src/index.ts` — one added export line.
- `packages/contracts/src/tests/settings-registry.test.ts` — add four
  type-gate declarations.
- `packages/contracts/src/tests/settings-control.test.ts` — **create**.
- `apps/web/src/features/settings/components/setting-row.tsx` — rewrite
  `SettingControl`, delete `enumOptions`.
- `apps/web/src/features/settings/tests/page.test.tsx` — add one test.
- `scripts/generate-settings-reference.ts` — drop the `as never`.
- `docs/settings-reference.md` — regenerated only, by `bun run settings:reference`.
- `plans/README.md` — status row.

**Out of scope** (do NOT touch, even though they look related):

- `packages/contracts/src/settings/keys.ts` — the registry itself. All 34
  entries already pair a legal widget with their schema — this was verified
  entry-by-entry against the `WidgetFor` in Step 1 before handoff — so the whole
  point is that it compiles unchanged. **If you find yourself editing it, your
  `WidgetFor` is wrong.**
- **Any file already dirty in `git status` that this plan does not name.** The
  working tree carries unrelated in-flight settings work (e.g.
  `apps/web/src/features/settings/utils/default-value.ts`,
  `hooks/use-setting-inspection.ts`, `utils/search.ts`, `utils/humanize.ts`).
  Do not fix, revert, reformat, or "tidy" any of it — including the
  format:check offender named in the Commands section.
- **Making `settingControl` generic** (`settingControl<K extends SettingId>(id: K, value: SettingValue<K>)`).
  It looks tighter and is worse here: the page holds `id: SettingId`, so `K`
  would instantiate to the full union anyway, and the extra parameter buys the
  caller nothing while making every `SettingControl` member depend on `K`.
  Keep the signature exactly as written in Step 2.
- **The name `SettingControl`.** It is deliberately used twice: a _type_ in
  `packages/contracts/src/settings/control.ts` and a _local component_ in
  `setting-row.tsx`. Do not import the contracts type into `setting-row.tsx`
  (it would collide with the component) and do not rename either one.
- `packages/contracts/src/settings/resolve.ts` and `wire.ts` — the resolver
  already validates every layer value against its schema, which is why
  `snapshot.values[id]` is always well-typed at runtime. Untouched.
- `registryProblems` in `registry.ts` — do **not** add a runtime widget/schema
  check. That function exists for what the type system cannot do (id shape,
  refinements a type cannot express). After this plan the compiler covers
  widget/schema, and a duplicate runtime check would be a second
  representation of the same rule.
- Any of the eleven `SettingWidget` members — see "The widget kinds actually in
  use" above; deleting one breaks a contracts test fixture.
- `packages/contracts/src/index.ts`'s existing `type SettingWidget` export line
  — it has no external consumer and plan 022 owns removing it. Leave it alone
  so you do not collide with 022.
- `apps/web/src/features/settings/components/row-actions.tsx` — its
  `value: unknown` prop is honest (it only `JSON.stringify`s). Retyping it buys
  nothing.
- `apps/web/src/features/settings/hooks/use-setting-value.ts` /
  `utils/boot-mirror.ts` / the keymap — **`settingControl` must never be used
  there.** It returns a freshly parsed object for `record` and `providers`, so
  routing a `useSettingValue` consumer through it would break the
  identity-diffing that `keys.ts:450-457` documents for the keymap.
- `apps/web/src/features/settings/components/widgets/*.tsx` — the widget
  components' prop types are already correct and are what the new dispatch
  feeds. Do not loosen them.
- **The `string`/`multiline` branch and the `StringWidget` import in
  `setting-row.tsx`.** No shipping key uses those widgets today, so the branch
  looks like dead code and deleting it will look like a cleanup. Keep both:
  the branch is what makes the dispatch total over `SettingControl`, and
  `string`/`multiline` are live in contracts' own test fixtures
  (`settings-registry.test.ts:65`).
- `packages/editor-*` — symlinks to a sibling checkout. Never in scope.

## Git workflow

**All work happens on `main`.** No new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks for them.

If the operator does ask for a commit: conventional commits, lowercase
descriptive subject. Real examples from `git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

A fitting subject here would be
`refactor(settings): bind the widget tag to the schema, and drop the casts`.

## Steps

### Step 0: Confirm the ground truth

```bash
git status --porcelain packages/contracts/src apps/web/src/features/settings scripts/generate-settings-reference.ts
```

Uncommitted changes in these paths are **expected** — the settings feature had
in-flight work when this plan was written. What matters is that the four
excerpts still describe the code. Check each:

```bash
grep -n "readonly widget: SettingWidget" packages/contracts/src/settings/registry.ts
grep -n "descriptor: SettingDescriptor<TSchema>," packages/contracts/src/settings/registry.ts
grep -n "onChange: (next: never) => void" apps/web/src/features/settings/components/setting-row.tsx
grep -n "saved={value as never}" apps/web/src/features/settings/components/setting-row.tsx
grep -n "descriptorFor(id as never)" scripts/generate-settings-reference.ts
grep -c "as (next:" apps/web/src/features/settings/components/setting-row.tsx
```

**Expected**: the first five each print exactly one line; the last prints `6`.
If any prints nothing, or the last prints a number other than 6, **STOP** — the
code has drifted past this plan.

Then establish a baseline. Run these from the repo root:

```bash
(cd packages/contracts && bun run typecheck && bun run test)
(cd apps/web && bun run typecheck)
```

**Expected**: all exit 0. If the baseline is red, **STOP** — you cannot tell
your breakage from someone else's.

Now record the two baselines you will diff against later. **Both are recorded
_before_ you edit anything, and the doc one is recorded _after_ a regeneration**
— the checked-in doc may be stale relative to the working-tree registry, and
comparing against a stale file would raise a false alarm in Step 5:

```bash
bun run settings:reference
shasum docs/settings-reference.md
git diff --stat docs/settings-reference.md
```

**Expected**: prints `wrote /Users/…/docs/settings-reference.md (34 settings)`.
Write the shasum down. `git diff --stat` here is informational — if the
regeneration moved the file, that is pre-existing drift, not something you
caused; note it in your report and carry on with the _new_ hash as the baseline.

```bash
bun run format:check 2>&1 | grep -E "^\S+ format:check: \S+\.(ts|tsx)" || true
```

**Expected** (this was the exact list when the plan was written):

```
@workspace/contracts format:check: src/settings/keys.ts (0ms)
web format:check: src/features/settings/hooks/use-setting-inspection.ts (0ms)
```

**Write down every file this prints.** These are pre-existing format offenders
owned by someone else's in-flight work. Step 7 requires that this list is
_unchanged_, not that it is empty. Do not format any file on it — and note that
`packages/contracts/src/settings/keys.ts` is on it _and_ on this plan's
Out-of-scope list, so running `oxfmt --write` inside `packages/contracts` would
silently rewrite a file you are forbidden to change. Format by explicit path
only, as Step 7 does.

### Step 1: Bind the widget tag to the schema in `registry.ts`

Two edits to `packages/contracts/src/settings/registry.ts`.

**1a.** Add the type import at the top, immediately after the `isRecord` import:

```ts
import * as v from 'valibot'
import { isRecord } from '../is-record'
import type { ModelRef, ProviderInstanceConfig } from '../settings'
```

(`../settings` is `packages/contracts/src/settings.ts` — the value-schema module.
It imports `chat-ids`, `chat-model` and `orchestration-runtime` and nothing from
`settings/`, so this introduces no import cycle.)

**1b.** Insert `ValueWidget` / `WidgetFor` immediately after the
`SettingVisibility` type (before the `SettingMerge` doc comment):

```ts
/**
 * Which widget kinds can render a value of type `TValue`.
 *
 * The registry types `default` against `schema`; this does the same for the
 * control, so `{ schema: v.boolean(), widget: 'font' }` stops being a legal
 * entry that ships a control unable to render its own value.
 *
 * `complex` is always allowed. It is the escape hatch — the page renders the
 * "edit in settings.json" hint for it — and a type that cannot say "none of
 * these fit" is a cage rather than a contract.
 *
 * `unknown extends TValue` is the fallback for the unparameterised
 * `SettingDescriptor`, whose `v.InferOutput<v.GenericSchema>` is `unknown`.
 * Without it `SettingsRegistryShape` would admit no widget at all.
 */
export type WidgetFor<TValue> = unknown extends TValue
  ? SettingWidget
  : 'complex' | ValueWidget<TValue>

type ValueWidget<TValue> =
  | (TValue extends boolean ? 'boolean' : never)
  | (TValue extends number ? 'number' : never)
  | (TValue extends string ? 'string' | 'multiline' | 'font' | 'enum' : never)
  | (TValue extends readonly unknown[] ? 'list' : never)
  | (TValue extends readonly ProviderInstanceConfig[] ? 'providers' : never)
  | (TValue extends readonly ModelRef[] ? 'models' : never)
  | (TValue extends Readonly<Record<string, string | null>> ? 'record' : never)
```

**1c.** Change `defineSetting`'s parameter — and **only** its parameter — and
extend its doc comment's first line:

```ts
/**
 * Identity function whose only job is to bind `default` and `widget` to `schema`.
 *
 * Written as a per-entry generic rather than a constraint on the whole table:
 * a whole-map `Record<string, SettingDescriptor<unknown>>` constraint widens
 * `default` to `unknown` and then accepts `{ schema: v.boolean(), default: 3 }`
 * without complaint. Per-entry, that is a type error at the call site.
 *
 * The widget binding lives on the *parameter* rather than on
 * `SettingDescriptor.widget`. A conditional type is unmeasurable for variance,
 * so putting `WidgetFor<v.InferOutput<TSchema>>` on the field makes `TSchema`
 * invariant and every entry stops satisfying
 * `Readonly<Record<string, SettingDescriptor>>`. Constraining the argument
 * catches the same mistake at the same place and leaves the descriptor type
 * assignable.
 */
export function defineSetting<TSchema extends v.GenericSchema>(
  descriptor: SettingDescriptor<TSchema> & { readonly widget: WidgetFor<v.InferOutput<TSchema>> },
): SettingDescriptor<TSchema> {
  return descriptor
}
```

> ⚠️ **Do not "simplify" this by moving the binding onto the field.** Writing
> `readonly widget: WidgetFor<v.InferOutput<TSchema>>` inside `SettingDescriptor`
> was tried and it fails: `packages/contracts/src/settings/keys.ts` reports one
> error per registry entry, of the form
> `error TS2322: Type 'SettingDescriptor<BooleanSchema<undefined>>' is not assignable to type 'SettingDescriptor'. Type 'GenericSchema' is not assignable to type 'BooleanSchema<undefined>'.`
> That is TypeScript treating `TSchema` as invariant because it appears inside a
> conditional type. The parameter-side binding above compiles the entire package
> with zero changes to `keys.ts`.

**Verify**:

```bash
cd packages/contracts && bun run typecheck
```

**Expected**: exit 0, no output. `keys.ts` must not need a single edit. If it
reports errors in `keys.ts`, you put the binding in the wrong place — re-read
the warning above.

### Step 2: Add the discriminated control accessor

Create `packages/contracts/src/settings/control.ts` with exactly this content:

```ts
import * as v from 'valibot'
import { isRecord } from '../is-record'
import { providerInstanceConfigsSchema, type ProviderInstanceConfig } from '../settings'
import { descriptorFor, type SettingId, type SettingValue } from './keys'

/**
 * What the record widget can edit: string keys to a string or an explicit
 * unbind. This is the widget's own input contract, not a copy of any key's
 * schema — `keybindings.overrides` is the only key using it today and its
 * schema is narrower (a command-id pattern, a trimmed non-empty value).
 */
const recordControlSchema = v.record(v.string(), v.nullable(v.string()))

/**
 * One registry entry plus its current value, narrowed to the control that can
 * render it.
 *
 * The page used to do this narrowing itself with eight `as` casts, including
 * `onChange: (next: never) => void` — which is the wrong direction: a handler
 * that accepts nothing is assignable to no widget, where a handler accepting
 * every registered value type is assignable to all of them. Narrowing here
 * means the page dispatches once and the compiler checks each branch.
 *
 * `unsupported` covers `list`, `complex`, and a value whose shape does not
 * match its widget. The last is not a live path — the resolver rejects a layer
 * value that fails its schema and reports it as a diagnostic instead of
 * applying it — but this function has to be total, and a JSON hint beats a
 * control that silently coerces.
 */
export type SettingControl =
  | { readonly widget: 'boolean'; readonly value: boolean }
  | { readonly widget: 'number'; readonly value: number }
  | { readonly widget: 'string' | 'multiline'; readonly value: string }
  | { readonly widget: 'font'; readonly value: string }
  | { readonly widget: 'enum'; readonly value: string; readonly options: readonly string[] }
  | { readonly widget: 'record'; readonly value: Record<string, string | null> }
  | { readonly widget: 'providers'; readonly value: readonly ProviderInstanceConfig[] }
  | { readonly widget: 'models' }
  | { readonly widget: 'unsupported' }

export function settingControl(id: SettingId, value: SettingValue<SettingId>): SettingControl {
  const { schema, widget } = descriptorFor(id)

  if (widget === 'boolean') return { widget, value: value === true }
  if (widget === 'number') {
    return typeof value === 'number' ? { widget, value } : { widget: 'unsupported' }
  }
  if (widget === 'font') {
    return typeof value === 'string' ? { widget, value } : { widget: 'unsupported' }
  }
  if (widget === 'string' || widget === 'multiline') {
    return typeof value === 'string' ? { widget, value } : { widget: 'unsupported' }
  }
  if (widget === 'enum') {
    if (typeof value !== 'string') return { widget: 'unsupported' }

    return { widget, value, options: picklistOptions(schema) }
  }
  if (widget === 'record') {
    const parsed = v.safeParse(recordControlSchema, value ?? {})

    return parsed.success ? { widget, value: parsed.output } : { widget: 'unsupported' }
  }
  if (widget === 'providers') {
    const parsed = v.safeParse(providerInstanceConfigsSchema, value)

    return parsed.success ? { widget, value: parsed.output } : { widget: 'unsupported' }
  }
  // The model catalogue is not in the settings document, so the control sources
  // its own rows and the stored value tells it nothing.
  if (widget === 'models') return { widget }

  return { widget: 'unsupported' }
}

/**
 * A picklist's members, which is where an enum control's options come from.
 *
 * Read here rather than by the page: `options` is a valibot implementation
 * detail, and reaching for it through a cast was how the page erased the
 * literal union and could hand a select a value the schema would reject.
 */
function picklistOptions(schema: unknown): readonly string[] {
  if (!isRecord(schema)) return []
  const { options } = schema
  if (!Array.isArray(options)) return []

  return options.map(String)
}
```

**Verify**:

```bash
cd packages/contracts && bun run typecheck
```

**Expected**: exit 0. There must be **no `as` anywhere in `control.ts`**:

```bash
grep -n " as " packages/contracts/src/settings/control.ts
```

**Expected**: no output.

### Step 3: Export it from the package entry point

In `packages/contracts/src/index.ts`, immediately after the block that ends
`} from './settings/keys'`, add:

```ts
export { settingControl, type SettingControl } from './settings/control'
```

Do **not** export `WidgetFor` — it has no consumer outside `registry.ts`, and
plan 022 is actively removing barrel names with no external reference.

**Verify**:

```bash
cd packages/contracts && bun run typecheck && bun run test
```

**Expected**: exit 0; all existing contracts tests pass.

### Step 4: Rewrite `SettingControl` in the web app

In `apps/web/src/features/settings/components/setting-row.tsx`:

**4a.** Update the imports. Add `settingControl` and `type SettingValue` to the
`@workspace/contracts` import; `descriptorFor` stays (it is still used by
`SettingRow` itself at the top of the file):

```tsx
import {
  descriptorFor,
  settingControl,
  settingRowIds,
  type SettingId,
  type SettingsSnapshot,
  type SettingValue,
} from '@workspace/contracts'
```

**4b.** Replace the entire `SettingControl` function **and** the `enumOptions`
helper below it (everything from `function SettingControl({` to the end of the
file) with:

```tsx
function SettingControl({
  disabled,
  id,
  onChange,
  value,
}: {
  disabled: boolean
  id: SettingId
  // Every registered value type, not `never`. A handler that accepts nothing is
  // assignable to no widget — which is what forced a cast at every branch —
  // where one that accepts all of them is assignable to each in turn.
  onChange: (next: SettingValue<SettingId>) => void
  value: SettingValue<SettingId>
}) {
  const control = settingControl(id, value)

  if (control.widget === 'boolean') {
    return <BooleanWidget checked={control.value} disabled={disabled} id={id} onChange={onChange} />
  }

  if (control.widget === 'number') {
    return <NumberWidget disabled={disabled} id={id} onCommit={onChange} value={control.value} />
  }

  // The two keys whose value is a whole domain object rather than a scalar. They
  // render the editors that already know how to source their rows — providers
  // from the running snapshots, models from the provider catalogue — because
  // neither list lives in the settings document.
  if (control.widget === 'providers') {
    return <ProviderSection saved={control.value} />
  }

  if (control.widget === 'models') {
    return <ModelSection />
  }

  if (control.widget === 'record') {
    return (
      <RecordWidget
        disabled={disabled}
        id={id}
        onChange={onChange}
        recorder={id === 'keybindings.overrides'}
        value={control.value}
      />
    )
  }

  if (control.widget === 'font') {
    return <FontWidget disabled={disabled} id={id} onChange={onChange} value={control.value} />
  }

  if (control.widget === 'string' || control.widget === 'multiline') {
    return <StringWidget disabled={disabled} id={id} onCommit={onChange} value={control.value} />
  }

  if (control.widget === 'enum') {
    return (
      <EnumWidget
        disabled={disabled}
        id={id}
        onChange={onChange}
        options={control.options}
        value={control.value}
      />
    )
  }

  // `list`, `complex`, and any value whose shape does not match its widget.
  // Saying so beats rendering a control that cannot represent the value.
  return <span className='text-muted-foreground text-xs'>Edit in settings.json</span>
}
```

Leave `SettingRow` (everything above `function SettingControl`) exactly as it
is. Its `onChange={(next) => setSetting(id, next, scope)}` and `value={value}`
already produce the right types.

**Verify**:

```bash
cd apps/web && bun run typecheck
grep -n " as (next:\|as never\|as Record<" src/features/settings/components/setting-row.tsx
```

**Expected**: typecheck exits 0; the grep prints nothing.

### Step 5: Drop the ninth cast from the doc generator

In `scripts/generate-settings-reference.ts`, three edits:

```ts
import { SETTING_IDS, descriptorFor, type SettingId } from '../packages/contracts/src/index'
```

```ts
function table(ids: readonly SettingId[]) {
  const rows = ids.map((id) => {
    const descriptor = descriptorFor(id)
```

```ts
const byCategory = new Map<string, SettingId[]>()
```

`scripts/` is in no workspace and is not typechecked at this commit (plan 013
fixes that), so the compiler will not confirm this for you. Confirm it by
running the generator and proving the output is byte-identical:

```bash
bun run settings:reference
shasum docs/settings-reference.md
```

**Expected**: prints `wrote /Users/…/docs/settings-reference.md (34 settings)`,
and the hash **matches the one you recorded in Step 0** (the post-regeneration
one). The registry did not change, so the document must not either. If the hash
moved, **STOP** and report the diff.

```bash
grep -n "as never" scripts/generate-settings-reference.ts
```

**Expected**: no output.

### Step 6: Tests

See "Test plan" below for the exact cases. Write them, then:

```bash
cd packages/contracts && bun run test
cd ../../apps/web && bun --bun vitest run --project dom src/features/settings
```

**Expected**: contracts — all pass, including the new `settings-control.test.ts`
(4 tests). apps/web settings — all pass, including the one new test in
`page.test.tsx`.

### Step 7: Whole-repo verification and a look at the real page

Format **only the files you touched** — never root `bun run format`, see the
warning in "Commands you will need":

```bash
./node_modules/.bin/oxfmt --write \
  packages/contracts/src/settings/registry.ts \
  packages/contracts/src/settings/control.ts \
  packages/contracts/src/index.ts \
  packages/contracts/src/tests/settings-registry.test.ts \
  packages/contracts/src/tests/settings-control.test.ts \
  apps/web/src/features/settings/components/setting-row.tsx \
  apps/web/src/features/settings/tests/page.test.tsx
```

Then:

```bash
bun run typecheck && bun run lint
bun run format:check 2>&1 | grep -E "^\S+ format:check: \S+\.(ts|tsx)" || true
bun run test
```

**Expected**: `typecheck` and `lint` exit 0; `test` passes; and the format:check
file list is **byte-identical to the one you recorded in Step 0** — no file you
touched appears on it, and no file drops off it. `bun run verify` bundles these
four but will exit non-zero purely because of the pre-existing offender, so run
them separately as above and judge each on its own.

Then look at the running dev server — **do not start one**, it is already up.
This check is **not** in Done criteria: if you have no browser tooling
available, skip it and say so plainly in your report rather than stalling.

1. Open <http://localhost:5173> and navigate to the settings page.
2. Confirm, without touching anything else:
   - **Appearance → Color theme** renders a dropdown showing the current theme
     (`system` by default), not a text field and not "Edit in settings.json".
   - **Editor → Font family** renders the font picker with `JetBrainsMono`.
   - **Editor → Font size** renders a number field showing `13`.
   - **Providers** renders the provider list, and **Models** the model list.
   - **Keyboard shortcuts** renders the key/value record editor.
   - The string "Edit in settings.json" appears **nowhere** in the row area
     (it is still correct inside a row's ⋯ menu).

Any row showing "Edit in settings.json" is a dispatch regression — **STOP**.

### Step 8: Update the index

Set this plan's row in `plans/README.md` to `DONE`.

## Test plan

This change is behaviour-preserving for every value the resolver can actually
produce, so the existing suites are most of the gate:
`apps/web/src/features/settings/tests/page.test.tsx` already drives the real
in-process server through four of the seven live widget kinds (boolean switch,
record/chord recorder, providers section, models section), and
`number-widget.test.tsx` / `font-widget.test.tsx` / `record-widget.test.tsx`
cover the widgets themselves. Three new things are worth testing because they
are new surface, not re-tested behaviour.

### 1. `packages/contracts/src/tests/settings-registry.test.ts` — type gate (4 declarations)

That file already opens with a "Type-derivation gate" block (its comment: these
are "declarations, not assertions: `tsgo --noEmit` is what enforces them",
because no vitest project here enables `test.typecheck`). **Model the new
declarations on that block exactly** — put them right after the existing
`void _unknownKeyHasNoType` line. `defineSetting`, `v`, `modelRefListSchema` and
`providerInstanceConfigsSchema` are already imported by that file.

> ⚠️ **The `@ts-expect-error` goes above the `widget:` property, not above the
> `const`.** TypeScript elaborates an object-literal argument mismatch to the
> offending _property_, so a directive on the `const` line suppresses nothing
> and you get **two** errors instead of zero: `TS2578: Unused '@ts-expect-error'
directive` on the `const`, plus the unsuppressed `TS2322` on `widget`. This
> was measured with `tsgo`, not guessed. Copy the placement below exactly.

```ts
// The widget tag is bound to the schema the same way `default` is, so a control
// that cannot render its key's value is a compile error at the entry rather
// than a settings row that misbehaves at runtime.
const _fontTakesAString = defineSetting({
  schema: v.string(),
  default: '',
  scope: 'window',
  widget: 'font',
  category: 'X',
  description: 'x',
})
const _fontRejectsABoolean = defineSetting({
  schema: v.boolean(),
  default: true,
  scope: 'window',
  // @ts-expect-error a boolean cannot render a font picker
  widget: 'font',
  category: 'X',
  description: 'x',
})
const _modelsRejectProviders = defineSetting({
  schema: modelRefListSchema,
  default: [],
  scope: 'application',
  // @ts-expect-error a model list is not a provider list
  widget: 'providers',
  category: 'X',
  description: 'x',
})
const _providersRejectModels = defineSetting({
  schema: providerInstanceConfigsSchema,
  default: [],
  scope: 'application',
  // @ts-expect-error a provider list is not a model list
  widget: 'models',
  category: 'X',
  description: 'x',
})

void _fontTakesAString
void _fontRejectsABoolean
void _modelsRejectProviders
void _providersRejectModels
```

`cd packages/contracts && bun run typecheck` is what enforces these; **expected:
exit 0, no output**. Two failure modes, both meaningful:

- `error TS2578: Unused '@ts-expect-error' directive` on a `widget:` line — the
  binding stopped catching that mistake. That is the tripwire doing its job;
  investigate `WidgetFor`, do not delete the directive.
- `error TS2322: Type '"font"' is not assignable to type …` reported on a line
  you did not annotate — you put a directive in the wrong place. Move it to sit
  immediately above the line tsgo names.

### 2. `packages/contracts/src/tests/settings-control.test.ts` — new file, 4 cases

Model the file header on `packages/contracts/src/tests/settings-registry.test.ts`
(`import { describe, expect, it } from 'vitest'`; this package runs plain
`vitest`, **not** `bun --bun vitest`). Cases and their exact expected values —
every one of these was executed against the real registry and the real
`settingControl` implementation before handoff, so if your output differs, your
`control.ts` differs from Step 2, not the table:

| Case                                                   | Call                                                                                                                                                               | Expected                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| enum carries its picklist                              | `settingControl('workbench.colorTheme', 'dark')`                                                                                                                   | `{ widget: 'enum', value: 'dark', options: ['dark', 'light', 'system'] }`                                                        |
| scalars narrow to their control                        | `settingControl('editor.fontSize', 13)` / `settingControl('workbench.wallpaper.enabled', true)` / `settingControl('editor.fontFamily', 'JetBrainsMono')`           | `{ widget: 'number', value: 13 }` / `{ widget: 'boolean', value: true }` / `{ widget: 'font', value: 'JetBrainsMono' }`          |
| structured values are parsed, not cast                 | `settingControl('keybindings.overrides', { 'workspace.saveFile': 'Mod+S' })` / `settingControl('providers.instances', [])` / `settingControl('models.hidden', [])` | `{ widget: 'record', value: { 'workspace.saveFile': 'Mod+S' } }` / `{ widget: 'providers', value: [] }` / `{ widget: 'models' }` |
| a value that does not match its widget gets no control | `settingControl('editor.fontSize', 'thirteen')` / `settingControl('providers.instances', 'nope')`                                                                  | `{ widget: 'unsupported' }` both                                                                                                 |

Note the last row compiles because `string` is one of the registered value types,
so it is a member of `SettingValue<SettingId>`. Write a one-line comment on that
case saying the resolver never produces such a value — it reports an
`invalid-value` diagnostic instead — and that the case exists because the
function must be total.

### 3. `apps/web/src/features/settings/tests/page.test.tsx` — one new test

Append it after the existing `renders a record editor for keybindings rather than raw JSON`
test. Model it on `renders a real providers editor rather than a JSON escape hatch`
(same file), which already proves `queryByText('Edit in settings.json')` is a
usable assertion with rows on screen — a row's ⋯ menu carries that same string
but is unmounted while closed.

```tsx
test('every registered widget resolves a real control, not the JSON escape hatch', async ({
  client,
}) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsPage />)

  // A row has to be on screen before the absence of the hint means anything.
  await screen.findByRole('switch', { name: 'Wallpaper enabled' })

  // The hint is the dispatch's fallback for `list`, `complex` and a value whose
  // shape does not match its widget — none of which any registered key
  // produces. One on the page means a widget kind lost its branch.
  expect(screen.queryAllByText('Edit in settings.json')).toEqual([])
})
```

Import `{ test, expect }` from `../../../../test/fixtures` — the file already
does. Do not add `vi.mock` of anything.

**Verification**: `cd apps/web && bun --bun vitest run --project dom src/features/settings`
→ all pass, one more test than before.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd packages/contracts && bun run typecheck` exits 0, with **no edits to
      `packages/contracts/src/settings/keys.ts`** (`git diff --stat packages/contracts/src/settings/keys.ts`
      shows the same numbers as before you started).
- [ ] `cd packages/contracts && bun run test` exits 0; `settings-control.test.ts`
      exists and its 4 tests pass.
- [ ] `cd apps/web && bun run typecheck` exits 0.
- [ ] `cd apps/web && bun run test` exits 0; the new `page.test.tsx` test passes.
- [ ] `grep -n " as (next:\|as never\|as Record<\|as { options" apps/web/src/features/settings/components/setting-row.tsx`
      → no matches.
- [ ] `grep -n "as never" scripts/generate-settings-reference.ts` → no matches.
- [ ] `grep -n " as " packages/contracts/src/settings/control.ts` → no matches.
- [ ] `grep -n "function enumOptions" apps/web/src/features/settings/components/setting-row.tsx`
      → no matches (it moved into contracts as `picklistOptions`).
- [ ] `bun run settings:reference` prints `(34 settings)` and
      `shasum docs/settings-reference.md` is unchanged from the Step 0
      post-regeneration hash.
- [ ] `bun run typecheck` (root) exits 0.
- [ ] `bun run lint` (root) exits 0.
- [ ] `bun run test` (root) exits 0.
- [ ] The `bun run format:check` offender list is identical to Step 0's — no
      file you touched was added, none was removed. (Root `bun run verify` will
      still exit non-zero on that pre-existing offender; that is expected and is
      not yours to fix.)
- [ ] `git status --porcelain` lists no _newly_ modified or created file outside
      the In-scope list. Files already dirty at Step 0 stay dirty and untouched
      — compare against the Step 0 output, not against an empty list.
- [ ] `plans/README.md` row for 026 says DONE.

## STOP conditions

Stop and report back (do not improvise) if:

- **Step 0's greps do not match.** In particular: `grep -c "as (next:"` on
  `setting-row.tsx` returning anything but `6`, or `descriptorFor(id as never)`
  missing from the generator. Someone else has already touched this surface.
- **Step 0's baseline typecheck or test run is red.** This plan's only real
  gate is the compiler; you cannot use it if it starts broken.
- **`packages/contracts/src/settings/keys.ts` needs an edit to compile.** The
  entire premise is that all 34 registry entries already pair a legal widget
  with their schema, and that was verified entry-by-entry before handoff. If one
  genuinely does not, either you mistyped `ValueWidget` or someone added a key —
  report which key, its schema and its widget. Do **not** change the key's
  widget or its schema to make it compile.
- **You are tempted to put `WidgetFor<…>` on `SettingDescriptor.widget`.** It
  does not work (see the warning in Step 1c). If you tried it and got ~34
  `TS2322` errors in `keys.ts`, that is the documented failure — revert to the
  parameter-side binding and continue.
- **`bun run format:check` names a file you touched, or stops naming one it
  named in Step 0.** Either means your formatting pass reached outside this
  plan's file list. Revert the stray file with
  `git checkout -- <path>` (or `git status` it first if it was already dirty at
  Step 0 — in that case leave it and report) and re-run the scoped `oxfmt`.
- **`bun run settings:reference` prints a number other than 34.** A key was
  added or removed by someone else while you worked. The doc-hash gate in
  Step 5 is then meaningless — report and stop.
- **`bun run settings:reference` changes `docs/settings-reference.md`.** The
  registry is untouched by this plan, so the document must be byte-identical.
  A diff means the generator edit changed behaviour, not just types.
- **The `dom` project reports that a settings test now needs `getAnimations`,
  or otherwise throws inside a base-ui primitive.** Do not "fix" it by
  reaching for `mock.module`/`vi.mock` — AGENTS.md forbids mocking our own
  modules and base-ui is a known happy-dom trap. Report it.
- **You find yourself needing a test that opens the base-ui `Select` popup.**
  No test in this repo drives one, and the enum path is covered instead by the
  contracts unit test plus the Step 7 dev-server check. Do not add one.
- **A step's verification fails twice after a reasonable fix attempt.**
- **The fix appears to require touching a file on the Out-of-scope list.**

## Maintenance notes

For whoever owns this next:

- **What a reviewer should scrutinize**, in order of risk:
  1. The `defineSetting` signature. It is the whole enforcement. Confirm the
     binding is on the **parameter** (`SettingDescriptor<TSchema> & { readonly widget: … }`)
     and that the **return** type is still the plain `SettingDescriptor<TSchema>`
     — that asymmetry is what keeps `satisfies Readonly<Record<string, SettingDescriptor>>`
     working in `keys.ts`.
  2. `ValueWidget`'s array arms. `providers` and `models` are distinguished only
     by the element type (`ProviderInstanceConfig` has `driverKind`, `ModelRef`
     has `model`), so if either schema loses a required field the two could start
     accepting each other's widget. The two `@ts-expect-error` declarations added
     to `settings-registry.test.ts` are the tripwire for exactly that.
  3. The `'unsupported'` branch. It is deliberately unreachable for registered
     keys — the resolver never lets a value that fails its schema into
     `snapshot.values` — so if it ever renders on the real page, something
     upstream in `settings/resolve.ts` changed.
- **Cost note, deliberately accepted**: `settingControl` runs `v.safeParse` on
  every render for the `providers` and `record` rows, where the old code cast.
  Two rows, tens of entries, only while the settings page is mounted — and it is
  what makes those branches cast-free. It also means those two `value` objects
  get a fresh identity each render, which is harmless here and **the reason
  `settingControl` must never be wired into `useSettingValue`, `boot-mirror.ts`
  or the keymap** (`keys.ts:450-457` documents consumers that diff
  object-valued settings by identity).
- **Adding a widget kind later** is now a three-place change and the compiler
  finds all three: add the literal to `SettingWidget`, add its arm to
  `ValueWidget`, add its member to `SettingControl` plus a branch in
  `settingControl` and in `setting-row.tsx`. Skipping the last two makes the new
  kind render the JSON hint — visible, not silent.
- **Deliberately deferred, with reasons**:
  - _No runtime widget/schema check in `registryProblems`._ The compiler now
    covers it; a second check would be the same rule written twice, which is the
    exact anti-pattern the audit's theme T1 names.
  - _`string`, `multiline`, `list` and `complex` are kept_ despite the shipping
    registry using none of them. `string`/`multiline` and `list` are load-bearing
    in contracts' own test fixtures, and `complex` is the escape hatch
    `WidgetFor` always permits. Deleting them is a separate call, not this one.
  - _`RowActions`'s `value: unknown`_ stays — it only serialises the value, so
    `unknown` is the honest type.
  - _`type SettingWidget`'s barrel export line_ stays; plan 022 owns removing
    barrel names with no external reference, and touching it here would collide.
