# Plan 028: Derive the orchestration event catalog from one record

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report —
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**, from the repo root `/Users/shaul/Desktop/D/platform`:
>
> ```bash
> git diff --stat ace313f -- packages/contracts/src/orchestration-events.ts packages/contracts/src/tests/orchestration.test.ts packages/contracts/src/index.ts
> ```
>
> (No `..HEAD` — this form also catches uncommitted working-tree edits, and this
> working tree is dirty by design.)
>
> **Expected output**, measured when this plan was written:
>
> ```
>  packages/contracts/src/index.ts | 3 +++
>  1 file changed, 3 insertions(+)
> ```
>
> That is three _added_ export lines around `index.ts:498-503`
> (`SETTING_ROW_IDS`, `settingRowIds`, `settingRowOwner`) from unrelated in-flight
> settings work — far below the two lines this plan removes, so `319`/`320` still
> point at `orchestrationEventTypeSchema,` / `orchestrationEventTypes,`. Confirm
> that with `sed -n '319,320p' packages/contracts/src/index.ts` before Step 1.
> A larger `index.ts` diff is also fine if plan 022 has landed (it shrinks this
> barrel). But if **`orchestration-events.ts` or `tests/orchestration.test.ts`**
> appear in the diff at all, compare the "Current state" excerpts below against
> the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/022-delete-unreachable-code.md`
- **Category**: tech-debt (complexity)
- **Planned at**: commit `ace313f`, 2026-08-16

## Why this matters

`packages/contracts/src/orchestration-events.ts` writes the orchestration event
catalog down **three times**: a 30-string array (`orchestrationEventTypes`), a
30-member `v.variant` restating all 30 types across 152 lines, and — in the test
suite — a third hardcoded literal list of the same 30 strings. Nothing checks any
copy against any other. The test compares the array to a literal, i.e. to itself;
it never touches the variant. So today, adding an orchestration event needs four
coordinated hand-edits and only the fourth is enforced: an event added to the
variant but not the array leaves the exported type union quietly wrong, and the
reverse leaves a type name the parser rejects at runtime. That is 30 rows × 2
unchecked copies of drift risk in the single contract the whole event-sourced
core replays through.

After this plan there is **one** hand-written list — a
`{ 'event.type': payloadSchema }` record — and the parser variant plus the
`OrchestrationEventType` union are both derived from it. Adding an event becomes
a payload schema plus one row, and it cannot half-land: there is no state where a
type is nameable but unparseable, or parseable but missing from the union.

**This must land before the plan that collapses the dual projection (036 in
`plans/README.md`).** That plan deletes one of two hand-written folds over this
exact event stream; collapsing a 625-line fold is materially safer when the event
catalog it dispatches on is one derived table instead of three lists that can
silently disagree. Doing 036 first means auditing the collapse against a catalog
you cannot trust.

This closes an instance of theme **T1** in `plans/README.md`:

> **T1 — Parallel hand-maintained representations of one truth** … **One rule
> closes all of them: a second representation must be _derived_, never
> _maintained_.**

## Current state

Verified by reading the files at commit `ace313f`. All three copies are exactly
30 entries (`grep -c` confirms 30 / 30 / 30).

### Files

- `packages/contracts/src/orchestration-events.ts` — 478 lines. Holds the string
  array (37–68), the picklist (70), the 30 payload schemas (74–296), the event
  base entries (306–317), the 152-line variant (319–470) and the exported types
  (472–478).
- `packages/contracts/src/tests/orchestration.test.ts` — 450 lines. Line 152
  holds the third literal list.
- `packages/contracts/src/index.ts` — the package's only entry point
  (`"exports": { ".": "./src/index.ts" }`). Re-exports the catalog names at
  319, 320 and 355.

### Copy 1 — the string array (`orchestration-events.ts:37-70`)

```ts
export const orchestrationEventTypes = [
  'project.created',
  'project.meta-updated',
  'project.reordered',
  'project.deleted',
  'thread.created',
  // … 24 more …
  'thread.approval-response-requested',
  'thread.user-input-response-requested',
] as const

export const orchestrationEventTypeSchema = v.picklist(orchestrationEventTypes)
```

### Copy 2 — the variant (`orchestration-events.ts:306-470`)

```ts
const eventBaseSchema = {
  sequence: nonNegativeIntegerSchema,
  eventId: eventIdSchema,
  aggregateKind: orchestrationAggregateKindSchema,
  aggregateId: v.union([projectIdSchema, threadIdSchema]),
  occurredAt: isoDateTimeSchema,
  commandId: v.nullable(commandIdSchema),
  causationEventId: v.nullable(eventIdSchema),
  correlationId: v.nullable(commandIdSchema),
  actorKind: orchestrationActorKindSchema,
  metadata: orchestrationEventMetadataSchema,
} as const

export const orchestrationEventSchema = v.variant('type', [
  v.object({
    ...eventBaseSchema,
    type: v.literal('project.created'),
    payload: projectCreatedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('project.meta-updated'),
    payload: projectMetaUpdatedPayloadSchema,
  }),
  // … 27 more, identical shape …
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.user-input-response-requested'),
    payload: threadUserInputResponseRequestedPayloadSchema,
  }),
])

export type OrchestrationEventType = v.InferOutput<typeof orchestrationEventTypeSchema>
export type OrchestrationAggregateKind = v.InferOutput<typeof orchestrationAggregateKindSchema>
export type OrchestrationActorKind = v.InferOutput<typeof orchestrationActorKindSchema>
export type ProjectCreatedPayload = v.InferOutput<typeof projectCreatedPayloadSchema>
export type ThreadCreatedPayload = v.InferOutput<typeof threadCreatedPayloadSchema>
export type OrchestrationEventMetadata = v.InferOutput<typeof orchestrationEventMetadataSchema>
export type OrchestrationEvent = v.InferOutput<typeof orchestrationEventSchema>
```

### Copy 3 — the test (`tests/orchestration.test.ts:151-187`)

```ts
it('keeps the locked Phase 1 event list without synthetic turn lifecycle events', () => {
  expect(orchestrationEventTypes).toEqual([
    'project.created',
    'project.meta-updated',
    // … 27 more …
    'thread.user-input-response-requested',
  ])
  expect(orchestrationEventTypes).not.toContain('thread.turn-started')
  expect(orchestrationEventTypes).not.toContain('thread.turn-completed')
  expect(orchestrationEventTypes).not.toContain('thread.turn-failed')
})
```

### The picklist half is dead — verified

`git grep` over `apps/`, `packages/`, `scripts/` and `docs/` finds these three
names **only** here:

| Name                           | Every reference in the repo                                                 |
| ------------------------------ | --------------------------------------------------------------------------- |
| `orchestrationEventTypes`      | its own definition; `index.ts:320`; the test at lines 9, 152, 184, 185, 186 |
| `orchestrationEventTypeSchema` | its own definition; `index.ts:319`; `orchestration-events.ts:472`           |
| `OrchestrationEventType`       | its own definition (`:472`); `index.ts:355`                                 |

Zero production consumers. Consumers of the event union narrow with
`Extract<OrchestrationEvent, { type: '…' }>` instead — **51 lines across 8
files** (`git grep -c "Extract<OrchestrationEvent" -- apps`):

| File                                                                     | Lines |
| ------------------------------------------------------------------------ | ----- |
| `apps/server/src/orchestration/projection-pipeline.ts`                   | 18    |
| `apps/server/src/orchestration/projector.ts`                             | 13    |
| `apps/web/src/features/chat/state/chat-projection-writers.ts`            | 15    |
| `apps/server/src/orchestration/event-store.ts`                           | 1     |
| `apps/server/src/orchestration/thread-deletion-reactor.ts`               | 1     |
| `apps/server/src/orchestration/tests/engine.test.ts`                     | 1     |
| `apps/web/src/features/chat/state/tests/chat-projection-writers.test.ts` | 1     |
| `apps/web/src/features/chat/state/tests/thread-diff-scope-store.test.ts` | 1     |

Example (`apps/server/src/orchestration/projector.ts:209-211`):

```ts
function startTurn(
  event: Extract<OrchestrationEvent, { type: 'thread.turn-start-requested' }>,
  model: OrchestrationReadModel,
) {
```

Those 51 narrowings are the real contract this plan must not break. Neither
`projector.ts` (`switch (event.type)` at `:37`) nor `projection-pipeline.ts`
(`:99`) has a `default: never` exhaustiveness assertion, so **typecheck alone is
not a complete guard** — hence the type-derivation gate in Step 3 and the runtime
digest gate in Step 0/Step 4.

The 30 `*PayloadSchema` consts are likewise imported nowhere outside
`packages/contracts`; plan 022 removes their barrel export lines. This plan keeps
the consts themselves and references them from the new record.

### The barrel (`packages/contracts/src/index.ts`)

```
314: export {
315:   orchestrationActorKindSchema,
316:   orchestrationAggregateKindSchema,
317:   orchestrationEventMetadataSchema,
318:   orchestrationEventSchema,
319:   orchestrationEventTypeSchema,
320:   orchestrationEventTypes,
321:   projectCreatedPayloadSchema,
…
353:   type OrchestrationEvent,
354:   type OrchestrationEventMetadata,
355:   type OrchestrationEventType,
356:   type ProjectCreatedPayload,
357:   type ThreadCreatedPayload,
358: } from './orchestration-events'
```

`packages/contracts/src/orchestration-snapshots.ts:16` imports
`orchestrationEventSchema` and `orchestrationAggregateKindSchema` directly from
`./orchestration-events`; both survive this plan untouched.

### Conventions that apply here (from `AGENTS.md` — the executor has not read it)

Quoted verbatim; these govern the choices in the steps below.

- > This project is greenfield and not live: no releases, no external users, no
  > data anyone needs migrated.
- > No backward compatibility shims, no legacy aliases, no deprecation windows.
  > Update every call site in the same pass.
- > Delete obsolete tests instead of preserving old behavior.
- > Remove duplicate code aggressively.
- > Import exact files through `@/`. Do not add barrel `index.ts` files. Barrel
  > files are allowed only at package entry points such as `packages/*/src/index.ts`
  > that back the package's `"."` export. Do not add feature, folder, or utility
  > barrels.
- > Keep nesting depth to 3 or less. Use guard clauses and early returns.
- > Never use nested ternaries. Split the logic into `if` statements or a named
  > helper. _(This is a rule about runtime control flow. TypeScript **conditional
  > types** — `A extends B ? X : Y` — are not ternaries and are used in this plan;
  > oxlint does not flag them.)_
- > Runtime-neutral `packages/*` run plain `vitest`. _(Do **not** add `--bun` to
  > the contracts test command.)_
- > Tests run on Vitest.

The `apps/web` testing rules in `AGENTS.md` (`test/fixtures.ts`,
`renderWithProviders`, the real in-process Elysia server) **do not apply** —
`packages/contracts` is a runtime-neutral package whose tests import `describe`,
`expect`, `it` straight from `vitest`. Follow the neighbouring files.

### Exemplar to match: the existing compile-time gate in this same package

`packages/contracts/src/tests/settings-registry.test.ts:15-49` is the house
pattern for a type-derivation gate. **Match it.** Its own comment explains the
mechanism:

```ts
/**
 * Type-derivation gate.
 *
 * These are declarations, not assertions: `tsgo --noEmit` is what enforces them.
 * `expectTypeOf` would be a runtime no-op here, because no vitest project in
 * this repo enables `test.typecheck` — a broken derivation would report green.
 */
// Assigning parse output to the derived type is the assertion: it only compiles
// if `SettingsValues[K]` really is `v.InferOutput<registry[K]['schema']>`,
// branded ids and all.
const _instancesAreProviderConfigs: SettingsValues['providers.instances'] = v.parse(…)

// @ts-expect-error a keybinding override is a string or null, never a number
const _overrideRejectsNumber: SettingsValues['keybindings.overrides'] = { 'a.b': 3 }

void _instancesAreProviderConfigs
void _overrideRejectsNumber
```

Module-level typed `const` declarations, `@ts-expect-error` for negative
controls, and a trailing `void` per declaration so nothing reads as unused. **Do
not use `expectTypeOf`** — the comment above says why.

## Commands you will need

All run from the repo root `/Users/shaul/Desktop/D/platform`.

| Purpose                                       | Command                                                                                                                               | Expected on success                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Contracts typecheck                           | `bun run --filter '@workspace/contracts' typecheck`                                                                                   | exit 0, no errors                                     |
| Contracts tests                               | `bun run --filter '@workspace/contracts' test`                                                                                        | `Test Files 14 passed (14)`, `Tests 121 passed (121)` |
| Contracts lint                                | `bun run --filter '@workspace/contracts' lint`                                                                                        | exit 0                                                |
| Format the two touched files                  | `./node_modules/.bin/oxfmt --write packages/contracts/src/orchestration-events.ts packages/contracts/src/tests/orchestration.test.ts` | exit 0                                                |
| Confirm formatting                            | `./node_modules/.bin/oxfmt --check packages/contracts/src/orchestration-events.ts packages/contracts/src/tests/orchestration.test.ts` | `All matched files use the correct format.`           |
| Server typecheck (the `Extract<…>` consumers) | `bun run --filter 'server' typecheck`                                                                                                 | exit 0, `Done`                                        |
| Web typecheck (the other consumers)           | `bun run --filter 'web' typecheck`                                                                                                    | **exits 1** — see the baseline below                  |
| Whole-repo lint                               | `bun run lint`                                                                                                                        | exit 0 (warnings are printed and are fine)            |

### Three measured baselines. Read these before you run anything.

All three were measured in this working tree at `ace313f`. Each one looks like a
failure and is not yours.

**1. Contracts suite is `14 files / 120 tests`.** This plan deletes one test and
adds two, so the target after Step 3 is **121**.

**2. `bun run typecheck` (whole repo) ALREADY EXITS 1.** Six of the seven
workspaces pass; `web` reports exactly these three pre-existing errors, all in
in-flight editor work that has nothing to do with this plan:

```
src/features/editor/editor-plugins.ts(37,8): error TS2307: Cannot find module '@singapor/tree-sitter-languages' or its corresponding type declarations.
src/features/editor/tests/editor-syntax-worker.browser.tsx(8,52): error TS2307: Cannot find module '@singapor/tree-sitter-languages' or its corresponding type declarations.
src/features/editor/tests/editor-syntax-worker.browser.tsx(42,45): error TS7006: Parameter 'contribution' implicitly has an 'any' type.
```

**Do not fix them. Do not touch `apps/web/src/features/editor/**`.** The gate for
this plan is not "typecheck exits 0" — it is "`web`'s error list is still exactly
those three lines, and `server`exits 0". Step 5 states that precisely.
(If your`web` typecheck exits 0, the sibling editor checkout got linked in the
meantime — also fine, and a stronger result.)

**3. `bun run --filter '@workspace/contracts' format:check` ALREADY EXITS 1**,
listing exactly one file — `src/settings/keys.ts`, unrelated in-flight settings
work. Do not format it, do not revert it. Use the scoped
`./node_modules/.bin/oxfmt --write <the two files>` command instead of the
package-wide `format` script so you cannot touch it by accident.

`bun run lint` **does** exit 0 today (it prints many warnings; warnings do not
fail it), so that one is a real gate.

## Suggested executor toolkit

- Invoke the **`never-nester`** skill if available
  (`/Users/shaul/.agents/skills/never-nester/SKILL.md`) before Step 2 — the
  derivation must stay a flat `map`, not a nested loop.
- Reference: `packages/contracts/src/tests/settings-registry.test.ts` (the
  compile-time gate pattern you are copying) and
  `packages/contracts/node_modules/valibot/dist/index.d.mts` (search
  `interface VariantSchema` if you need to confirm that `.options` is preserved
  verbatim on the schema object — it is).

## Scope

**In scope** (the only files you may modify):

- `packages/contracts/src/orchestration-events.ts`
- `packages/contracts/src/tests/orchestration.test.ts`
- `packages/contracts/src/index.ts` — **only** the removal of lines 319 and 320.
- `plans/README.md` — the status row for plan 028 only (Step 6).

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/features/editor/**` — the three pre-existing `web` typecheck
  errors live here. They are unrelated in-flight work; "fixing" them would put a
  broken editor-link workaround into someone else's WIP.
- `packages/contracts/src/settings/keys.ts` and everything under
  `apps/web/src/features/settings/` — already dirty in the working tree when you
  start. Leave them byte-for-byte as you found them, including their formatting.

- The 30 `*PayloadSchema` consts and their `export` keywords — they are the rows
  of the new record; changing their visibility is plan 022's business (it owns
  barrel-surface deletion) and would collide with it.
- `type ProjectCreatedPayload` / `type ThreadCreatedPayload`
  (`orchestration-events.ts:475-476`) and their barrel lines 356/357 — also
  unreferenced, also plan 022's business. Leave them exactly as they are.
- `packages/contracts/src/orchestration-snapshots.ts` — imports
  `orchestrationEventSchema` from this module; the exported name and its inferred
  type are unchanged, so it needs no edit.
- `apps/server/src/orchestration/**` and
  `apps/web/src/features/chat/state/**` — the 51 `Extract<…>` narrowings listed
  in "Current state". This change is behaviour-preserving for them; if you find
  yourself editing one, the derivation is wrong. See STOP conditions.
- The `switch (event.type)` blocks in `projector.ts` (`:37`) and
  `projection-pipeline.ts` (`:99`) — adding exhaustiveness assertions is a real
  improvement and explicitly **not** this plan's job.
- `docs/t3code-parity-implementation-plan.md` and
  `docs/t3code-chat-parity-gap-analysis.md` — design docs that mention event type
  strings in prose. They reference no symbol this plan renames.
- Anything under `packages/editor-*` — those are symlinks to a sibling checkout,
  never in scope.

## Git workflow

**All work happens on `main`** — no new branches, worktrees, commits, pushes, or
PRs unless the operator explicitly asks. If you are asked to commit, use
conventional commits with a lowercase descriptive subject. Real examples from
`git log`:

```
refactor(orchestration): the server prepares a session's worktree (M-C)
fix(address): bound the URL, and stop escaping slashes in ?tabs=
```

A fitting subject for this change:
`refactor(contracts): derive the orchestration event catalog from one record`

## Steps

> The Step 2 and Step 3 code blocks below were applied verbatim to a copy of this
> tree at `ace313f` and checked: `tsgo --noEmit` exit 0 with **no** fallback
> needed, `vitest run` → `14 files / 121 tests`, and the Step 4 digest unchanged.
> If any of those three disagrees for you, the cause is a transcription slip on
> your side or real drift — not a defect in the block.

### Step 0: Record the catalog baseline

This digest is the behaviour-preservation gate for the whole plan: it fingerprints
the _shape valibot actually parses with_ — every variant option's discriminator
literal, its entry keys, and its payload's entry keys — independently of how that
shape was written. Run it **before** editing anything, from the repo root:

```bash
bun -e "
import { orchestrationEventSchema } from './packages/contracts/src/orchestration-events.ts'
const rows = orchestrationEventSchema.options.map((option) => ({
  type: option.entries.type.literal,
  entries: Object.keys(option.entries).sort(),
  payload: Object.keys(option.entries.payload.entries).sort(),
}))
console.log(JSON.stringify(rows))
" | shasum -a 256
```

**Expected**: `e30ee8d07f29efc26c17803af516bfca3ecf70ea7667ee0a25c42ba342b56588`

That is the digest measured at `ace313f`. If your baseline differs, the catalog
has drifted since this plan was written — **STOP and report the digest you got**
rather than guessing. (The command imports the module directly, not the barrel,
so plan 022's barrel edits cannot change it.)

**Verify**: the command above prints the expected digest.

---

### Step 1: Delete the string array and the picklist

In `packages/contracts/src/orchestration-events.ts`:

1. Delete lines 37–68 — the whole `export const orchestrationEventTypes = [ … ] as const` array.
2. Delete line 70 — `export const orchestrationEventTypeSchema = v.picklist(orchestrationEventTypes)`.
3. **Keep** lines 71 and 72 (`orchestrationAggregateKindSchema`,
   `orchestrationActorKindSchema`) exactly as they are — `eventBaseSchema` uses
   both. Leave one blank line between the last import and the first surviving
   `export const`.

The file will not typecheck again until Step 2 finishes (line 472 still refers to
the deleted picklist). That is expected; do not try to patch it here.

In `packages/contracts/src/index.ts`, delete these two lines and nothing else:

```
  orchestrationEventTypeSchema,
  orchestrationEventTypes,
```

They sit at 319–320 at `ace313f`, immediately after `orchestrationEventSchema,`.
If plan 022 already removed them, the lines are absent — that is fine, move on.
**Leave `type OrchestrationEventType` (line 355) alone**: the name survives, it
is just derived differently now. Do **not** add `ORCHESTRATION_EVENT_PAYLOADS` to
the barrel — it has no consumer outside the package, and plan 022 is shrinking
this file, not growing it.

**Verify**:

```bash
git grep -n "orchestrationEventTypes\|orchestrationEventTypeSchema" -- packages apps scripts
```

→ must print **exactly five lines, all in
`packages/contracts/src/tests/orchestration.test.ts`** (its lines 9, 152, 184,
185, 186 at `ace313f`). Step 3 removes those. Any hit in another file means you
deleted the wrong lines — revert and re-read.

---

### Step 2: Replace the variant with the derived catalog

In `packages/contracts/src/orchestration-events.ts`, replace lines **319–470**
(the entire `export const orchestrationEventSchema = v.variant('type', [ … ])`)
with the block below, and change line 472 to the derived
`OrchestrationEventType`.

Keep `eventBaseSchema` (306–317) exactly where and as it is.

```ts
/**
 * The event catalog: one row per orchestration event, mapping the wire `type` to
 * the schema its `payload` must satisfy.
 *
 * This record is the only hand-written list. The parser variant below and the
 * `OrchestrationEventType` union are both derived from it, so an event cannot
 * half-exist — there is no state where a type is nameable but unparseable, or
 * parseable but absent from the union. Adding an event is a payload schema plus
 * one row here.
 *
 * The order below is the order the catalog has always been read in (project
 * lifecycle, thread lifecycle, then turn traffic). valibot dispatches on the
 * discriminator, not on position, so the order is documentation — but do not
 * alphabetise it.
 */
export const ORCHESTRATION_EVENT_PAYLOADS = {
  'project.created': projectCreatedPayloadSchema,
  'project.meta-updated': projectMetaUpdatedPayloadSchema,
  'project.reordered': projectReorderedPayloadSchema,
  'project.deleted': projectDeletedPayloadSchema,
  'thread.created': threadCreatedPayloadSchema,
  'thread.meta-updated': threadMetaUpdatedPayloadSchema,
  'thread.deleted': threadDeletedPayloadSchema,
  'thread.archived': threadArchivedPayloadSchema,
  'thread.unarchived': threadUnarchivedPayloadSchema,
  'thread.settled': threadSettledPayloadSchema,
  'thread.unsettled': threadUnsettledPayloadSchema,
  'thread.snoozed': threadSnoozedPayloadSchema,
  'thread.unsnoozed': threadUnsnoozedPayloadSchema,
  'thread.pinned': threadPinnedPayloadSchema,
  'thread.unpinned': threadUnpinnedPayloadSchema,
  'thread.pin-reordered': threadPinReorderedPayloadSchema,
  'thread.runtime-mode-set': threadRuntimeModeSetPayloadSchema,
  'thread.interaction-mode-set': threadInteractionModeSetPayloadSchema,
  'thread.message-sent': threadMessageSentPayloadSchema,
  'thread.turn-start-requested': threadTurnStartRequestedPayloadSchema,
  'thread.turn-interrupt-requested': threadTurnInterruptRequestedPayloadSchema,
  'thread.session-stop-requested': threadSessionStopRequestedPayloadSchema,
  'thread.session-set': threadSessionSetPayloadSchema,
  'thread.activity-appended': threadActivityAppendedPayloadSchema,
  'thread.proposed-plan-upserted': threadProposedPlanUpsertedPayloadSchema,
  'thread.turn-diff-completed': threadTurnDiffCompletedPayloadSchema,
  'thread.checkpoint-revert-requested': threadCheckpointRevertRequestedPayloadSchema,
  'thread.reverted': threadRevertedPayloadSchema,
  'thread.approval-response-requested': threadApprovalResponseRequestedPayloadSchema,
  'thread.user-input-response-requested': threadUserInputResponseRequestedPayloadSchema,
}

export type OrchestrationEventType = keyof typeof ORCHESTRATION_EVENT_PAYLOADS

/**
 * One variant member. Generic on purpose: instantiated with a single literal
 * type it returns the exact `ObjectSchema` for that event, which is what
 * `OrchestrationEventVariantOption` maps over to rebuild the discriminated union.
 */
const eventVariantOption = <TType extends OrchestrationEventType>(
  type: TType,
  payload: (typeof ORCHESTRATION_EVENT_PAYLOADS)[TType],
) => v.object({ ...eventBaseSchema, type: v.literal(type), payload })

type OrchestrationEventVariantOption = {
  [TType in OrchestrationEventType]: ReturnType<typeof eventVariantOption<TType>>
}[OrchestrationEventType]

/**
 * `Object.entries` erases the key→payload correlation — it hands back
 * `[string, <union of every payload schema>]` — so rebuilding the discriminated
 * union costs exactly one assertion. The three type-derivation gates at the top
 * of `tests/orchestration.test.ts` are what keep it honest: they stop compiling
 * the moment `OrchestrationEvent` widens or decorrelates.
 */
const orchestrationEventVariantOptions = Object.entries(ORCHESTRATION_EVENT_PAYLOADS).map(
  ([type, payload]) => eventVariantOption(type as OrchestrationEventType, payload),
) as OrchestrationEventVariantOption[]

export const orchestrationEventSchema = v.variant('type', orchestrationEventVariantOptions)
```

Then line 472 becomes — note it is now derived from the record, and it **moves**
into the block above (shown there); delete the old
`export type OrchestrationEventType = v.InferOutput<typeof orchestrationEventTypeSchema>`
line from the type block at the bottom of the file. The remaining exported types
(`OrchestrationAggregateKind`, `OrchestrationActorKind`, `ProjectCreatedPayload`,
`ThreadCreatedPayload`, `OrchestrationEventMetadata`, `OrchestrationEvent`) stay
byte-for-byte as they are.

**Transcription check — run it, do not eyeball it.** A transposed row typechecks
fine and passes every test (verified), so this diff is the only mechanical guard.
From the repo root, after you have written the record:

```bash
git show ace313f:packages/contracts/src/orchestration-events.ts \
  | grep -E "^    (type: v\.literal\(|payload: )" \
  | sed -E "s/^    type: v\.literal\('([^']+)'\),$/\1/; s/^    payload: ([A-Za-z]+),$/\1/" \
  | paste - - > /tmp/028-old-pairs.txt
sed -nE "s/^  '([^']+)': ([A-Za-z]+),$/\1\t\2/p" \
  packages/contracts/src/orchestration-events.ts > /tmp/028-new-pairs.txt
wc -l /tmp/028-old-pairs.txt /tmp/028-new-pairs.txt
diff /tmp/028-old-pairs.txt /tmp/028-new-pairs.txt && echo PAIRS-IDENTICAL
```

**Expected**: `30` and `30`, then `PAIRS-IDENTICAL` and nothing else. Any `diff`
output is a transcription error — fix the record, do not touch the diff. (The
`sed` pattern matches nothing in the file as it exists before your edit, so a
count other than 30 on the new side means the record is malformed.)

**Two documented fallbacks** — the block above was compiled against this exact
tree with `tsgo --noEmit` and needed **neither** fallback, so do not reach for
them speculatively. Use one only if tsgo actually emits the named error, and say
which in your report:

- If tsgo rejects the `as OrchestrationEventVariantOption[]` assertion with
  TS2352 (_"Conversion of type … may be a mistake"_), widen it to
  `as unknown as OrchestrationEventVariantOption[]` and leave the doc comment in
  place. The Step 3 gates still prove the result is correct.
- If tsgo fails to infer `TType` at the `eventVariantOption(...)` call, pass the
  type argument explicitly:
  `eventVariantOption<OrchestrationEventType>(type as OrchestrationEventType, payload)`.

Anything **beyond** those two fallbacks — in particular any urge to reintroduce a
hand-written list, or to type the options array as `v.GenericSchema[]`, or to
loosen `OrchestrationEvent` — is a STOP condition.

**Verify**:

```bash
bun run --filter '@workspace/contracts' typecheck
```

→ exit 0. (The test file still references `orchestrationEventTypes` at this
point, so if the failure is _only_ in `src/tests/orchestration.test.ts`, continue
to Step 3 and re-run this afterwards. Any error in
`src/orchestration-events.ts` itself must be resolved here.)

---

### Step 3: Rewrite the test's third copy as a cross-check plus a compile-time gate

In `packages/contracts/src/tests/orchestration.test.ts`:

**3a.** Remove `orchestrationEventTypes,` from the `'../index'` import list
(line 9). Leave the rest of that import untouched. Then add one new import
immediately after the `'../index'` import block:

```ts
import {
  ORCHESTRATION_EVENT_PAYLOADS,
  type OrchestrationEvent,
  type OrchestrationEventType,
} from '../orchestration-events'
```

Importing the exact module rather than the barrel matches
`settings-registry.test.ts`, which imports from `'../settings/keys'` and
`'../settings/registry'` directly, and keeps this test independent of plan 022's
barrel edits.

**3b.** Insert the type-derivation gate at module level, after the imports and
before `const now = '2026-05-24T00:00:00.000Z'` (line 18 at `ace313f`). The gate
uses `v.InferOutput`; the file already has `import * as v from 'valibot'` on
line 2, so add no valibot import.

```ts
/**
 * Type-derivation gate for the event catalog.
 *
 * These are declarations, not assertions: `tsgo --noEmit` is what enforces them.
 * They exist because `orchestrationEventSchema` is derived from
 * `ORCHESTRATION_EVENT_PAYLOADS` through one assertion on an `Object.entries`
 * map, and that assertion is only honest while the union it rebuilds stays
 * discriminated. The 51 `Extract<OrchestrationEvent, { type: '…' }>` narrowings
 * in `apps/server` and `apps/web` are what would silently rot otherwise.
 */
type TypeEquals<TLeft, TRight> = [TLeft] extends [TRight]
  ? [TRight] extends [TLeft]
    ? true
    : false
  : false

// The parsed union's discriminator is exactly the catalog's key set.
const _catalogCoversTheUnion: TypeEquals<OrchestrationEvent['type'], OrchestrationEventType> = true

// …and it is still a union of literals, not `string`. If it widened, this
// assignment would start succeeding and tsgo would report an unused directive.
// @ts-expect-error 'thread.turn-started' is deliberately not an event
const _rejectsSyntheticTurnEvent: OrchestrationEventType = 'thread.turn-started'

// Every member still carries the payload its own catalog row names — decorrelate
// them and `PayloadCorrelation` picks up `false`.
type PayloadCorrelation = {
  [TType in OrchestrationEventType]: TypeEquals<
    Extract<OrchestrationEvent, { type: TType }>['payload'],
    v.InferOutput<(typeof ORCHESTRATION_EVENT_PAYLOADS)[TType]>
  >
}[OrchestrationEventType]
const _payloadsStayCorrelated: TypeEquals<PayloadCorrelation, true> = true

void _catalogCoversTheUnion
void _rejectsSyntheticTurnEvent
void _payloadsStayCorrelated
```

**3c.** Delete the whole `it('keeps the locked Phase 1 event list without
synthetic turn lifecycle events', …)` block (lines 151–187) and put these two
tests in its place, in the same position inside `describe('orchestration
contracts', …)`:

```ts
it('builds one variant member per catalog row, in catalog order', () => {
  const catalog = Object.entries(ORCHESTRATION_EVENT_PAYLOADS)
  const options = orchestrationEventSchema.options

  expect(options).toHaveLength(catalog.length)

  for (const [index, [type, payload]] of catalog.entries()) {
    expect(options[index]?.entries.type.literal).toBe(type)
    // Identity, not shape: the row's schema object is the one the parser runs.
    expect(options[index]?.entries.payload).toBe(payload)
  }
})

it('keeps the catalog free of synthetic turn lifecycle events', () => {
  const eventTypes = Object.keys(ORCHESTRATION_EVENT_PAYLOADS)

  expect(eventTypes).not.toContain('thread.turn-started')
  expect(eventTypes).not.toContain('thread.turn-completed')
  expect(eventTypes).not.toContain('thread.turn-failed')
})
```

**Why the old assertion is not being ported.** It compared
`orchestrationEventTypes` to a literal copy of itself and locked nothing the
variant did not already lock — the drift it was supposed to catch (array vs
variant) was exactly the drift it could not see. Its one durable claim is the
_absence_ of the three synthetic turn lifecycle events, which no derivation can
express, so that survives as its own test. Per `AGENTS.md`, "Delete obsolete
tests instead of preserving old behavior" — do not keep a 30-string list
anywhere, and do not replace it with a `toMatchInlineSnapshot` of the same 30
strings.

**Verify**:

```bash
bun run --filter '@workspace/contracts' typecheck
bun run --filter '@workspace/contracts' test
```

→ typecheck exits 0; tests report `Test Files 14 passed (14)` and
`Tests 121 passed (121)`.

---

### Step 4: Prove the parsed shape did not move

Re-run the Step 0 digest command verbatim:

```bash
bun -e "
import { orchestrationEventSchema } from './packages/contracts/src/orchestration-events.ts'
const rows = orchestrationEventSchema.options.map((option) => ({
  type: option.entries.type.literal,
  entries: Object.keys(option.entries).sort(),
  payload: Object.keys(option.entries.payload.entries).sort(),
}))
console.log(JSON.stringify(rows))
" | shasum -a 256
```

**Verify**: it prints the **same digest you recorded in Step 0**
(`e30ee8d07f29efc26c17803af516bfca3ecf70ea7667ee0a25c42ba342b56588` at
`ace313f`). A different digest means the derivation changed what the parser
accepts — that is a STOP condition, not something to reconcile by editing the
digest.

---

### Step 5: Format, lint, and check the consumers

```bash
./node_modules/.bin/oxfmt --write packages/contracts/src/orchestration-events.ts packages/contracts/src/tests/orchestration.test.ts
./node_modules/.bin/oxfmt --check packages/contracts/src/orchestration-events.ts packages/contracts/src/tests/orchestration.test.ts
bun run --filter '@workspace/contracts' lint
bun run --filter 'server' typecheck
bun run --filter 'web' typecheck
bun run lint
git status --short
```

**Verify**:

- `oxfmt --check` prints `All matched files use the correct format.`
- both lint commands exit 0 (warnings printed, no `error`)
- `bun run --filter 'server' typecheck` exits 0 and prints `Done` — this is what
  proves the 34 `Extract<…>` narrowings under `apps/server/src/orchestration/**`
  still resolve against the derived union.
- `bun run --filter 'web' typecheck` **exits 1 with exactly the three
  pre-existing `src/features/editor/…` errors quoted in "Three measured
  baselines"** — no more, no fewer, and **nothing** mentioning `orchestration`,
  `chat-projection-writers`, `thread-diff-scope-store` or `OrchestrationEvent`.
  A fourth error, or any error naming one of those, is a STOP condition.
- `git status --short` lists **no file outside the four in scope**
  (`orchestration-events.ts`, `tests/orchestration.test.ts`, `index.ts`,
  `plans/README.md`) as newly modified by you. The working tree was already dirty
  when you started — `apps/web/src/features/settings/`,
  `packages/contracts/src/settings/keys.ts` and others. Leave those exactly as
  you found them.

Two things this plan deliberately does **not** run:

- `bun run typecheck` (whole repo) — it already exits 1 on the pre-existing `web`
  errors, so it cannot be a pass/fail gate here. The two scoped typechecks above
  cover every consumer of the union.
- `bun run test` (whole repo) — at `ace313f` `apps/server`'s suite opens and
  WAL-locks the developer's real `~/.platform/fs-metadata.sqlite` (the defect
  plan 013 fixes). The Step 4 digest is what proves runtime parsing is unchanged.
  If plan 013 has landed, running it as an extra gate is welcome; it must pass.

---

### Step 6: Update the index

In `plans/README.md`, set this plan's row (`| 028 | …`) `Status` to `DONE`.
Report which of the Step 2 fallbacks you needed, if any.

## Test plan

**New tests** (both in `packages/contracts/src/tests/orchestration.test.ts`,
modelled structurally on the neighbouring cases in the same `describe` block, and
on `packages/contracts/src/tests/settings-registry.test.ts` for the compile-time
gate):

1. `builds one variant member per catalog row, in catalog order` — asserts option
   count equals row count, each option's discriminator literal equals its row's
   key, and each option's `payload` is the **same object reference** as the row's
   schema. It fails if someone later hand-adds a variant member, drops one, or
   breaks the `Object.entries` mapping.
   **It cannot catch a mis-transcribed row**: the options are built _from_ the
   record, so a row wired to the wrong payload produces an option that matches
   that wrong row and the test passes. Verified by experiment — swapping two rows
   leaves all 121 tests green and `tsgo` at exit 0. The Step 2 pair diff and the
   Step 0/4 digest are the guards against transcription, not this test.
2. `keeps the catalog free of synthetic turn lifecycle events` — carries forward
   the only durable claim of the deleted test (`thread.turn-started`,
   `thread.turn-completed`, `thread.turn-failed` are deliberately not events).

**Deleted test**: `keeps the locked Phase 1 event list without synthetic turn
lifecycle events` — it compared the array to a hardcoded copy of itself. See the
rationale in Step 3c.

**Compile-time gate** (three declarations, enforced by `tsgo --noEmit`, not by
vitest): catalog-covers-the-union, discriminator-is-still-literal
(`@ts-expect-error` negative control), and payload-correlation across all 30
rows.

**Runtime equivalence gate**: the Step 0/Step 4 digest over
`orchestrationEventSchema.options`. This is what makes the change verifiably
behaviour-preserving without writing 30 round-trip fixtures; the two existing
round-trip tests (`round-trips domain events through JSON and contract
validation` at line 189, and `round-trips the lifecycle events` at line 415,
which parses seven real payloads through the variant) remain the runtime proof
that parsing still works end to end.

**Expected suite result**: `14 files / 121 tests` (from `14 / 120`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run --filter '@workspace/contracts' typecheck` exits 0
- [ ] `bun run --filter 'server' typecheck` exits 0
- [ ] `bun run --filter 'web' typecheck` fails with **exactly** the three
      pre-existing `src/features/editor/…` errors and nothing else
- [ ] `bun run --filter '@workspace/contracts' test` → `14 passed (14)` files, `121 passed (121)` tests
- [ ] `bun run --filter '@workspace/contracts' lint` exits 0 and `bun run lint` exits 0
- [ ] `./node_modules/.bin/oxfmt --check packages/contracts/src/orchestration-events.ts packages/contracts/src/tests/orchestration.test.ts` → `All matched files use the correct format.`
- [ ] The Step 4 digest equals the Step 0 digest
- [ ] The Step 2 pair diff prints `PAIRS-IDENTICAL`
- [ ] `git grep -n "orchestrationEventTypes\|orchestrationEventTypeSchema" -- packages apps scripts docs` returns **no matches**
- [ ] `git grep -c "type: v.literal('" -- packages/contracts/src/orchestration-events.ts` returns **no match** — no hand-written variant member survives. (Note the trailing quote: the derived `eventVariantOption` helper legitimately contains `type: v.literal(type)`, so the unquoted pattern **will** match once and is not a failure.)
- [ ] `git status --short` shows only `packages/contracts/src/orchestration-events.ts`, `packages/contracts/src/tests/orchestration.test.ts`, `packages/contracts/src/index.ts` and `plans/README.md` as files you modified
- [ ] `plans/README.md` row 028 updated to `DONE`

## STOP conditions

Stop and report back (do not improvise) if:

- The Step 0 baseline digest is not
  `e30ee8d07f29efc26c17803af516bfca3ecf70ea7667ee0a25c42ba342b56588`, or the
  excerpts in "Current state" do not match the live code (the catalog has drifted
  since this plan was written).
- The Step 4 digest differs from the Step 0 digest. Something about what the
  parser accepts changed. Do not adjust the expected digest; report both values
  and the diff of `orchestration-events.ts`.
- The Step 2 pair diff prints anything other than `PAIRS-IDENTICAL`, or either
  side is not 30 lines. Fix the record; never edit the diff away.
- `bun run --filter 'server' typecheck` reports **any** error, or
  `bun run --filter 'web' typecheck` reports an error naming `orchestration`,
  `chat-projection-writers`, `thread-diff-scope-store` or `OrchestrationEvent`.
  Those files are out of scope by design: an error there means the derived
  `OrchestrationEvent` union is no longer the discriminated union those 51
  `Extract<…>` narrowings need. **Fix the derivation, never the consumer.**
- The `web` typecheck grows a _fourth_ error, or one of the three pre-existing
  `src/features/editor/…` errors disappears. Either means something outside your
  scope moved; report it, do not adjust `apps/web/src/features/editor/**`.
- Any of the three type-derivation gates in Step 3b will not compile, or tsgo
  reports `Unused '@ts-expect-error' directive` on
  `_rejectsSyntheticTurnEvent`. That is the gate doing its job: the union widened.
  Report which gate failed and the exact tsgo message.
- You need a third fallback beyond the two documented in Step 2, or you find
  yourself typing a 30-entry list anywhere. The point of this plan is that no such
  list exists; reaching for one means the derivation is wrong.
- `git status --short` shows you modified a file outside the four in scope, or
  shows a _change in the diff_ of a file that was already dirty when you started
  (in particular `packages/contracts/src/settings/keys.ts`).
- The contracts suite reports a count other than 121 after Step 3.

## Maintenance notes

For whoever owns this code next:

- **Adding an orchestration event** is now: write the `*PayloadSchema` const in
  `orchestration-events.ts`, add one row to `ORCHESTRATION_EVENT_PAYLOADS`. The
  union, the parser variant and every `Extract<OrchestrationEvent, { type: '…' }>`
  narrowing follow automatically. There is no third place to remember.
- **What a reviewer should scrutinize**: (1) the single `as
OrchestrationEventVariantOption[]` assertion — it is the one place the compiler
  is being told something rather than shown it, and the three gates in the test
  file are the price paid for it; delete a gate and the assertion becomes
  unguarded. (2) The 30 record rows against the old variant, pair by pair — a
  transposed pairing typechecks _and_ passes every test, so only the Step 2 pair
  diff and the Step 4 digest can see it. And the digest sees it only when the two
  payload shapes differ: `thread.unarchived`/`thread.unpinned` (both
  `{threadId, updatedAt}`) and `thread.unsettled`/`thread.unsnoozed` (both
  `{reason, threadId, updatedAt}`) are digest-identical, so those two pairs are
  covered by the pair diff alone. Do not skip it.
- **Ordering vs plan 036** — see "Why this matters". If 036 has somehow already
  landed, run this plan anyway and re-read 036's diff against the derived catalog.
- **Deliberately deferred**: adding `default:` exhaustiveness assertions to the
  `switch (event.type)` blocks in `apps/server/src/orchestration/projector.ts:37`
  and `projection-pipeline.ts:99`. Neither has one today, which is why this plan
  carries its own compile-time gate instead of relying on those switches to
  notice a widened union. Adding them is a good follow-up — and after plan 036
  there is only one switch left to add it to, which is why it waits.
- **Also deliberately deferred**: deleting `type ProjectCreatedPayload` and
  `type ThreadCreatedPayload` (zero consumers) and un-exporting the 30
  `*PayloadSchema` consts. Both are dead-surface removal, which is plan 022's
  charter; folding them in here would create a merge conflict with it for no
  benefit.
