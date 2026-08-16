# Plan 046: Route `POST /settings/raw` through `write()`'s secret guard

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**, from the repo root:
> `git diff --stat ace313f -- apps/server/src/settings/ apps/web/src/features/settings/tests/page.test.tsx`
> (No `..HEAD` — that form hides uncommitted work, and this repo's working tree
> is dirty on purpose.) Expected when nothing drifted: **no output**. If a file
> is listed, open it and compare the "Current state" excerpts below against the
> live code before proceeding; on a mismatch, treat it as a STOP condition.
>
> Unrelated files elsewhere (`apps/web/src/features/editor/`,
> `packages/contracts/src/settings/registry.ts`, `plans/009-*.md`, …) are
> already modified in the working tree. That is expected — leave them alone, do
> not stash, do not revert.
>
> **Baseline, measured at `ace313f`**: in `apps/server`, `bun run lint` and
> `bun run format:check` both exit 0 today. So a failure in either after your
> change is yours; the same is true of `bun run typecheck` there. Do **not** run
> `bun run verify` at the repo root — it is red
> at this commit for unrelated reasons (`apps/web format:check` trips on
> uncommitted settings work-in-progress), so it can never be a gate for you.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

`AGENTS.md` makes one load-bearing safety claim about the settings document:

> Secrets never enter the settings document. They go to the secret store, which
> is why the raw JSON view, export and the settings file itself are safe to read.

`POST /settings/raw` is the one code path that can break that claim. It replaces
the whole settings document with client-supplied text and hands it straight to
the file layer, skipping the secret split that `SettingsStore.write()` applies to
every keyed edit. A provider credential typed into that text is therefore
persisted **in cleartext** into `~/.platform/settings.json` — the exact file
`GET /settings/raw` serves, the "Open Settings (JSON)" action copies to the
clipboard, and the agent itself can read.

Then it fails a second time, silently and in the opposite direction: at spawn,
`applyProviderSecrets` unconditionally rewrites _every_ provider environment
value to `secrets.get(ref) ?? ''`. There is no secret for that ref, so the
credential the user just saved is replaced by an empty string. The document says
the variable is set, the provider starts without it, and the user sees "my key
does not work" with nothing anywhere explaining why.

Framing, honestly: this is a local developer tool, and the actor here is the
user typing into their own file on their own machine — there is no remote
attacker in this path and nothing to escalate to. What makes it worth fixing is
not blast radius but that it silently voids a documented invariant and produces
a failure with no diagnosable symptom. Hence P3, not P1.

After this plan: raw writes absorb any credential into the secret store the same
way keyed writes do, so the document stays safe to read _and_ the value actually
reaches the provider. The secret split is hand-written at one entry point and
simply absent at the other, with nothing checking that the two agree.

**Do not delete the route or `writeRaw`, however dead they look.** The route is
designed, not accidental (`docs/settings-architecture-plan.md:112` keeps
`GET/POST /settings/raw` in the API surface; line 328 specifies it as
"Whole-text replace. Refuses on parse errors, same as a keyed write."), and it
has a live caller at `apps/web/src/features/settings/tests/page.test.tsx:81`.
The secret-split bypass is the one real defect here, and it is all this plan
fixes — everything else that looks unguarded on this path has a backstop at
resolution time (see "Deliberate non-goals" below).

## Current state

Files, and their role here:

- `apps/server/src/settings/store.ts` — the settings store. `write()` (keyed
  edits) applies the guards; `writeRaw()` (whole-text) does not.
- `apps/server/src/settings/secrets.ts` — the secret store and the
  document↔secret split functions.
- `apps/server/src/settings/layer.ts` — one settings file; `writeText()` is what
  `writeRaw` calls.
- `apps/server/src/settings/routes.ts` — the five settings routes. **Unchanged by
  this plan.**
- `apps/server/src/settings/json-document.ts` — tolerant JSONC parse and a
  surgical text-edit helper.

### The unguarded write (`apps/server/src/settings/store.ts:181-190`)

```ts
  async writeRaw(
    target: SettingsWriteTarget,
    text: string,
    baseRevision?: string,
  ): Promise<SettingsSnapshot> {
    await this.layerFor(target).writeText(text, baseRevision)
    this.invalidate()

    return this.snapshot()
  }
```

Five lines. No secret split, no log event.

### What the keyed path does instead (`apps/server/src/settings/store.ts:133-152`)

```ts
    for (const edit of request.edits) {
      this.assertWritable(edit.key, edit.target)
      const prepared = this.prepare(edit.key, edit.value, secretEdits)
      ...
    }

    // Secrets first: a settings file naming a variable whose value never landed
    // is recoverable, the reverse leaves a secret with nothing referencing it.
    await this.secretStore.write(secretEdits)
```

and inside `prepare` (`store.ts:251-256`):

```ts
if (key !== PROVIDER_INSTANCES) return { key, value: parsed.output }

const split = extractProviderSecrets(parsed.output)
for (const [ref, secret] of split.secrets) secretEdits.set(ref, secret)

return { key, value: split.instances }
```

`PROVIDER_INSTANCES` is declared at `store.ts:30`:

```ts
const PROVIDER_INSTANCES = 'providers.instances' as const
```

### The invariant this breaks (`apps/server/src/settings/store.ts:169-174`)

```ts
/**
 * The raw file text, for the JSON escape hatch.
 *
 * Safe to serve only because secrets are not in this file — the split is what
 * lets the hatch, the export, and the editor tab exist at all.
 */
```

### The silent second failure (`apps/server/src/settings/secrets.ts:154-157`)

```ts
/** Puts stored values back on their variables, for the spawn path only. */
export function applyProviderSecrets<T>(instances: T, secrets: ReadonlyMap<SecretRef, string>): T {
  return mapEnvironment(instances, (ref) => secrets.get(ref) ?? '') as T
}
```

Unconditional. A value living in the document, not the secret store, becomes
`''` at spawn.

### The existing split, and the one rule that is wrong for raw text (`apps/server/src/settings/secrets.ts:140-152`)

```ts
export function extractProviderSecrets(instances: unknown): {
  readonly instances: unknown
  readonly secrets: Map<SecretRef, string | null>
} {
  const secrets = new Map<SecretRef, string | null>()
  const stripped = mapEnvironment(instances, (ref, value) => {
    if (value !== REDACTED_SETTINGS_VALUE) secrets.set(ref, value === '' ? null : value)

    return ''
  })

  return { instances: stripped, secrets }
}
```

`null` means "delete the stored secret" (`SecretStore.write`, `secrets.ts:64-79`).
That method also early-returns on an empty map, so writing zero secrets never
creates `secrets.json` — the new tests rely on that.

**This is the single most dangerous detail in the plan.** That `'' → null` rule
is correct for the keyed path, because the client always holds the _mask_
(`REDACTED_SETTINGS_VALUE`, `'••••••••'`) for a variable that is set — so an
empty value there can only have been typed by a user clearing it. But the
document **on disk** stores `''` for both "set, value lives in the secret store"
and "genuinely unset" — that is the entire point of the split. So in raw text an
empty value carries **no information at all**. Reusing `extractProviderSecrets`
for the raw path would wipe every provider credential the first time anyone
opened the raw editor and changed an unrelated key.

Proof that `''` is what lands on disk — `apps/server/src/settings/tests/secrets.test.ts:92-101`
asserts the stripped document is `environment: [{ name: 'OPENAI_API_KEY', value: '' }, ...]`.

### Helpers you will use (`apps/server/src/settings/json-document.ts`)

```ts
// json-document.ts:62
export function parseSettingsDocument(text: string): ParsedSettingsDocument
//   -> { values: Record<string, unknown>; parseErrors: readonly SettingsParseError[] }
//   Tolerant: never throws, returns partial values plus errors.

// json-document.ts:86
export function editSettingsText(text: string, edits: readonly DocumentEdit[]): string
//   Text in, text out, via jsonc-parser `modify`/`applyEdits`. Preserves
//   comments, key order and everything it does not touch. Its doc comment:
//   "Parsing, mutating and re-stringifying would drop comments, reorder keys,
//    and silently delete any key this build does not know about".

export type DocumentEdit = { readonly key: string; readonly value?: unknown }
```

### Errors and logging — house rules that apply here

`AGENTS.md`:

> Never throw `new Error`. Create errors with `createError` from `evlog` — in
> practice through the feature's `structured-errors.ts` wrapper
> (`createStructuredError` or a `defineErrorCatalog` entry) so the error carries
> `code`, `status`, `why`, and `fix`.

> Logging is wide-event style (evlog). Always prefer wide logs: enrich the one
> event per operation/request with more fields instead of emitting extra narrow
> log lines.

The catalog already has every error this plan needs —
`apps/server/src/settings/structured-errors.ts`:

```ts
  SCOPE_NOT_ALLOWED: {
    status: 400,
    message: ({ key, scope, target }: { key: string; scope: string; target: string }) =>
      `${key} is ${scope}-scoped and cannot be written to ${target} settings`,
    ...
  },
  FILE_MALFORMED: {
    status: 409,
    message: ({ file, detail }: { file: string; detail: string }) =>
      `Settings file has syntax errors: ${file} (${detail})`,
```

**Add no new catalog entries.**

Control flow — `AGENTS.md`: "Keep nesting depth to 3 or less. Use guard clauses
and early returns… Do not use `else` after an early return." The code below
already follows that; keep it that way.

### Deliberate non-goals — do NOT add these guards

`write()` also calls `assertWritable` (`store.ts:259-267`), which throws
`UNKNOWN_KEY`, `POLICY_CONTROLLED` and `SCOPE_NOT_ALLOWED`. **Do not port that
wholesale onto the raw path.** Each is already handled, and porting it breaks a
documented behaviour:

1. **Unknown keys must survive.** `packages/contracts/src/settings/resolve.ts:242-247`:
   "Unknown keys are rejected as contributions but never removed from `raw`, so a
   key written by a build that has it survives a build that does not."
   `apps/web/src/features/settings/tests/page.test.tsx:76-88` writes
   `{ "editor.fromANewerBuild": true }` **through this exact route** and asserts
   the page shows a "not applied" diagnostic. An `UNKNOWN_KEY` throw fails that
   test and kills the escape hatch's purpose.
2. **Out-of-scope keys are already neutralised at resolution.**
   `resolve.ts:259-269` turns a scope violation into a `scope-not-allowed`
   diagnostic instead of a value. The page's "set here, not applied" affordance
   depends on the layer keeping the raw key (`resolve.ts:28-32`).
3. **Policy-controlled keys are already overridden.** `store.ts:289` appends the
   policy layer last and `resolve.ts:328` returns the policy value regardless of
   what the file says.

Only the secret split has **no** resolution-time backstop, because
`applyProviderSecrets` reads from the secret store unconditionally. That is why
it — and only it — is in scope.

## Commands you will need

| Purpose                                           | Command                                                                                                                                                                          | Expected on success       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Server typecheck                                  | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck`                                                                                                            | exit 0, no errors         |
| Server settings tests (**this is the gate**)      | `cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/settings`                                                                                            | all pass                  |
| Web settings page test (the route's other caller) | `cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project node --project dom src/features/settings/tests/page.test.tsx`                                     | all pass                  |
| Server lint                                       | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run lint`                                                                                                                 | exit 0                    |
| Format check                                      | `cd /Users/shaul/Desktop/D/platform/apps/server && bun run format:check`                                                                                                         | exit 0                    |
| Format just your files                            | `cd /Users/shaul/Desktop/D/platform/apps/server && ./node_modules/.bin/oxfmt --write src/settings/secrets.ts src/settings/store.ts src/settings/tests/raw-write-secrets.test.ts` | rewrites only those files |

**Do NOT run `bun run test` in `apps/server` (the whole suite).** Unrelated
suites in it open the metadata database at
`platformHomePath('fs-metadata.sqlite')` unless `FS_METADATA_DB` is set
(`apps/server/src/db/client.ts:8`), so a full run scribbles on the developer's
real `~/.platform/` state. That is a separate defect, not yours to fix here, and
not something to work around by editing test config. Your change is confined to
`src/settings/`, and `bun --bun vitest run src/settings` covers every suite that
can observe it. If you believe you need broader coverage, stop and report
instead of running the full suite.

Also **do not run `bun run verify` at the repo root** — see the baseline note at
the top of this file.

A dev server is already running at http://localhost:5173. **Never start one** —
`AGENTS.md`: "A dev server is always running. Never spin up your own server to
test or verify changes — reuse the running one." This plan needs no browser
verification.

## Scope

**In scope** (the only files you may modify):

- `apps/server/src/settings/secrets.ts` — add one exported function.
- `apps/server/src/settings/store.ts` — `writeRaw` + one new private method.
- `apps/server/src/settings/tests/raw-write-secrets.test.ts` (create).
- `plans/README.md` — status row only.

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/src/settings/routes.ts` — the route wiring and its
  `rawWriteSchema` are correct; the guard belongs in the store, beside `write()`'s.
  The file's header comment explains on purpose why bodies are not validated by
  Elysia; leave it alone.
- Deleting `POST /settings/raw` or `SettingsStore.writeRaw` — designed API
  surface (`docs/settings-architecture-plan.md:112,328`) with a live caller
  (`apps/web/.../page.test.tsx:81`).
- `extractProviderSecrets` and the keyed `write()` path — its `'' → null` rule is
  correct for its input and is pinned by
  `apps/server/src/settings/tests/provider-instance-reconciliation.test.ts`.
  Changing it breaks the "clears the secret when the value is emptied" behaviour.
- `SecretStore.write` (`secrets.ts:64-79`) — its delete-on-null rule is fine.
- `rawLayer()` and `GET /settings/raw` (`store.ts:169-179`) — do **not** add
  masking or filtering on the read side. The fix is that the value never lands
  in the file; a read-side filter would paper over a write-side leak and make the
  next regression invisible.
- `apps/server/src/db/`, `apps/server/vitest.config.ts`, and any test-harness or
  environment plumbing (`FS_METADATA_DB`, setup files). The full-suite home-directory
  hazard noted above is a different problem; do not fix it here and do not route
  around it.
- Any new registry entry in `packages/contracts/src/settings/keys.ts`. This plan
  adds no user-facing knob, so nothing to register and nothing to regenerate.
- `apps/server/src/settings/layer.ts` — `writeText` already refuses malformed
  incoming text with the typed error; the fix relies on that, do not duplicate it.
- `apps/web/src/features/settings/utils/open-settings-json.ts` — read-only
  (`settings.raw.get`), unaffected.
- `packages/contracts/src/settings/keys.ts` and `docs/settings-reference.md` — no
  registry entry changes, so nothing to regenerate.
- `docs/settings-architecture-plan.md` — a historical design record; do not edit it.
- The external hand-edit path (a credential typed straight into
  `~/.platform/settings.json` by a text editor). Same defect, deliberately not
  fixed here — see "Maintenance notes". In particular: do **not** add secret
  absorption to `SettingsStore.invalidate()` (`store.ts:305-312`), the watcher's
  callback. That would have the server rewrite a file the user has open.
- `maskProviderSecrets` and `snapshot()`'s masking (`store.ts:78-97`) — already
  correct, and the reason a stray mask literal left in a raw document is inert.
- The existing settings tests (`json-document.test.ts`,
  `provider-instance-reconciliation.test.ts`, `secrets.test.ts`,
  `store-watch.test.ts`). They are the regression gate. If one of them starts
  failing, the new code is wrong — do not edit, weaken, or delete the test.
- `packages/contracts/src/settings/resolve.ts` — the resolver's diagnostics are
  what make the "deliberate non-goals" safe; changing it moves the goalposts.
- `bun run format` at the repo root or in `apps/web` — it rewrites unrelated
  work-in-progress files. Format only your three files (command table below).
- `packages/editor-*` — symlinks to a sibling checkout, never in scope.

## Git workflow

- **All work happens on `main`** — no new branches, worktrees, commits, pushes,
  or PRs unless the operator explicitly asks.
- If the operator does ask for a commit: conventional commits, lowercase
  descriptive subject. Real examples from `git log`:
  - `refactor(orchestration): the server prepares a session's worktree (M-C)`
  - `fix(address): bound the URL, and stop escaping slashes in ?tabs=`
  - A fitting subject here: `fix(settings): split secrets out of a raw settings write`

## Steps

### Step 1: Add the raw-document variant of the secret split

In `apps/server/src/settings/secrets.ts`, add this **after** the existing
`extractProviderSecrets` function (around line 152) and before
`applyProviderSecrets`. It reuses the module-private `mapEnvironment` helper
already defined at line 104.

```ts
/**
 * The same split for the raw JSON hatch, with one rule reversed.
 *
 * `extractProviderSecrets` reads `''` as "the user cleared this variable" and
 * deletes the stored secret. That is right for the keyed path, where the client
 * holds the mask for every variable that is set, so an empty value can only have
 * been typed. The document on disk holds `''` for *both* "set, stored
 * elsewhere" and "never set" — that is the whole point of the split — so in raw
 * text an empty value says nothing. Deleting on it would wipe every provider
 * credential the first time someone opened the raw editor and changed an
 * unrelated key.
 *
 * So: a value that is actually there is absorbed into the secret store and
 * blanked in the document, and anything else is left alone. There are no
 * deletions from this path.
 */
export function extractRawProviderSecrets(instances: unknown): {
  readonly instances: unknown
  readonly secrets: Map<SecretRef, string>
} {
  const secrets = new Map<SecretRef, string>()
  const stripped = mapEnvironment(instances, (ref, value) => {
    if (value !== '' && value !== REDACTED_SETTINGS_VALUE) secrets.set(ref, value)

    return ''
  })

  return { instances: stripped, secrets }
}
```

`REDACTED_SETTINGS_VALUE` and `SecretRef` are already in scope in this file
(line 1 import, line 17 type) — add no imports.

**Verify**: `cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck`
→ exit 0.

### Step 2: Run the split before a raw write reaches disk

In `apps/server/src/settings/store.ts`:

**2a.** Widen the `json-document` import (currently `store.ts:17`, a type-only
import) to bring in the two value helpers:

```ts
// before
import type { DocumentEdit } from './json-document'
// after
import { editSettingsText, parseSettingsDocument, type DocumentEdit } from './json-document'
```

**2b.** Add `extractRawProviderSecrets` to the existing `./secrets` import block
(`store.ts:19-25`), keeping alphabetical order:

```ts
import {
  applyProviderSecrets,
  extractProviderSecrets,
  extractRawProviderSecrets,
  maskProviderSecrets,
  SecretStore,
  type SecretRef,
} from './secrets'
```

**2c.** Replace `writeRaw` (`store.ts:181-190`) with:

```ts
  /**
   * Whole-text replace, for the JSON escape hatch.
   *
   * Runs the same secret split the keyed path runs. Without it this is the one
   * route that can land a provider credential in the settings document, where it
   * would sit in cleartext in the very file `GET /settings/raw`, the JSON tab and
   * export all serve — and then be replaced by an empty string at spawn, because
   * `applyProviderSecrets` reads every environment value from the secret store.
   * The file says the variable is set, the provider starts without it, and
   * nothing anywhere says why.
   *
   * Unknown, out-of-scope and policy-controlled keys are deliberately *not*
   * refused here the way `write` refuses them: the resolver reports each as a
   * diagnostic and drops it, and keeping another build's keys in the file is
   * this hatch's job.
   */
  async writeRaw(
    target: SettingsWriteTarget,
    text: string,
    baseRevision?: string,
  ): Promise<SettingsSnapshot> {
    const document = this.splitRawSecrets(target, text)

    // Secrets first, for the reason `write` gives: a document naming a variable
    // whose value never landed is recoverable, the reverse is not.
    await this.secretStore.write(document.secrets)
    await this.layerFor(target).writeText(document.text, baseRevision)
    this.invalidate()
    recordRequestContext({
      area: 'settings',
      operation: 'write-raw',
      settings: {
        // Ids and counts only. This route carries the whole document, so a value
        // in the log would be the exact leak the split exists to prevent.
        target,
        settingIds: document.settingIds,
        secretsChanged: document.secrets.size,
      },
    })

    return this.snapshot()
  }
```

**2d.** Add this private method next to the other private helpers, immediately
after `prepare` (which ends at `store.ts:257`) and before `assertWritable`:

```ts
  /**
   * Takes any provider credential out of incoming raw text before it reaches
   * disk, and returns the text to actually write.
   *
   * A malformed document is handed straight back: `writeText` raises the typed
   * FILE_MALFORMED for it, and storing a secret for a document that is about to
   * be refused would leave a value with nothing referencing it.
   */
  private splitRawSecrets(
    target: SettingsWriteTarget,
    text: string,
  ): { text: string; secrets: Map<SecretRef, string>; settingIds: string[] } {
    const parsed = parseSettingsDocument(text)
    if (parsed.parseErrors.length > 0) return { text, secrets: new Map(), settingIds: [] }

    const settingIds = Object.keys(parsed.values)
    if (!Object.hasOwn(parsed.values, PROVIDER_INSTANCES)) {
      return { text, secrets: new Map(), settingIds }
    }

    const split = extractRawProviderSecrets(parsed.values[PROVIDER_INSTANCES])
    // Nothing to absorb: hand the user's bytes straight back. `editSettingsText`
    // re-serializes the subtree it touches, so rewriting on every save would
    // reformat `providers.instances` and drop any comment inside it — on a save
    // that changed nothing. Byte fidelity is the hatch's whole job.
    if (split.secrets.size === 0) return { text, secrets: split.secrets, settingIds }

    // `providers.instances` is application-scoped precisely because it reaches
    // process spawn, and a workspace file ships inside a cloned repository. The
    // resolver already refuses to *apply* it from there — but that happens after
    // the bytes are on disk, which for this key means a credential committed to
    // someone's repo. Naming the key from a workspace file stays legal, because
    // "set here, not applied" is a diagnostic the page is built to show; only
    // carrying a value is not.
    if (target !== 'user') {
      throw settingsErrors.SCOPE_NOT_ALLOWED({
        key: PROVIDER_INSTANCES,
        scope: 'application',
        target,
      })
    }

    return {
      // `editSettingsText`, not a re-serialize: the hatch has to hand the user's
      // comments and key order back unchanged.
      text: editSettingsText(text, [{ key: PROVIDER_INSTANCES, value: split.instances }]),
      secrets: split.secrets,
      settingIds,
    }
  }
```

**Verify**:

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun run typecheck
```

→ exit 0.

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/settings
```

→ all existing settings tests still pass (4 files: `json-document.test.ts`,
`provider-instance-reconciliation.test.ts`, `secrets.test.ts`,
`store-watch.test.ts`).

> `Map<SecretRef, string>` is assignable to `SecretStore.write`'s
> `ReadonlyMap<SecretRef, string | null>`; no cast is needed. If tsgo disagrees,
> widen the declared return types of `extractRawProviderSecrets` and
> `splitRawSecrets` to `Map<SecretRef, string | null>` — **never** add a cast
> (`AGENTS.md`: readonly/mutable mismatches are contract bugs, not cast targets).

### Step 3: Test the fix

Create `apps/server/src/settings/tests/raw-write-secrets.test.ts`. See the "Test
plan" section below for the full file. Server tests import from `vitest`
directly (only `apps/web` tests use `test/fixtures.ts`), and they drive the real
`SettingsStore` over a `mkdtemp` directory — model:
`apps/server/src/settings/tests/provider-instance-reconciliation.test.ts:12-50`.

**Verify**:

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/settings/tests/raw-write-secrets.test.ts
```

→ 7 tests pass.

### Step 4: Confirm the route's other caller still works, then lint and format

**Verify**, in order:

```
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project node --project dom src/features/settings/tests/page.test.tsx
```

→ all pass, including `shows a diagnostic for a key the settings file holds but
cannot apply` (that test posts to `POST /settings/raw`).

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/settings
```

→ all pass: the four pre-existing settings suites plus your 7 new tests. This is
the test gate. Do **not** substitute `bun run test` — see "Commands you will
need".

```
cd /Users/shaul/Desktop/D/platform/apps/server && bun run lint && bun run format:check
```

→ both exit 0. If `format:check` flags your files, run
`./node_modules/.bin/oxfmt --write src/settings/secrets.ts src/settings/store.ts src/settings/tests/raw-write-secrets.test.ts`
and re-check. Do **not** run a workspace-wide `bun run format`.

### Step 5: Update the index

In `plans/README.md`, change the status cell of the row
`| 046 | [Route \`POST /settings/raw\` through \`write()\`](046-settings-raw-write-guards.md) | P3 | S | — | TODO |`from`TODO`to`DONE`.

**Verify**: `grep -n "046-settings-raw-write-guards" /Users/shaul/Desktop/D/platform/plans/README.md`
→ the row's last cell reads `DONE`.

## Test plan

New file `apps/server/src/settings/tests/raw-write-secrets.test.ts`, seven cases.
Structural model: `apps/server/src/settings/tests/provider-instance-reconciliation.test.ts`
(same directory, same temp-store-plus-`afterEach`-cleanup harness).

**No real or realistic credential strings anywhere.** The test value below is a
plain sentinel; its only property that matters is that it is non-empty and
findable with `toContain`.

```ts
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsStore } from '../store'

const stores: SettingsStore[] = []
const roots: string[] = []

/** A sentinel, not a credential: what matters is only that it is non-empty. */
const TYPED_BY_HAND = 'value-typed-into-the-raw-editor'

async function createSettings(options: { workspace?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'settings-raw-'))
  roots.push(root)
  const store = new SettingsStore({
    userFilePath: path.join(root, 'settings.json'),
    watch: false,
    workspaceRoot: options.workspace ? path.join(root, 'repo') : null,
  })
  stores.push(store)

  return { root, store }
}

function instances(value: string) {
  return [
    {
      driverKind: 'codex',
      environment: [{ name: 'CODEX_TOKEN', value }],
      providerInstanceId: 'codex-work',
    },
  ]
}

function documentWith(value: string) {
  return `${JSON.stringify({ 'providers.instances': instances(value) }, null, 2)}\n`
}

/** The one variable `instances` sets, out of whatever list it is handed. */
function environmentValue(list: unknown): unknown {
  const first = Array.isArray(list) ? list[0] : undefined

  return first?.environment?.[0]?.value
}

afterEach(async () => {
  for (const store of stores.splice(0)) store.close()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('raw settings writes', () => {
  it('keeps a value typed into the raw document out of the file', async () => {
    const { root, store } = await createSettings()

    await store.writeRaw('user', documentWith(TYPED_BY_HAND))

    // The file `GET /settings/raw`, the JSON tab and export all serve.
    expect(await readFile(path.join(root, 'settings.json'), 'utf8')).not.toContain(TYPED_BY_HAND)
    expect(store.rawLayer('user').text).not.toContain(TYPED_BY_HAND)
    // Not merely dropped, either: the provider actually starts with it. Storing
    // it in the document instead left it blanked at spawn and unexplained.
    expect(environmentValue(await store.providerInstancesForSpawn())).toBe(TYPED_BY_HAND)
  })

  it('keeps a stored secret when the raw document round-trips unchanged', async () => {
    const { store } = await createSettings()
    await store.write({
      edits: [{ key: 'providers.instances', target: 'user', value: instances(TYPED_BY_HAND) }],
    })

    // Exactly what the hatch does: read the file, change nothing about the
    // provider rows, save it back. The document holds '' for every variable,
    // which says nothing about whether one is set — reading that as "cleared"
    // would delete every credential on the first save after every read.
    const before = store.rawLayer('user').text
    await store.writeRaw('user', before)

    expect(environmentValue(await store.providerInstancesForSpawn())).toBe(TYPED_BY_HAND)
    // Byte-for-byte: with nothing to absorb the hatch must not reformat the
    // document it was handed.
    expect(store.rawLayer('user').text).toBe(before)
  })

  it('still saves a workspace raw document that carries no value', async () => {
    const { store } = await createSettings({ workspace: true })

    // The scope guard must fire on a *value*, not on the key. Refusing the key
    // outright would break "set here, not applied", which the page is built to
    // show, and would make the workspace hatch unusable.
    await store.writeRaw('workspace', documentWith(''))

    expect(store.rawLayer('workspace').text).toContain('providers.instances')
    expect(store.snapshot().diagnostics.map((entry) => entry.kind)).toContain('scope-not-allowed')
  })

  it('refuses a value in a workspace raw document rather than committing it', async () => {
    const { root, store } = await createSettings({ workspace: true })

    // `providers.instances` is application-scoped because it reaches spawn, and
    // a workspace file ships inside a cloned repository.
    await expect(store.writeRaw('workspace', documentWith(TYPED_BY_HAND))).rejects.toThrow(
      /application-scoped/,
    )
    expect(store.rawLayer('workspace').text).toBe('')
    expect(existsSync(path.join(root, 'secrets.json'))).toBe(false)
  })

  it('stores nothing when the incoming document is malformed', async () => {
    const { root, store } = await createSettings()

    // Refused by `writeText`. Absorbing the secret first would leave a value
    // with nothing on disk referencing it.
    await expect(
      store.writeRaw(
        'user',
        `{ "providers.instances": [{ "environment": [{ "name": "CODEX_TOKEN", "value": "${TYPED_BY_HAND}" }] }`,
      ),
    ).rejects.toThrow(/syntax errors/)
    expect(existsSync(path.join(root, 'secrets.json'))).toBe(false)
    expect(existsSync(path.join(root, 'settings.json'))).toBe(false)
  })

  it('keeps a key this build does not register', async () => {
    const { store } = await createSettings()

    // The hatch's job. An unknown-key refusal here would delete another build's
    // settings on the first save, so the guard is deliberately not ported.
    await store.writeRaw('user', '{ "editor.fromANewerBuild": true }\n')

    expect(store.rawLayer('user').text).toContain('editor.fromANewerBuild')
    expect(store.snapshot().diagnostics.map((entry) => entry.id)).toContain(
      'editor.fromANewerBuild',
    )
  })

  it('preserves comments and unrelated keys while it strips the value', async () => {
    const { store } = await createSettings()
    const text = `{
  // kept across the strip
  "workbench.colorTheme": "light",
  "providers.instances": ${JSON.stringify(instances(TYPED_BY_HAND), null, 2)}
}
`

    await store.writeRaw('user', text)

    const saved = store.rawLayer('user').text
    expect(saved).toContain('// kept across the strip')
    expect(saved).toContain('"workbench.colorTheme": "light"')
    expect(saved).not.toContain(TYPED_BY_HAND)
  })
})
```

**Verification**: `cd /Users/shaul/Desktop/D/platform/apps/server && bun --bun vitest run src/settings/tests/raw-write-secrets.test.ts`
→ 7 passed, 0 failed.

The existing suites are the regression gate for everything else this touches:
`provider-instance-reconciliation.test.ts` pins the keyed path's `'' → delete`
rule (which must stay unchanged), and `apps/web`'s `page.test.tsx` pins the raw
route's unknown-key tolerance.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd apps/server && bun run typecheck` exits 0
- [ ] `cd apps/server && bun --bun vitest run src/settings` exits 0, and its
      summary includes 7 passing tests from
      `src/settings/tests/raw-write-secrets.test.ts`
- [ ] `cd apps/web && bun --bun vitest run --project node --project dom src/features/settings/tests/page.test.tsx`
      exits 0
- [ ] `cd apps/server && bun run lint` exits 0 and `bun run format:check` exits 0
      (both exit 0 at `ace313f`, so any failure is from your change)
- [ ] From the repo root,
      `grep -ln extractRawProviderSecrets apps/server/src/settings/secrets.ts apps/server/src/settings/store.ts`
      prints both files, and
      `grep -rl extractRawProviderSecrets apps/server/src packages` prints no
      third file
- [ ] `grep -c "writeText" apps/server/src/settings/store.ts` prints `1`, and that
      one call passes `document.text` (the value `splitRawSecrets` returned), not
      the caller's `text`
- [ ] `git status --short` shows exactly four paths that were **not** dirty
      before you started:
      `apps/server/src/settings/secrets.ts`,
      `apps/server/src/settings/store.ts`,
      `apps/server/src/settings/tests/raw-write-secrets.test.ts`,
      `plans/README.md`.
      The tree is already dirty with unrelated work — capture the baseline with
      `git status --short > /tmp/046-before.txt` **before** step 1 and diff
      against it at the end. Never revert or commit anything from the baseline.
- [ ] `plans/README.md` row 046 reads `DONE`

## STOP conditions

Stop and report back (do not improvise) if:

- `SettingsStore.writeRaw` at `store.ts:181` is not the five-line body quoted in
  "Current state" — the code has drifted and this plan's premise may already be
  fixed or reshaped.
- `extractProviderSecrets` at `secrets.ts:140-152` no longer maps `''` to `null`.
  The whole reason for a separate raw variant is that rule; if it is gone,
  re-derive before writing anything.
- The round-trip test (`keeps a stored secret when the raw document round-trips
unchanged`) fails. That almost certainly means you reused
  `extractProviderSecrets` instead of the new raw variant, which would delete
  every provider credential on the first raw save. **Do not make the test
  tolerant** — fix the call.
- `still saves a workspace raw document that carries no value` fails with a
  thrown `SCOPE_NOT_ALLOWED`. You keyed the scope guard to the _key_ rather than
  to an absorbed _value_, or put it before the "nothing to absorb" early return.
  The workspace hatch has to keep saving documents that merely name the key —
  "set here, not applied" is a diagnostic the page renders on purpose.
- The byte-fidelity assertion in the round-trip test fails. `splitRawSecrets` is
  calling `editSettingsText` when `split.secrets.size === 0`; it must hand the
  incoming text back untouched in that case.
- `apps/web`'s `shows a diagnostic for a key the settings file holds but cannot
apply` starts failing. That means an unknown-key or policy refusal reached the
  raw path. Remove it; see "Deliberate non-goals".
- The new test needs `PLATFORM_SETTINGS_FILE`, a home path, or anything outside
  its own `mkdtemp` directory. It does not: `settingsPaths` puts `secrets.json`
  beside the settings file (`paths.ts:41,57-59`), so a temp `userFilePath` redirects
  both. A test that reaches `~/.platform/` overwrites the developer's real
  settings and secrets — stop rather than run it.
- `bun run typecheck` fails anywhere outside `apps/server/src/settings/`.
- Any fix seems to require editing `routes.ts`, `layer.ts`, or the contracts
  package. It does not — the change is one exported function in `secrets.ts`,
  plus `writeRaw` and one private method in `store.ts`.
- A settings suite _other than_ your new file starts failing. Those four suites
  are the regression gate; a failure there means the new code is wrong. Fix the
  new code — never the existing test.
- You find yourself wanting to run the whole `apps/server` suite, edit
  `vitest.config.ts`, or set `FS_METADATA_DB` to make something pass. Stop and
  report: the scoped run is the gate on purpose.
- `store.ts` ends up with more than one `writeText(` call site, or `writeRaw`
  passes the caller's `text` to it instead of `document.text`. That is the fix
  failing to take effect while every test still passes; re-read Step 2c.

## Maintenance notes

For whoever owns this next:

- **The `''` rule is the review target.** In `extractRawProviderSecrets`, empty
  means "no information", never "delete". The keyed path's opposite rule sits
  twelve lines above it in the same file. Anyone consolidating the two functions
  because "they're nearly identical" reintroduces credential loss on every raw
  save. If they are ever merged, it must be behind an explicit parameter with
  both rules named, not a default.
- **Ordering is deliberate**: secrets are written before the document, matching
  `write()`'s stated reason at `store.ts:145-147`. If `writeText` then throws
  (stale revision), a secret exists with nothing referencing it — the recoverable
  direction, on purpose.
- **A hand-edit straight into `~/.platform/settings.json` still has this defect**
  and is deliberately not fixed. The store watches the file
  (`layer.ts:157-161` → `store.invalidate()`), so absorbing secrets there is
  technically possible — but it means the server silently rewriting a file the
  user has open in an editor, racing that editor's own save. If it is ever
  wanted, it needs its own design, not a line in `invalidate()`.
- **If a raw settings _editor UI_ is ever built** (today only a copy-to-clipboard
  read exists, `apps/web/src/features/settings/utils/open-settings-json.ts`), it
  must re-read after saving: the server now writes back _different bytes_ than it
  was sent whenever a provider value was absorbed, so the editor's buffer and its
  `baseRevision` go stale immediately. The returned `SettingsSnapshot` carries
  the fresh `revision`.
- **Known cosmetic edge**: a raw instance with no `providerInstanceId` yields the
  ref `provider..env.NAME`. The value is still absorbed (so it leaves the file —
  the security half holds), but the instance fails schema validation at
  resolution, so the secret ends up orphaned. Not worth code; noted so nobody
  re-discovers it as a bug.
- **Deferred, with reason**: porting `assertWritable`'s policy refusal onto the
  raw path. It would be _consistent_ with the keyed path, but it is a behaviour
  regression risk with no security payoff — a developer whose
  `PLATFORM_SETTINGS_POLICY` pins a key their `settings.json` already contains
  would find raw saves suddenly rejected on a document that saved fine yesterday,
  and the policy layer already wins at resolution (`resolve.ts:328`).
