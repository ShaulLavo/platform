# Address Rework: Fixing the Two Edges

**Status:** implemented (phases 1–8) · **Scope:** `apps/web/src/features/address/` (+ one line in `EditorStateProvider`) · **Follows:** [`router-everything-linkable-plan.md`](./router-everything-linkable-plan.md)

> [!NOTE]
> **Departures from this plan, decided while implementing:**
>
> - **The sync seed only handles the workspace already open.** Seeding a _different_ root would mean
>   inventing `birthtimeMs`/`mtimeMs`/`size` for a `PickedFsEntry` the cache does not store, and
>   `useValidateRootFolder` only clears an invalid root — it never replaces the entry — so the fabricated
>   stat would outlive the boot. A genuine project switch keeps the async path and a real `statPath`.
> - **`?tabs=` unions at boot and replaces on popstate.** The plan said "run `closeTabsOutsideAddress` on
>   popstate only"; the other half is that boot must still _open_ what the link names. Union is the rule
>   that satisfies both.
> - **The fixpoint is "expands, then settles", not "unchanged".** A short link legitimately grows into the
>   full rendering of the store on arrival. The test asserts that nothing the link named is lost and that a
>   second pass changes nothing — plus a strict byte-equality test for popped entries, which the projection
>   itself wrote.
> - **The rate limiter was replaced, not tuned.** A 250ms trailing debounce plus a `pagehide` flush, which
>   has no "dropped the last write" failure mode at all.
> - **`Mod+[` was left alone.** The editor/workspace overlap is deliberate and already documented, and
>   mirrors VS Code. Same for the log filters: logs are app-global, so global filters are correct.
> - **`sources.recent` was wired rather than deleted**, so a link can reach a project on disk that has
>   fallen out of the eight-slot index. It is only consulted when the index cannot answer.
> - **`AddressRestoreResult` was surfaced rather than deleted** — a dead link now raises a toast instead of
>   silently landing the recipient on their own last session.
>
> Verified: **1733 tests / 241 files green**, typecheck clean, format clean, lint at the pre-existing
> baseline. Back/forward confirmed in the running app: `history.length` no longer grows on a back press
> and the forward entry survives.

The address layer shipped in PR #9. Its `utils/` are good and stay. Its two edges —
store→URL and URL→store — were built as if they were one edge, and they are not. This
plan reworks the ~610 lines of `hooks/` + `state/`, deletes the router, and leaves the
~1200 lines of `utils/` essentially untouched.

## The one structural change

Today the applier runs in an effect, **after** `readWorkspaceCache()` has already seeded
the store synchronously at `EditorStateProvider` construction. So the app restores twice:
the cache restores everything, then a lossier address overlays a subset on top and
destroys what it does not name. Every ordering bug below is a symptom of that.

The fix is to apply the address at the same instant as the cache, through one pure merge,
before the store exists:

```ts
// features/editor/editor-state-provider.tsx — the entire seam
const [workspaceCache] = useState(() =>
  addressedWorkspaceCache(readWorkspaceCache(), parseAddress(location.href)),
)
```

`createEditorWorkspaceStore(initialState)` and `createSearchBufferStore({ cachedByRootPath })`
already take that value. Nothing else moves.

Two consequences worth stating up front, because they delete work the plan doc listed as
future milestones:

- **`platform.address.v1` and `address-storage.ts` stay, unchanged.** `restoreAddressFromStorage()`
  already runs before render and installs the stored href into the URL, which is exactly what a
  desktop cold launch at `/` needs. Under this design it feeds the synchronous seed instead of a
  later effect. It stops being a third persistence layer and becomes the desktop transport it
  always was.
- **The `uiMode` / `chatModeSelection` cache keys stay too, and M4/M9's "retire them" gap dissolves.**
  They are the defaults layer the address overrides. That is correct, not debt. The reason the plan
  doc could not retire them — "the store is seeded from them synchronously before React mounts" —
  stops being an obstacle the moment the address is seeded from the same place.

## Phases

Each phase is independently mergeable and independently verifiable. Order is by dependency,
not by severity.

---

### Phase 1 — Delete TanStack Router

First because it unblocks Phase 2: `RouterProvider` is the mechanical reason
`renderWithProviders` cannot mount the address hooks.

The entire consumed API is `RouterProvider` + `useRouter().history.push/replace`.
`address-storage.ts:52` already performs the boot URL install with raw `replaceState`,
proving the native API suffices, and `AddressWriter` (`projection.ts:18`) is already the seam.

- Delete `features/address/router.tsx` (66 lines).
- `main.tsx`: drop `RouterProvider` and `createAppRouter`; render `<App />` directly.
- `use-address-projection.ts`: replace `router.history.push/replace` with
  `history.pushState(null, '', href)` / `history.replaceState(null, '', href)`. Drop `useRouter`
  and the `router` dependency.
- `apps/web/package.json`: remove `@tanstack/react-router`. Re-lock.
- Move the degenerate-route-tree warning from `router.tsx` to `App.tsx`, where it protects
  something real: _do not put a route hierarchy above `EditorStateProvider` — it unmounts the
  document service holding unsaved buffers on every project switch._

Also removes `router-core`, `seroval`, `cookie-es`, `isbot`, and a duplicate `@tanstack/store`.

**Verify:** app boots, deep link still lands, `bun run typecheck`, full suite green.

---

### Phase 2 — A test harness that can fail

Nothing in `hooks/` has ever been mounted in a test. Write these **before** Phase 3, and
confirm each one fails against today's code first — an assertion that has never gone red is
not calibrated.

Add `apps/web/test/address.ts` (mount both hooks over real stores, drive real history) and
three `dom` tests:

1. **Boot with a foreign link does not close cached tabs.** Cache holds 12 tabs; URL names 2;
   assert 12 remain. _Fails today._
2. **`A → B → back` leaves `history.length` unchanged and forward alive.** _Fails today._
3. **Apply-then-settle is a fixpoint.** Apply an address, let the projection flush, assert the
   resulting href equals the applied one. _Fails today_ — see Phase 4's note on `orAbsent`.

Then delete the vacuous ones: `grammar.test.ts:149`'s hostile-input loop asserts only
`not.toThrow()` and passes against `formatAddress = () => '/'`.

---

### Phase 3 — Apply at store construction

The structural change. New pure module, composed entirely from helpers that already exist:

`features/address/utils/cache.ts`

```ts
export function addressedWorkspaceCache(
  cached: CachedWorkspaceState,
  address: Address,
): CachedWorkspaceState
```

What it merges, all synchronously, all from localStorage only:

| Address slot      | Cache field                    | Helper                                              |
| ----------------- | ------------------------------ | --------------------------------------------------- |
| `workspace`       | `rootFolder`                   | `resolveWorkspaceSlug` over `cached.workspaceOrder` |
| `mode`            | `uiMode`                       | direct                                              |
| `side` / `bottom` | active slice `workbenchPanels` | `setWorkbenchSidebarTab` / `setWorkbenchBottomTab`  |
| `tabs`            | active slice `workbenchPanels` | fold `openEditorPathInWorkbenchPanels`              |
| `document`        | active slice `workbenchPanels` | `selectEditorTabInWorkbenchPanels`                  |
| `tool`            | `chatModePanels.activeToolTab` | `showChatModeToolTab`                               |

Resolving a slug to a root the cache knows but has no `PickedFsEntry` for: synthesize
`{ path, name: workspacePathLeaf(path), type: 'directory' }` — exactly what `switchRootFolder`
builds from a stat result. `use-validate-root-folder` already corrects or rejects a stale root
on mount, so this needs no network and adds no new failure mode.

Then:

- `use-address-restore.ts` loses its boot apply entirely. `applied.current`, the
  `openWorkspaceRoot` await, the `superseded` branch, and the boot half of the race all go with it.
  The hook becomes popstate-only (Phase 4).
- Keep a small **post-mount** apply for the slots no cache slice can hold: settings category,
  search buffer query/flags, logs filters, chat session/thread/diff scope, `#L` focus. These are
  additive and idempotent — none of them closes or replaces anything.
- A cross-workspace link whose root is _not_ in the cache still needs the async
  `openWorkspaceRoot` path. Keep it, but it now runs against a store that was seeded coherently
  rather than one it has to overwrite.

**This is what makes B1 and B2 unreachable rather than patched.**

---

### Phase 4 — Popstate correctness

The projection tracks only what _it_ last wrote (`projection.ts:56`). Nothing ever tells it the
browser moved the user. That single missing fact is the whole bug.

- Add `adopt(href)` to `AddressProjection`: sets `lastWritten` and `lastIdentity` from a parsed
  href **without writing**. Call it synchronously in the popstate handler with the popped href,
  _before_ `applyAddress` mutates any store. The subsequent flush then sees
  `identity === lastIdentity`, takes the `replace` branch, and forward history survives.
- Delete the `// Read-only in this milestone … no echo to guard against` comment at
  `use-address-projection.ts:33`. It is false and it is directly above the listener that falsifies it.
- Move `closeTabsOutsideAddress` behind a popstate-only guard. Back should still be the inverse of
  push; a foreign link should never delete tabs.
- **Resolve the fixpoint first, or `adopt` seeds a value the next flush disagrees with.**
  `snapshot.ts:105` always emits `tabs`, while `orAbsent` (`use-address-projection.ts:182`) drops
  any slot sitting at its default. So the projection's rendering of an honored address is
  legitimately not that address. Decide one rule — recommended: `adopt` stores the _projected_
  form of the popped address (`formatAddress(addressFromSnapshot(...))`) rather than the raw href,
  so the comparison is like-for-like.

---

### Phase 5 — Make `?settings=` symmetric

`selectSettingsCategory` has exactly one caller repo-wide: the applier. No UI path clears it, so
a shared `?settings=providers` pins the recipient's settings page to one section permanently, and
`snapshot.ts:120` re-emits it into storage on every write.

- `applySettings` gets an off-branch: `settings === null` closes/deselects the settings tab.
- Give `settings:` a real document token so `closeTabsOutsideAddress` can see it. Today it cannot,
  which is why backing out of settings pushes a forward entry instead of navigating.
- Run `applySettings` **before** `applyDocument`. Today it runs after and always selects, so which
  tab you land on depends on `?tabs=` byte order.
- Add a clearable category chip in the settings header — the page currently shows one section while
  the header still prints the full count.

---

### Phase 6 — Projection hygiene

- **Replace the rate limiter with a 250ms trailing debounce.** The budget/latch/window machine
  drops writes rather than deferring them (`projection.ts:63` nulls `pending` before the budget
  check and never re-arms), and there is no `pagehide` flush. A debounce makes 90 writes/30s
  structurally impossible and has no stale-forever mode. Deletes `RATE_LIMIT`, `claimRateBudget`,
  `resumeBudget`, and the now-dead `resume()`.
- **Stop logging the raw href.** `projection.ts:85` and `address-storage.ts:53` write the full URL —
  including `?s.q=<the user's search query>` and repo-relative paths — and `href` is in neither
  redaction set. `.env` has `OBSERVABILITY_ENABLED=true` and `OBSERVABILITY_POSTHOG_ENABLED=true`,
  so it leaves the machine. This regresses a deliberate existing decision: `search-providers.ts`
  logs `queryLength`, never the query. Log `hrefLength` plus the non-content slots
  (`mode`, `side`, `bottom`, `tabCount`), or add `href` to both deny-lists.
- **Allow-list `passthrough`.** `grammar.ts:179` keeps every unowned key forever, and
  `mergeLiveSearch` can override a stored key but never remove one — so `?decode=diffusion`,
  documented as opt-in per session, becomes permanent with no UI escape and ships to anyone you
  send the link to. Allow-list the four dev params, and strip them before `writeAddressCache`.
- **Narrow the subscription fan-out.** Seven bare `subscribe(project)` calls rebuild a full
  snapshot — walking every tab through `documentTokenForPath` — on every unrelated store mutation.
  The debounce absorbs most of it; measure before doing more.

---

### Phase 7 — Codec fixes

All small, all in `utils/`, all with an existing test file to extend.

- **`checkpointToken` drops `newObjectId`/`oldObjectId`** (`document-token.ts:134`), which the app
  always sets — so a checkpoint diff tab round-trips to a _different_ id and reload leaves a
  permanent duplicate tab. Highest-value item here.
- **`qualifiedSlugs` can mint a qualifier that collides with another root's bare leaf**
  (`slug.ts:99`), which `resolveWorkspaceSlug` then reports as user ambiguity. Fall through to the
  hash suffix when the minted qualifier already exists in the leaf namespace.
- **Encoder and decoder use different root sets.** The encoder qualifies against in-memory
  `parkedWorkspaces` (uncapped); the decoder resolves against `workspaceOrder` (capped at 8). Two
  oracles for one namespace — encode from the same capped, recency-ordered list the index writes.
- `?diff=` and `?tool=` are guarded by truthiness while `settings` was fixed to `!== null`.
- `#L1e21` serializes to a fragment the parser rejects (`grammar.ts:230`).
- Duplicate search keys collapse under three different first/last-wins policies, contradicting
  "byte-for-byte".
- `f//a.ts` and `f/.` collapse under `new URL()` normalization and open a _different_ file.
- `-` is a legal directory leaf, so `NO_WORKSPACE_SLUG` can shadow a real workspace.

---

### Phase 8 — Cleanup

- **Dead code** (CLAUDE.md's "never registered inert"): `addressSchema` is never parsed, only
  `InferOutput`'d — make it a plain `type` and move the structural-safety claim onto
  `AddressSnapshot`, which is where it actually lives and is genuinely good;
  `AddressRestoreResult`'s three states have no renderer, so a dead link silently lands the
  recipient on their own last session; `sources.recent` in `slug.ts:86` is unwired.
- **Collapse the narrow logs.** One boot can emit `restored_from_storage` + N×`token_rejected` +
  `tabs_rejected` + `restored`. Against the evlog rule — make it one wide `address.restored`
  carrying `{ status, reason, slug, rejectedTokens, tabsOmitted, fromStorage }`.
- **`prompt-stash-store.ts:10`** renamed `platform:prompt-stash:v1` → `platform.prompt-stash.v1`
  with no cleanup, orphaning up to 20 unsent prompts. Per the greenfield rule: delete the old key,
  or keep the old name.
- **Strengthen the tests that cannot fail.** `fixedPoint` asserts pass 2 equals pass 1, never
  equality with the input — 6 of 8 call sites compensate, but the helper should assert the input.
  `RATE_LIMIT` is asserted `<= 90`, so `5` passes. `v.strictObject` → `v.looseObject` passes 123/123.
  Only 8 of 38 classification rows are pinned. Add a round trip that starts from a _hand-written_
  URL — `?tabs=f/a.ts,f/b.ts`, the obvious human spelling, currently resolves to a real path
  `/repo/a.ts,f/b.ts` and opens it as a tab.
- **Untested modules:** `address-storage.ts` (its injectable `History` seam is never used),
  `logs-params.ts`, `settings-category.ts`, `diff-scope.ts`, and both new stores.
- `lib/workspace-cache.ts:25` now imports from `features/address/utils/` — move the pure path
  helpers to `@/lib`.
- `filter-store.ts:76` exports a `use*` function returning a module constant; log filters now leak
  across workspace switches.
- `restoreSession` sets `restored: true` on every popstate, flashing "conversation is gone".
- `Mod+[` is bound twice with no shadow indicator in the shortcuts UI.
- The 8 test files import bare `vitest`; CLAUDE.md wants `test/fixtures.ts`.
  `document-token.test.ts` uses `throw new Error`.
- **Prune the comments.** Density runs ~22% against a ~7% house average. Keep the load-bearing
  ones (`missingSidesForStatus`, the `sliceForWorkspace` both-directions trap, the
  `public/workbench/` shadowing that forces `~`). Drop the changelog entries the adjacent test
  already records. The two most confident comments in the feature are the two that are false —
  `projection.ts:5` ("writes with `replace` only, so it can never add a history entry") is
  falsified by line 83 of the same file.

---

## What is explicitly not changing

- The classification table (`classification.ts`) and its drift test. It genuinely walks the source
  tree for `platform.*` literals in storage contexts. It is the strongest artifact in the feature.
- `document-token.ts`'s eight kinds. `EditorTabRecord.path` really does hold eight heterogeneous
  things, and `git-ref:`/`settings:` really were invisible to the cache. Fix the round trip; do not
  cut the table.
- `workspace-path.ts`. `toWorkspaceAbsolute` rejects leading `/` and any `..` segment, and I could
  not smuggle one through `decodeSegment`. Path traversal is correctly handled.
- "Absent means defer to the remembered slice." Correct, and Phase 3 is what finally makes it true
  at boot instead of approximately true after an effect.
