# Plan 069: Make worktree choice and cleanup a recoverable lifecycle

> **Executor instructions:** Read this plan completely, then read `AGENTS.md`, root `PLAN.md`,
> `docs/product-vision.md`, `docs/t3code-parity-implementation-plan.md`, and
> `/Users/shaul/.agents/skills/never-nester/SKILL.md`. Execute only after Plan 068 is complete and
> deleted from `plans/`; reconcile the named post-068 owners below from source rather than expecting
> the deleted plan to remain. Keep the current worktree; do not create a branch, worktree, commit,
> push, or PR unless the operator asks. Preserve user-owned changes. Reuse the running dev server.

## Status

- **State:** Domain prerequisite complete; awaiting root scheduling
- **Priority:** P0 after Plan 068
- **Effort:** L
- **Risk:** HIGH — filesystem creation/removal with crash recovery and dirty-work protection
- **Platform baseline:** `4b25f1ab28eab2da499ac0cf0fcc633af1ea6640`
- **Prepared:** 2026-08-27
- **Dependency:** Plan 068 — explicit Project → Worktree → Session domain and recovery bootstrap
- **Known dirty baseline:** `docs/product-vision.md` plus concurrent operator-owned work under
  `apps/web/package.json`, `apps/web/scripts/`, `apps/web/src/features/editor/`,
  `apps/web/src/features/workbench/`, `apps/web/src/features/workspace/`, `apps/web/src/lib/`, and
  `apps/web/test/factories/` were actively changing while this plan was prepared. Re-run
  `git status --short` and preserve every unrelated path.

Root `PLAN.md` is the sole execution-order authority. Even after Plan 068 lands, stop if root has not
scheduled this plan.

## Drift-check preamble — this is the audit

Run before editing:

```sh
git rev-parse HEAD
git status --short
test ! -e plans/068-session-domain-model.md
rg -n "WorktreeId|SessionId|projectionWorktrees|projectionSessions" \
  packages/contracts/src apps/server/src/db apps/server/src/orchestration apps/web/src/features/chat
rg -n "requestWorktree|isolateNextSession|worktreePath.*session|sessionId.*worktree" \
  packages/contracts/src apps/server/src apps/web/src
rg -n "worktree.*cleanup|cleanup.*worktree|WORKTREE_DIRTY" \
  apps/server/src/orchestration apps/server/src/git apps/web/src/features
rg -n "worktrees/create|worktrees/remove|GitWorktreeService" \
  apps/server/src apps/web/src
```

The first `test` is intentional: this plan may not start while Plan 068 remains unfinished. Reconcile
the expected post-068 names and all current-source anchors below. Update this plan before editing if
an owner moved.

### Product and architecture locks

- A session chooses its worktree at creation, multiple sessions may share one worktree, and the
  choice must be shown as a chip (`docs/product-vision.md:56-64`).
- Orca's worktree-first race/compare model is reserve only; explicit IDs and many-to-one links must
  permit it later without adding compare behavior now (`docs/product-vision.md:65-68`,
  `docs/product-vision.md:119-124`).
- Sessions must point to worktrees which point to projects (`docs/product-vision.md:83-93`).
- A machine hosts checkouts; it is not itself a worktree. Keep this lifecycle on one server.
  Browser actions retain Plan 068's `ScopedWorktreeRef` with `(environmentId, worktreeId)` and send
  the local `worktreeId` to that server. Never resolve a target from the logical project group alone.
- Treat the main checkout uniformly for Git status, file ownership, and session selection while
  preserving its protection from removal. Each checkout owns its working changes, index, commit
  draft, and unsaved buffers. Creating or selecting a sibling must not move these to the sibling.
- Command/event/projection/receipt/recovery is the required spine, not optional plumbing
  (`docs/product-vision.md:109-114`,
  `docs/t3code-parity-implementation-plan.md:472-530`,
  `docs/t3code-parity-implementation-plan.md:2022-2034`).

### Verified pre-068 source and risks

These anchors document the behavior Plan 068 must have replaced. If any survives after Plan 068,
stop and finish that cutover rather than building Plan 069 beside it.

- Worktree intent is an optional boolean available only inside turn bootstrap; standalone creation
  has no equivalent (`packages/contracts/src/orchestration-commands.ts:93-127`). Branch/path are then
  patched as thread metadata (`packages/contracts/src/orchestration-commands.ts:133-145`).
- The web representation is a hidden one-shot Zustand boolean, explicitly not part of the draft
  (`apps/web/src/features/chat-mode/state/session-isolation-store.ts:3-42`). The composer consumes it
  at send and transmits `requestWorktree` while still sending a root path
  (`apps/web/src/features/chat/components/chat-draft-view.tsx:80-109`,
  `apps/web/src/features/chat/utils/command-builders.ts:168-237`).
- The live checkout reactor serializes Git work globally, derives one worktree from a thread ID, and
  catches creation failure after the durable turn already exists (`apps/server/src/orchestration/session-checkout-reactor.ts:31-71`,
  `apps/server/src/orchestration/session-checkout-reactor.ts:87-132`,
  `apps/server/src/orchestration/session-checkout-reactor.ts:177-188`). Its stated fallback is the
  shared project root, which contradicts an explicit new-worktree promise
  (`apps/server/src/orchestration/session-checkout-reactor.ts:102-108`).
- Provider turn execution resolves cwd from copied session path with a project-root fallback
  (`apps/server/src/orchestration/provider-command-reactor.ts:271-297`). Plan 068 must have replaced
  this with session → worktree resolution before this plan starts.
- The low-level Git service is reusable: it creates deterministic linked checkouts under the Git
  common directory, lists through `git worktree --porcelain -z`, and refuses dirty removal unless
  force is explicit (`apps/server/src/git/worktrees.ts:18-70`,
  `apps/server/src/git/worktrees.ts:73-90`, `apps/server/src/git/worktrees.ts:135-175`). It still
  describes and derives one checkout per session, and attributes ownership from the directory name
  (`apps/server/src/git/worktrees.ts:30-35`, `apps/server/src/git/worktrees.ts:352-375`).
- Creation currently writes `branch.<name>.platform-base` only after `git worktree add`, ignores
  config-write failure, and later consults that sidecar before resolving a diff base
  (`apps/server/src/git/worktrees.ts:148-174`, `apps/server/src/git/worktrees.ts:232-281`). Do not make
  that unreceipted side effect part of the new saga; projected `baseCommit` replaces it.
- Removal protects the main checkout, checks containment, and reads fresh dirty state instead of a
  cache (`apps/server/src/git/worktrees.ts:177-208`, `apps/server/src/git/worktrees.ts:341-349`). Keep
  those safety properties.
- The low-level service also has public create/remove HTTP routes which bypass orchestration events,
  receipts, projections, and recovery (`apps/server/src/git/routes.ts:53-60`). Managed mutations must
  lose that parallel ingress in this plan.
- Its current session identifier schema explicitly rejects separators and dot segments before using
  an ID as a directory name (`apps/server/src/git/contracts.ts:81-99`). The post-068 UUID
  `WorktreeId` validation and containment checks must preserve that defense in depth.
- Current deletion is a live-only thread reactor. It tombstones first, then stops the provider,
  reclaims blobs, and tries to remove that thread's worktree; dirty/failure outcomes exist only in a
  wide log (`apps/server/src/orchestration/thread-deletion-reactor.ts:100-133`,
  `apps/server/src/orchestration/thread-deletion-reactor.ts:149-199`). Reactors subscribe after
  startup catch-up, so a crash can strand cleanup permanently
  (`apps/server/src/orchestration/engine.ts:77-90`, `apps/server/src/orchestration/engine.ts:397-413`).
- Terminal ownership is outside that provider gate: PTYs live in a private persistent-session map,
  spawn at the resolved root, and remain alive after socket detach until disposal/TTL
  (`apps/server/src/terminal/service.ts:67-83`, `apps/server/src/terminal/service.ts:128-152`,
  `apps/server/src/terminal/service.ts:269-273`,
  `apps/server/src/terminal/tests/service.test.ts:100-115`). Cleanup must coordinate with this owner
  rather than treating provider `no-binding` as proof that no process owns the checkout.
- Current disposal drops the terminal session immediately after requesting an asynchronous kill, while
  the bridge may wait before forcing its child (`apps/server/src/terminal/service.ts:291-301`,
  `apps/server/src/terminal/service.ts:621-627`). The new lease cannot end on disposal request; it needs
  positive process-death acknowledgement.
- App construction exposes the synchronous engine directly to routes, and command/snapshot handlers
  immediately call it (`apps/server/src/app.ts:129-140`,
  `apps/server/src/orchestration/routes.ts:60-89`). Plan 068 must have replaced this with the one
  awaited readiness coordinator; this plan inserts stages into that owner rather than adding another.
- Multiple conversations can already share a path accidentally: plan implementation copies the
  source conversation's worktree path into another conversation
  (`apps/web/src/features/chat/providers/plan-follow-up-provider.tsx:168-193`). Deleting either under
  the current owner model can target a checkout the other still uses.
- Low-level tests cover deterministic create/reuse, separate edits, clean removal, dirty refusal,
  main protection, and path containment (`apps/server/src/git/tests/session-worktree.test.ts:17-87`,
  `apps/server/src/git/tests/worktrees.test.ts:23-80`,
  `apps/server/src/git/tests/worktrees.test.ts:164-219`). Preserve the safety coverage while deleting
  obsolete one-session ownership assertions.
- The current row and header show a branch line/breadcrumb, not a worktree chip
  (`apps/web/src/features/chat-mode/components/session-row.tsx:111-142`,
  `apps/web/src/features/chat-mode/components/stage-header.tsx:34-70`).
- Settings registry entries must be wired when registered
  (`packages/contracts/src/settings/keys.ts:12-22`). This lifecycle is per-session command intent;
  this plan adds no setting.
- Git worktree failures already use an evlog catalog and must remain structured
  (`apps/server/src/git/worktrees.ts:73-90`, `apps/server/src/git/utils/worktree-errors.ts:1-43`).

## Outcome

After this plan:

1. Every new session carries an explicit discriminated choice: use the selected current worktree or
   request a new Platform-owned worktree from it.
2. New-worktree provisioning is a durable saga. A failure is projected and visible; the provider can
   never silently run the turn in another checkout.
3. Worktree IDs, paths, branches, base refs, lifecycle, and ownership belong to the worktree. Any
   number of sessions may reference a ready worktree.
4. Session rows and the stage header render the same compact worktree chip from the worktree
   projection.
5. Session deletion detaches a session only. Worktree cleanup is a separate guarded command, never
   inferred from one session tombstone.
6. Safe cleanup refuses referenced or dirty work without disturbing sessions, persists dirty/failed
   outcomes, and can be retained or retried. Destructive force cleanup requires a separately
   confirmed command; a project-level worktree manager keeps zero-session outcomes reachable.
7. Startup reconciliation completes or repairs provisioning and cleanup after every provable crash
   window by comparing versioned durable intent with real Git state and dispatching idempotent
   commands/events. Ambiguous provider handoff remains visible instead of being double-driven.
8. The model remains sufficient for a future compare query because stable worktrees may own many
   sessions; no compare field, route, score, view, or race launcher is added.
9. Low-level Git reads remain reusable, but no public create/remove route can mutate a managed
   worktree outside the orchestration spine.

## Locked design

### Creation target

Replace every boolean/path input with one contract:

```ts
type SessionWorktreeTarget =
  | {
      kind: 'current'
      worktreeId: WorktreeId
    }
  | {
      kind: 'new'
      worktreeId: WorktreeId
      baseWorktreeId: WorktreeId
    }
```

- “Send to current branch” means the worktree currently selected by the draft context. From a project
  draft it is the unique protected `kind: 'current'` worktree selected through Plan 068's shared
  selector; from a session/plan handoff it is that session's `worktreeId`. It is never a global
  current-project or current-branch setting.
- “New worktree” pre-mints a `WorktreeId` and branches from the selected base worktree's current HEAD.
  The client sends IDs and intent only. It never predicts a filesystem path or trusts a branch name.
- A non-Git project may use its protected current worktree but cannot request `new`. Server
  preparation returns a structured unsupported-repository rejection, and the picker disables “New
  worktree” with that reason instead of fabricating Git state.
- Newly provisioned managed checkout paths are
  `<git-common-dir>/platform-worktrees/<WorktreeId>`. The default branch is
  the collision-free `worktree/<full-uuid>` chosen server-side. Both path and ref use only the
  validated UUID, then still pass containment/ref validation. Low-level Git APIs take `worktreeId`,
  not `sessionId`.
- Plan-follow-up sessions explicitly choose the source session's `worktreeId`; that is real sharing,
  not copied path metadata.
- Apply the target to both standalone `session.create` and turn-bootstrap creation. Enumerate every
  producer: project draft, active-session draft, plan follow-up, keyboard/palette creation, and tests.
  Discovery never uses the picker; it resolves an existing worktree by canonical cwd.

### Worktree lifecycle

Use one discriminated lifecycle projected from events:

```ts
type WorktreeLifecycle =
  | {
      state: 'provisioning'
      operationId: CommandId
      baseCommit: string
      branch: string
    }
  | { state: 'ready' }
  | { state: 'creation-failed'; operationId: CommandId; errorCode: string }
  | {
      state: 'orphaned'
      reason: 'unprojected-managed-path' | 'stale-git-admin'
      pathKind: 'id-derived' | 'legacy'
    }
  | { state: 'missing' }
  | { state: 'retired'; retiredAt: string }
  | { state: 'cleanup-requested'; operationId: CommandId; mode: 'safe' }
  | {
      state: 'cleanup-requested'
      operationId: CommandId
      mode: 'discard-changes'
      expectedHead: string
      expectedStatusFingerprint: string
    }
  | {
      state: 'cleanup-blocked'
      operationId: CommandId
      reason: 'dirty' | 'needs-reconfirmation' | 'active-runtime' | 'active-terminal'
      changedFileCount: number | null
    }
  | { state: 'cleanup-failed'; operationId: CommandId; errorCode: string }
  | { state: 'removed'; operationId: CommandId; removedAt: string }
```

`changedFileCount` is non-null only for `reason: 'dirty'`; authorization drift and actual live
provider/terminal runtime use `null`.

- `protected` current worktrees and `external` worktrees may become `missing` but can never enter
  cleanup states. Only `platform` worktrees are removable by this lifecycle.
- Store requested base worktree, resolved `baseCommit`, `headCommit`, branch, canonical path,
  ownership, lifecycle, and nullable `removedAt` on the worktree projection. Enforce
  `state === 'removed'` iff `removedAt` is non-null; removal also stamps Plan 068's logical
  `retiredAt`. A `retired` row has `retiredAt` but no `removedAt`, so it never falsely claims project
  deletion removed a physical checkout.
  Base/head metadata is useful to normal diffs and keeps a future compare view possible; do not add
  compare groups, candidates, winners, scores, or sibling relationships.
- A session may point to a provisioning/failed worktree so the user's submitted message remains
  visible, but provider execution is allowed only for `ready`.
- Its first turn remains durably `blocked-on-worktree`; creation failure makes the session
  `needs-input` without terminalizing, recreating, or resending the user message. A provisioning
  retry uses a new operation ID with the same worktree/session/turn IDs and releases that exact turn
  once after `ready`. The existing renamed `session.turn.interrupt` command/event/receipt explicitly
  cancels and terminalizes a blocked turn; failure alone does not.

### Durable saga and crash windows

- The accepted session bootstrap appends `worktree.create-requested` (for `new`), `session.created`,
  user-message, and blocked-turn events/projections/receipt in the existing atomic transaction. The
  worktree lifecycle stores the originating command ID, exact base commit, and full-UUID branch.
- Before that acceptance, a trusted server command-preparation boundary resolves the base
  worktree's exact HEAD OID under the repository mutation lane, verifies the full-UUID branch is
  absent, and enriches the internal command; the client still sends IDs only. It begins with Plan
  068's wire-intent-fingerprint receipt lookup, so an accepted duplicate never re-resolves Git. A
  crash before acceptance leaves no durable session/receipt and the same client command can retry.
  Once accepted,
  create the branch with an expected-absent `git update-ref` at the persisted OID, then add the
  checkout from that branch. A crash after branch creation may adopt it only when it still points to
  the persisted OID; never move an existing ref. A moving base branch cannot change the fork.
- Projected `baseCommit` is the Platform worktree's immutable diff base. Pass it explicitly from the
  worktree projection into diff/checkpoint queries and delete the Plan-owned
  `branch.<name>.platform-base` write/read fallback. There is no post-add config side effect to recover;
  `ready` follows verified checkout creation. Current/external worktrees may keep the existing
  Git-backed default-base resolver when no projected Platform base exists.
- Completion/failure command IDs derive from `(worktreeId, operationId, outcome)`. A retry command
  creates a new operation ID; it cannot be swallowed by the prior failure receipt. The reactor never
  patches a session path.
- Result deciders compare-and-swap the current lifecycle state, operation ID, and cleanup mode. The
  first valid terminal outcome wins; a conflicting outcome for that operation or any op-N result
  arriving after op-N+1 receives a structured stale-result rejection and changes no projection.
  Live reactor and startup reconciler use the same fence.
- The provider prerequisite gate resolves the worktree projection after the worktree reactor drains.
  Only `ready` moves the blocked turn into Plan 068's durable provider-start claim path.
  `provisioning`, failed, orphaned, or missing never emits a provider side effect and never falls back
  to project root. Failure emits both the worktree result event and an explicit session/turn blocked
  event in one command batch so live streams publish a session delta; cold snapshot/replay must fold
  to the same attention result.
- Plan 069 extends `SessionAttentionReason` with `worktree`. A provisioning worktree with an
  uncanceled blocked turn is `working`; `creation-failed` or `missing` makes every non-deleted
  referencing session `needs-input` with reason `worktree` and `hasError: true`. Worktree blockers
  rank after approval/user-input/interruption but before turn failure/plan. They cannot be settled or
  acknowledged away: this deliberately extends Plan 068's error rule for the duration of an unresolved
  worktree blocker. Retry→ready clears that overlay and recomputes ordinary turn/error state. Every
  relevant worktree lifecycle event fans out session deltas to all references, including a
  ready→missing transition on a worktree shared by multiple sessions.
- The startup worktree reconciler queries durable nonterminal lifecycle rows and real
  `git worktree list` output inside Plan 068's readiness coordinator:
  - intent only → create;
  - checkout exists but ready event is missing → verify identity/branch and complete;
  - ready row but checkout is absent → mark missing and require user action;
  - cleanup intent and checkout exists → resume the authorized safe/force removal;
  - cleanup intent and checkout is already absent → complete removal.
- Reconciliation dispatches commands/events/receipts; it never writes projection rows directly.
- Serialize Git mutations by canonical Git common directory. Repositories may progress in parallel;
  two mutations in one repository may not contend on `index.lock`.
- Classify a Git-listed path under `platform-worktrees/` with no projection as `orphaned` and
  `ownership: 'unclaimed'`. A valid UUID basename recovers that ID; an invalid/mismatched basename
  mints a record ID but retains the exact canonical path as `pathKind: 'legacy'`. Attach only to the
  one project matching its Git common directory and surface adopt/release choices—never cleanup or
  auto-delete while unclaimed. Explicit adopt re-verifies the exact listed target/repository and
  transfers Platform ownership; cleanup may then use its stored canonical path plus containment.
  A missing/prunable Git admin entry is characterized with a
  real-Git test; if an exact targeted removal cannot prove safety, project `cleanup-failed` and STOP
  rather than running broad `git worktree prune`.
- Bootstrap order inside the existing coordinator becomes: full projection catch-up → stale provider
  and session-deletion stop recovery → provisioning/orphan reconciliation → safe/authorized cleanup
  reconciliation → eligible blocked-turn release/claim → first shell snapshot. Discovery remains the
  post-readiness delta scan defined by Plan 068.

### Cleanup semantics

- `session.delete` stops that session's provider and reclaims its attachment blobs, but never removes
  a worktree. Only provider-stop ownership gates checkout cleanup: it must be
  `completed | no-binding`. Blob reclamation remains independently retryable and a blob failure does
  not block an otherwise-safe worktree removal.
- A discovered session proves only unowned driver history, never that the external CLI stopped. Mark
  its worktree `externalDriverUnverified` durably. If that worktree is Platform-owned, safe and force
  cleanup both reject with `external-driver-unverified`; ordinary force remains dirt-only. This plan
  offers release/manual cleanup, which preserves the checkout, rather than inventing liveness. A later
  handoff protocol may clear the marker only with positive driver ownership/stop evidence.
- `worktree.cleanup` is safe/unforced and requires: Platform ownership, not protected, zero
  non-deleted session references (archived/settled sessions still count), provider stop
  `completed | no-binding` for historical referencing sessions, `activeTerminalCount === 0`,
  `terminalOwnershipUnknown === false`, `externalDriverUnverified === false`, no live adapter
  binding/process, and a Git-listed target inside the managed root. A failed stop stays retryable and
  blocks removal. Check every projected predicate in the decider, then actual runtime and dirty state
  at the final reactor boundary immediately before removal.
- A referenced cleanup command receives a structured rejected receipt and leaves the worktree
  `ready`; `cleanup-blocked` is reserved for post-acceptance last-moment blockers such as fresh dirt,
  authorization drift, or an actual live adapter. Force cleanup also requires zero references and
  successful/no-binding stop state—force bypasses dirt only.
- The pure decider transactionally checks projected references and provider-stop state before it
  accepts cleanup, including active/unknown terminal and external-driver markers; it does not pretend
  in-memory adapter state is transactional. After acceptance and
  under the repository mutation lane, the reactor acquires one exclusive `WorktreeExecutionGate`
  lease and rechecks the actual ProviderService binding/process immediately before Git removal. Every
  provider runtime holds a shared lease for its lifetime, so exclusive acquisition both proves none
  remain and blocks a new start. A live adapter dispatches durable `cleanup-blocked` with
  `reason: 'active-runtime'` and performs no removal. Retry uses a new operation ID after runtime
  recovery; the runtime-race test injects a binding between command acceptance and gate acquisition.
- Plan 068's TerminalService retains WorktreeId on each PTY. Every attached or detached-within-TTL PTY
  holds the same gate's shared lease for its lifetime; terminal open also requires lifecycle `ready`.
  Cleanup holds the exclusive lease through Git removal and result dispatch, then rechecks both
  services while protected. An existing PTY dispatches `cleanup-blocked` with
  `reason: 'active-terminal'`; it is never killed implicitly. Explicit terminal disposal followed by
  a new cleanup operation is required.
- `tryAcquireExclusive(worktreeId)` is non-blocking and reports provider versus terminal holders so
  the reactor can persist the correct blocker. Shared acquisition fails while cleanup holds exclusive;
  no request waits indefinitely on this in-memory gate. If both exist, `active-runtime` wins the
  projected reason; the next retry can expose `active-terminal` after provider stop.
- Terminal open uses a compact durable lease saga: `requested → claimed → active →
termination-requested → ended`, with `ownership-unknown` for ambiguous recovery. Commands/events
  carry terminal lease ID and server runtime epoch. Commit claim before spawn and hold the shared
  execution gate from claim through positive end; a start request accepted first makes cleanup
  ineligible, while cleanup accepted first makes terminal start reject because the worktree is not
  ready. Socket detach and disposal request do not end the lease.
- Project every non-ended/non-unknown lease in `activeTerminalCount`. Release the shared execution
  lease and decrement only after PTY `onExit` or bridge-child termination confirms death and the
  deterministic terminal-ended command has an accepted receipt. Infrastructure failure keeps a local
  pending-end holder and retries; kill timeout/failure stays terminating/blocked and never clears
  ownership.
- Startup may end an older-epoch `requested` lease that was never claimed, but cannot prove that a
  claimed/active/terminating bridge from an abruptly dead server exited. Convert those to durable
  `terminalOwnershipUnknown`, block safe/force cleanup, and offer release/manual cleanup; do not infer
  death from a missing in-memory map. The in-memory gate is the final live safety boundary, while
  projection state is the restart-safe UI/read model. Terminal routes await the same readiness
  coordinator before opening or reconnecting; they do not create a second bootstrap path.
- Dirty safe cleanup projects `cleanup-blocked` with `changedFileCount`; it is a successful durable
  lifecycle outcome, not a swallowed log-only exception. The chip/dialog shows it and offers retry.
- `worktree.force-cleanup` is a distinct client command accepted only after an explicit confirmation
  UI. A server preview binds confirmation to WorktreeId, HEAD, index tree, and a streaming Merkle
  fingerprint of every checkout entry that removal can destroy: tracked, untracked, and ignored
  regular-file bytes plus relative path, type, mode, and symlink target. Exclude only the separately
  validated `.git` administration file; reject unreadable entries and sockets/devices/FIFOs instead
  of authorizing removal. Paths/content never enter logs or the command token. Persist the expected
  HEAD/fingerprint with `discard-changes`, revalidate immediately before removal and after restart,
  and project `needs-reconfirmation` on any drift. Never infer force from project/session deletion.
- Cleanup removes the linked checkout only. It does not delete the branch, delete commits, run
  `git worktree prune`, or erase unrelated branch config. The obsolete Plan-owned
  `branch.<name>.platform-base` support is deleted during the diff-source cutover; any old developer
  key is inert and cleanup does not mutate it.
- `worktree.retain` cancels any `cleanup-blocked`/`cleanup-failed` operation and returns an existing
  verified checkout to `ready`; without it a retained checkout could never host another session.
  Retry/retain command IDs are new operations and do not reuse the blocked receipt.
- Project deletion is refused while Platform-owned worktrees remain. The user must safely/forcibly
  clean them or explicitly `worktree.release` them to external ownership. Release keeps the checkout
  and branch on disk and gives up Platform cleanup ownership; it requires zero non-deleted sessions
  and is not silent forgetting. Removed worktrees do not block project deletion.
- `worktree.resolve-missing` is a distinct confirmed command for a Platform-owned row in `missing`,
  `creation-failed`, or `cleanup-failed` whose canonical path and safely targetable Git admin entry
  are both absent. It requires the same zero-reference/stopped-runtime proof, performs no filesystem
  deletion, and records `removed` plus the retained-branch warning so project deletion cannot
  deadlock on an object that no longer exists. It is never inferred from a failed cleanup; failed rows
  with a listed checkout must use retain/retry instead. Bind confirmation to WorktreeId, canonical
  path, registration generation, and the observed absence; recheck path/admin absence under the
  repository lane before accepting the no-delete transition.

### UI behavior

- The draft shows two choices with the exact user-facing labels “Send to current branch” and “New
  worktree”. Default is current for each fresh draft. This is local draft intent, not a persisted
  workspace default.
- Delete the one-shot isolation store. Local composer/provider state owns the visible selection; a
  keyboard command may focus/open the picker but may not arm hidden future behavior.
- One `WorktreeChip` component renders in both the session row and stage header. It joins by
  `worktreeId`, shows the projected branch plus lifecycle, and never uses the raw absolute path as
  its label. Detached Git fallback is `Detached · <short WorktreeId>`; a non-Git current worktree is
  `Workspace`, never “Detached”.
- Add an idempotent `worktree.metadata.refresh` command/event at registration/adoption, before every
  provider turn, after Platform Git mutations, during startup, and on explicit status refresh. A
  terminal branch change may wait until the next of those boundaries; do not add a filesystem
  watcher. The command compare-and-swaps an expected metadata version, and its ID includes that
  version plus the observed branch/head tuple. This deduplicates an unchanged refresh without
  suppressing a later `A → B → A` transition.
- `OrbitLoader` is the small provisioning indicator, `Spinner` is only for a clicked cleanup control,
  and `EmptyState` is only a final verdict. Use `@workspace/ui`, theme tokens, and material utilities;
  no raw palette colors, raw controls when a primitive exists, ad-hoc surface opacity, or manual
  spinners.
- Dirty-file counts and any changing cleanup counts use `tabular-nums`. Errors use `destructive`,
  provisioning/info uses `info`, and ready uses normal foreground/success tokens as appropriate.
- Cleanup affordances explain whether the worktree is shared, dirty, protected, external, or already
  absent. Never offer a destructive button the server will predictably reject.
- For a non-Git project, “Send to current branch” remains available (the label is product copy), while
  “New worktree” is disabled with the projected unsupported reason.
- Project a per-base `worktreeCreationCapability` as
  `{ allowed: true } | { allowed: false; reason: 'not-git' | 'base-not-ready' | 'wrong-project' }`.
  The picker and command enablement consume it; the browser does not infer capability from branch/path
  or the opaque repository key.
- Add a project-level worktree manager/popover backed by all project worktree projections, including
  zero-session, orphaned, blocked, failed, missing, and released rows. It owns retry, retain, safe/
  forced cleanup, adoption, and release affordances. The last-session delete dialog is only a
  convenience link into this durable surface; cleanup must remain reachable after restart.
- Project `cleanupEligibility` in each worktree shell row with a reason such as `eligible`,
  `referenced`, `provider-stop-pending`, `provider-stop-failed`, `active-runtime`, `active-terminal`,
  `terminal-ownership-unknown`, `external-driver-unverified`, `protected`, `external`, `unclaimed`, or
  `missing`. For `missing`, separately project whether confirmed resolution is eligible.
  Session/provider/terminal runtime events fan out a worktree delta when either derived value changes.
  The manager disables predictably rejected actions from projection truth, explains that unverified
  process ownership requires release/manual cleanup, and still renders a raced structured rejection
  inline before refreshing.

## Scope

### In scope

- Session creation target contracts and UI.
- Append-only post-068 schema migration for lifecycle/operation metadata.
- Low-level Git worktree input/output ownership cutover from session ID to worktree ID.
- Durable provisioning, failure, retry, cleanup, release, and restart reconciliation.
- Provider execution gate on ready worktree state.
- Correct many-session reference guards.
- Provider and persistent-terminal exclusion leases plus conservative unowned-driver cleanup policy.
- Worktree chips in session row and stage header plus a project-level zero-session worktree manager.
- Safe and explicitly forced cleanup flows.
- Project-deletion guard for Platform-owned worktrees.
- Removal of direct managed-worktree mutation HTTP routes.

### Out of scope

- Orca compare/race UI, result comparison, evaluation, or winner promotion.
- Automatic N-agent fan-out.
- Cross-machine provisioning or cleanup. This plan remains a single-machine lifecycle.
- A Git overview of the main checkout and other local or remote worktrees. It remains unscheduled;
  collapsible sections, tabs, and optional machine grouping are later layout decisions.
- Branch deletion, remote branch deletion, worktree pruning, merge/rebase, or PR automation.
- A worktree default/cleanup policy setting. If later requested, add it to
  `packages/contracts/src/settings/keys.ts`, wire its consumer in the same phase, and regenerate
  `docs/settings-reference.md`; do not add localStorage or an env variable.
- Removing external/protected worktrees.
- Live terminal transcript mirroring.

### Post-068 owner map

Reconcile these exact owners before editing; rename only when the post-068 source already chose a
different precise name:

- Contracts/catalogs: `packages/contracts/src/chat-ids.ts`, `orchestration-commands.ts`,
  `orchestration-events.ts`, `orchestration-snapshots.ts`, and package `index.ts`.
- Schema/migrations: `apps/server/src/db/schema.ts`, `migrations.ts`, and migration tests.
- Domain spine/readiness: orchestration decider, read model, projection pipeline, receipt resolver,
  streams, provider-start gate, startup coordinator, and their `tests/` files.
- Git boundary: `apps/server/src/git/contracts.ts`, `worktrees.ts`, `routes.ts`, structured worktree
  errors, and real-Git tests.
- Terminal boundary: `packages/contracts/src/terminal.ts`, `apps/server/src/terminal/service.ts`, and
  terminal service tests; Plan 068 has already made WorktreeId the cwd owner.
- Web creation/display: chat command builders/draft owner, plan follow-up provider, session row/stage
  header, project actions/menu, and new component/util/tests under their feature kind directories.

## Git and destructive-action policy

- Work in the existing worktree and preserve unrelated changes.
- Tests create real temporary Git repositories and real linked worktrees, then remove only their
  exact temp roots during teardown.
- Never run recursive deletion against a workspace, home, repository root, env-expanded path, or
  unresolved glob. Production cleanup delegates only to Git's verified worktree removal path.
- Safe cleanup is the default. Force cleanup requires explicit command evidence and UI confirmation.
- After a material cleanup, tell the user what checkout was removed and that the branch/commits were
  retained.
- New production failures use existing evlog/createError catalogs and one wide operation event with
  worktree ID, project ID, lifecycle transition, duration, dirty count, and recovery outcome.

## Phase 1 — Add lifecycle contracts and migration 11

### Work

1. Add `SessionWorktreeTarget`, the full `WorktreeLifecycle` value contract, `unclaimed`
   ownership/path-kind, `SessionAttentionReason: 'worktree'`, and provisioning/metadata/blocked-turn
   event and command payloads to the centralized contracts. Do not expose cleanup/adopt/release
   command/event variants until Phase 4 can wire them in the same pass.
2. Extend standalone session creation and turn bootstrap so `current` references an existing ready
   worktree and `new` carries a UUID plus ready same-project base ID. Remove `requestWorktree`,
   worktree paths, and client-selected branch names.
3. Add structured invariants for missing/wrong-project/non-ready base, non-ready current target,
   non-Git new target, duplicate ID, provider start on non-ready worktree, and stale/conflicting
   provisioning outcomes. Define `session.turn.interrupt` for a blocked turn and fence later ready
   events from starting that canceled turn.
4. Extend event aggregate/receipt routing exhaustively for every command exposed in this phase.
   Persist the provisioning request command ID as operation ID and derive result IDs from operation
   ID rather than entity ID alone.
5. Append migration 11; never edit Plan 068's migration 10. Add resolved base OID, branch, head,
   metadata version, lifecycle JSON/discriminator, operation ID, `active_terminal_count`,
   `terminal_ownership_unknown`, `external_driver_unverified`, and `removed_at` fields/indexes.
   Backfill every version-10 live current/external row to `ready` with null operation fields and every
   logically retired row to `retired`; set active terminal count/unknown ownership to zero/false and
   derive the external-driver marker from retained discovered sessions. Use a fixture containing real
   worktree/session rows.
   Enforce removed-state/timestamp consistency and active-path uniqueness through
   `retired_at IS NULL`.
6. Preserve Plan 068 events/receipts. Teach the version-11 projector that a version-10
   `worktree.registered`, `worktree.revived`, or protected-current creation with no later lifecycle
   event folds to `ready`, while `worktree.retired` folds to `retired`. Resetting only projection
   rows/cursors and replaying the preserved version-10 log must also derive
   `externalDriverUnverified` from `session.created` with `origin: 'discovered'`, keep it sticky across
   later `session.deleted`, and produce the same snapshot as migration backfill.
7. Update the worktree/session shell delta shape with lifecycle, metadata version, and per-base
   `worktreeCreationCapability`. Lifecycle events publish every affected session delta. Phase 4 adds
   cleanup eligibility and its reverse fan-out with the commands that consume it. Bump the wire
   protocol only if Plan 068's reserved shape cannot carry the new fields without a breaking change.
8. Add fresh-database and version-10 migration fixtures, including `PRAGMA foreign_key_check`,
   lifecycle consistency, and migrated-snapshot-versus-replay equivalence assertions.

### Verify

```sh
cd packages/contracts
bun run test -- src/tests/orchestration.test.ts src/tests/worktree-lifecycle.test.ts
bun run typecheck
cd ../../apps/server
bun --bun vitest run src/db/tests/migrations.test.ts
cd ../..
if rg -n "requestWorktree|worktreePath" packages/contracts/src/orchestration-commands.ts; then
  exit 1
fi
```

Expected: fresh and version-10 databases converge under migration 11 with valid FKs and identical
snapshots after projection-only replay; invalid targets and lifecycle outcomes have contract shapes
for durable structured rejection; the final `rg` finds no
`worktreePath` or `requestWorktree` inside orchestration session-creation commands; contract
assertions prove the target carries IDs but no branch guess. Server consumers and typecheck become
green in Phase 2; do not commit/deploy this lockstep intermediate phase.

## Phase 2 — Re-key the Git boundary and implement recoverable provisioning

### Work

1. Change Git worktree contracts/service/results from `sessionId` ownership to UUID `worktreeId`.
   Keep the common-dir managed root, NUL parser, base-ref metadata, fresh dirty check, main protection,
   ref validation, and containment checks. Retain/update existing `worktree-list.test.ts`; delete
   obsolete one-session assertions from `session-worktree.test.ts` and move its reusable real-Git
   cases into the named provisioning/integration tests. Add traversal/full-ID branch/wrong-repository
   tests. Remove the ignored `platform-base` config write/read for Platform worktrees and make their
   diff path require the projected immutable `baseCommit`.
2. Remove public `/git/worktrees/create` and `/git/worktrees/remove`; managed mutations are internal
   service calls owned by orchestration. Keep read-only list/base/diff routes and update route tests.
3. Add trusted command preparation that resolves HEAD and verifies branch absence before acceptance,
   then persist exact base commit, full-UUID branch, and operation ID in the accepted event. Use an
   expected-absent ref create, never reset an existing branch. Verify a retry's branch and checkout
   against the persisted OID/repository before adoption; a mismatch is a structured conflict, not
   “already created”.
4. Replace the old checkout reactor with a worktree lifecycle reactor. It dispatches deterministic
   operation-scoped complete/failure and explicit dependent session/turn blocked/released events,
   producing both worktree and session shell deltas.
5. Change provider prerequisites and all cwd consumers to require a ready projected worktree and use
   Plan 068's claim marker. Delete fallback-to-project-root branches. Release the original blocked
   turn exactly once after ready unless its interrupt event already terminalized it.
6. Implement provisioning startup reconciliation in the existing readiness coordinator now, not in
   Phase 5. Cover a crash before command acceptance, then crashes after acceptance, after branch-ref
   creation, after Git add, and before result dispatch; moving base HEAD after acceptance cannot
   change the checkout or its projected diff base, and no config-write window exists.
7. Add compare-and-swap `worktree.metadata.refresh` at the locked boundaries and keyed
   per-repository serialization. Test unchanged dedupe, `A → B → A`, stale expected-version rejection,
   and prove independent repositories progress in parallel while same-repository mutations stay
   ordered.

### Verify

```sh
cd apps/server
bun --bun vitest run \
  src/git/tests/worktree-list.test.ts \
  src/git/tests/worktrees.test.ts \
  src/orchestration/tests/worktree-provisioning.test.ts \
  src/orchestration/tests/worktree-blocked-turn-cancel.test.ts \
  src/orchestration/tests/worktree-attention-fanout.test.ts \
  src/orchestration/tests/worktree-diff-base.test.ts \
  src/orchestration/tests/worktree-recovery.test.ts \
  src/orchestration/tests/worktree-operation-fencing.test.ts \
  src/orchestration/tests/worktree-metadata-refresh.test.ts \
  src/orchestration/tests/provider-worktree-gate.test.ts
bun run typecheck
cd ../..
if rg -n "worktrees/create|worktrees/remove" \
  apps/server/src apps/web/src --glob '!**/tests/**'; then
  exit 1
fi
```

Expected: requested creation either reaches ready at the exact projected checkout or reaches visible
failure; retry/restart preserves one user message and invokes the provider once only after ready; the
provider never receives a fallback cwd; non-Git new-worktree intent is rejected before an event or
Git side effect; projected base commit remains the diff source across an add→restart window; shared
worktree failure fans attention out to every referencing session; and the final `rg` finds no
production direct managed-mutation route or caller.

## Phase 3 — Replace hidden isolation with explicit UI and shared chips

### Work

1. Delete `session-isolation-store.ts` and its tests. Add one visible creation-target owner scoped to
   the current draft; do not persist it past the draft or expose a broad state blob.
2. Add the two-option picker to new-session composition and make keyboard/palette actions open/focus
   it. A project draft selects the unique protected current worktree; an active-session draft selects
   that session's worktree. A non-ready base disables both current use and new branching with a
   truthful lifecycle reason; a non-Git base disables only new branching.
3. Update standalone and bootstrap command builders, optimistic state, project/session entry points,
   keyboard/palette paths, and plan follow-up. Plan follow-up sends
   `{ kind: 'current', worktreeId: source.worktreeId }`; discovery has no picker path.
4. Add one `worktree-chip.tsx` render component and pure label/state helpers under `utils/`. Compose it
   into `session-row.tsx` and `stage-header.tsx`; do not duplicate markup or formatting.
5. Show provisioning, failed/missing/orphaned, external/protected, shared, and ready states
   accessibly. Use the prescribed UI primitives/loaders/tokens and `tabular-nums` for live counts.
   Branch label comes only from refreshed projection metadata with the locked detached fallback.
6. Keep leaf callbacks local. If the picker command crosses more than two component boundaries, add a
   narrow provider/hook rather than prop-drilling.
7. Surface the normal turn-interrupt control while a turn is blocked on worktree. Interrupting before,
   during, or after Git add prevents provider start; any completed checkout remains on the session and
   later requires ordinary session deletion plus explicit cleanup.

### Verify

```sh
cd apps/web
bun --bun vitest run --project node --project dom \
  src/features/chat/utils/tests/command-builders.test.ts \
  src/features/chat-mode/components/tests/worktree-picker.test.tsx \
  src/features/chat-mode/utils/tests/session-rail-model.test.ts \
  src/features/chat-mode/components/tests/worktree-chip.test.tsx \
  src/features/chat-mode/components/tests/session-rail.test.tsx \
  src/features/chat-mode/components/tests/stage-header.test.tsx \
  src/keymap/tests/session-commands.test.ts
bun run typecheck
```

Expected: both choices create the exact command shape, a shared worktree yields two session rows with
one chip identity, every creation producer chooses explicitly, picker focus/keymap behavior is
visible and scoped, a non-ready base cannot submit, a non-Git base offers current only, blocked-turn
interrupt prevents provider start, a non-Git chip says `Workspace` rather than `Detached`, and no
hidden future-send boolean survives.

## Phase 4 — Separate session deletion from safe/forced worktree cleanup

### Work

1. Verify Plan 068's session-deletion owner contains provider stop/blob reclamation only, projects
   stop `completed | no-binding | failed` separately from blob cleanup, and retries failed stops. Do
   not reintroduce any worktree call there. Blob cleanup remains independently retryable and does not
   gate checkout cleanup.
2. Add cleanup preview/authorization payloads and separate safe, force, retry, retain, adopt, release,
   confirmed missing-resolution, and terminal-lease request/claim/active/termination/exit/unknown-
   recovery command/event variants to the centralized contracts, then wire every variant through
   aggregate routing, receipt parsing, decider, projector, and reactor in this same phase. An
   exhaustive dispatch test must prove each union member returns events or a structured rejection,
   never `undefined`.
3. Implement those operations. Allow confirmed no-delete resolution from `missing`,
   `creation-failed`, or `cleanup-failed` only after proving both path/admin absence. The decider
   transactionally rejects non-deleted references, provider stops other than
   `completed | no-binding`, nonzero active terminal count, unknown terminal ownership, or unverified
   external-driver history; archived/settled references count. The reactor performs the locked final
   exclusive `WorktreeExecutionGate` acquisition plus provider/terminal recheck immediately before Git
   removal. Safe/force cleanup also rejects durable `externalDriverUnverified`; release remains
   available.
4. Persist dirty/reconfirmation/active-runtime blocked or failed state, operation ID, the
   changed-file count/null invariant, and the force authorization fingerprint. Referenced rejection
   leaves lifecycle ready. Never reduce cleanup outcome to a log field or let force bypass references
   or post-confirmation drift.
5. Add the cleanup dialog plus the project-level worktree manager for zero-session/orphan/blocked/
   failed rows. Deleting the last session may link to safe cleanup, but session deletion and worktree
   cleanup remain separate commands/receipts. Force is a separate confirmation; retain restores a
   verified checkout to ready.
6. Add derived `cleanupEligibility` to each worktree shell row and define reverse dependency fan-out:
   session/provider/terminal-runtime events publish a worktree delta when eligibility changes. Render
   that truth plus raced rejected receipts. In particular, after the last session tombstone the
   manager shows provider-stop pending/failed, active/detached/terminating terminal, unknown stale
   terminal ownership, or unverified external-driver ownership until the server projects a safe state;
   it never guesses from the missing session row.
7. Guard project deletion while Platform-owned worktrees remain. Offer cleanup or explicit release;
   releasing preserves physical checkout/branch and changes ownership before project deletion.
8. Confirm cleanup removes only the Git worktree. Branch, commits, unrelated branch config, and other
   worktrees remain.

### Verify

```sh
cd packages/contracts
bun run test -- src/tests/orchestration.test.ts src/tests/worktree-lifecycle.test.ts
bun run typecheck
cd ../../apps/server
bun --bun vitest run \
  src/orchestration/tests/worktree-command-dispatch.test.ts \
  src/orchestration/tests/session-deletion-recovery.test.ts \
  src/orchestration/tests/worktree-cleanup.test.ts \
  src/orchestration/tests/worktree-cleanup-blob-failure.test.ts \
  src/orchestration/tests/worktree-cleanup-failed-stop.test.ts \
  src/orchestration/tests/worktree-cleanup-terminal-lease.test.ts \
  src/orchestration/tests/worktree-cleanup-external-driver.test.ts \
  src/orchestration/tests/worktree-force-cleanup-authorization.test.ts \
  src/orchestration/tests/worktree-missing-resolution.test.ts \
  src/orchestration/tests/worktree-cleanup-runtime-race.test.ts \
  src/orchestration/tests/project-worktree-deletion.test.ts \
  src/git/tests/worktrees.test.ts \
  src/terminal/tests/service.test.ts
bun run typecheck
cd ../web
bun --bun vitest run --project node --project dom \
  src/features/chat-mode/components/tests/session-delete-dialog.test.tsx \
  src/features/chat-mode/components/tests/worktree-cleanup-dialog.test.tsx \
  src/features/chat-mode/components/tests/worktree-cleanup-eligibility.test.tsx \
  src/features/chat-mode/components/tests/worktree-manager.test.tsx \
  src/features/chat-mode/components/tests/worktree-chip.test.tsx
bun run typecheck
```

Expected: deleting one of two sessions never removes the shared checkout; referenced, failed-stop, or
provider/terminal-runtime-active cleanup is rejected/blocked without removal; attached and detached
PTYs require explicit disposal and positive exit; kill-without-exit remains blocked; terminal-open and
cleanup-gate races have exactly one winner; unknown stale terminal or unverified discovered-driver
ownership permits release/manual cleanup, not safe/force; blob-reclamation failure does not block
otherwise-safe cleanup; safe dirty cleanup remains reachable with zero sessions after restart; retain
restores ready; confirmed force removes only the fingerprint-confirmed checkout, while a
post-confirmation tracked, untracked, ignored, mode, or symlink change requires confirmation again;
and project deletion cannot orphan a Platform-owned worktree silently.

## Phase 5 — Reconcile lifecycle after crashes

### Work

1. Complete the startup worktree stages inside Plan 068's single readiness coordinator: after stale
   provider runtime/deletion-stop recovery, end provably unclaimed terminal requests and convert
   claimed/active/terminating leases from older server epochs to unknown ownership, reconcile
   provisioning/orphans, then cleanup, then release only blocked turns whose provider-start state is
   still provably unclaimed.
2. Cover a crash before bootstrap acceptance, then crashes after accepted intent, after
   branch-ref creation, after `git worktree add`, after ready projection, after cleanup intent, after
   force confirmation followed by a new edit, after physical removal, and after cleanup result
   dispatch. Each later retry uses a new operation ID; each result ID includes that operation.
3. Reconcile Git-listed managed-root paths with no projection as visible unclaimed orphan records.
   Test valid UUID basename recovery, invalid/mismatched basename, wrong repository refusal, explicit
   adoption before cleanup, and release. Characterize manually missing/prunable admin state with real
   Git and project a targeted failure/STOP when it cannot be removed safely; never issue a broad prune.
   Cover confirmed missing resolution across restart and prove it unblocks project deletion only
   after path/admin absence and runtime/reference checks all pass.
4. Sessions referencing `creation-failed`/`missing` worktrees stay `needs-input`; unclaimed orphaned
   rows have no session attention and instead stay visible/actionable in the project worktree manager.
   Unknown terminal ownership and unverified external-driver history remain blocked across restart.
   No boot path retries force cleanup without persisted authorization or automatically resends a
   claimed/ambiguous provider turn.
5. Make duplicate startup and live reactor execution converge. Reconciliation must be restartable at
   every await boundary and must not depend on in-memory sets. Refresh branch/head metadata through
   its command/event during the same scan. Race live and startup outcomes from op-N against an op-N+1
   retry and prove the compare-and-swap fence accepts exactly one current result.
6. Enrich one wide reconcile event with scanned/created/adopted/orphaned/removed/blocked/failed/
   skipped counts, duration, operation IDs, and worktree IDs. Do not log user file names or command
   content.

### Verify

```sh
cd apps/server
bun --bun vitest run \
  src/orchestration/tests/worktree-recovery.test.ts \
  src/orchestration/tests/worktree-provisioning.test.ts \
  src/orchestration/tests/worktree-operation-fencing.test.ts \
  src/orchestration/tests/worktree-attention-fanout.test.ts \
  src/orchestration/tests/worktree-metadata-refresh.test.ts \
  src/orchestration/tests/worktree-cleanup.test.ts \
  src/orchestration/tests/worktree-cleanup-failed-stop.test.ts \
  src/orchestration/tests/worktree-force-cleanup-authorization.test.ts \
  src/orchestration/tests/worktree-missing-resolution.test.ts \
  src/orchestration/tests/worktree-cleanup-runtime-race.test.ts \
  src/orchestration/tests/worktree-cleanup-terminal-lease.test.ts \
  src/orchestration/tests/worktree-cleanup-external-driver.test.ts \
  src/orchestration/tests/worktree-orphan-recovery.test.ts \
  src/orchestration/tests/startup-recovery.test.ts \
  src/orchestration/tests/engine.test.ts
bun run typecheck
```

Expected: every provable crash window converges after one or more restarts; ambiguous provider/Git
admin states become visible instead of guessed; stale terminal epochs become explicit unknown
ownership while unverified external-driver ownership remains blocked; no provider runs early; no dirty
checkout disappears without force evidence; and successive retry generations each receive exactly one
terminal event.

## Phase 6 — Final real-Git vertical gate

### Work

Create `apps/server/src/orchestration/tests/worktree-lifecycle.integration.test.ts`; use the real
in-process app/server fixture and real temporary Git repositories for the domain/server path. Use the
real TerminalService with an injected PTY factory; the child process is the allowed mock boundary:

1. Register a project/current worktree.
2. Create session A on current.
3. Create a new managed worktree and session B; create session C on B to prove many-to-one.
4. Move the base branch after the accepted provisioning event, fail one attempt, and verify retry
   still uses the persisted base OID, one message, and one eventual provider invocation.
5. Delete session B and prove session C still holds the checkout; then delete session C and wait for
   its provider/deletion cleanup to become terminal.
6. Make the checkout dirty, including an ignored file, verify its durable blocked state across
   restart, retain once, retry, confirm force, crash, mutate the ignored file, and prove restart
   requires a new authorization before a final force cleanup. Assert the reconstructed shell snapshot
   retains the blocked lifecycle and exact cleanup eligibility consumed by the web gate.
7. Assert the branch and commits remain after worktree removal.
8. Create another managed worktree, release it, and verify project deletion preserves its physical
   checkout without retaining Platform cleanup ownership. Register an unprojected managed-root path
   and prove it surfaces as orphaned rather than being deleted.
9. Open an in-app PTY in a Platform worktree, detach its socket, and prove both attached and
   detached-within-TTL states block cleanup. Make injected `kill()` omit exit and prove disposal stays
   terminating/blocked until an explicit exit acknowledgement; race terminal open against exclusive
   cleanup acquisition and prove exactly one wins. Crash another terminal epoch into unknown ownership.
   Discover an unowned session in a second Platform worktree, delete its row, and prove unknown or
   external ownership offers only release/manual cleanup.
10. Remove another managed checkout outside Platform, restart, resolve its projected `missing` row with
    the separately confirmed command, and prove project deletion is unblocked without a filesystem
    delete or broad prune.
11. Prove public Git create/remove mutation routes are absent while read-only listing remains.
12. Inspect the diff for compare features, copied path ownership, live-only cleanup, unsafe removal,
    unregistered settings, raw colors/manual loaders, and new production `new Error` calls.

Create `apps/web/src/features/chat/tests/worktree-lifecycle.integration.test.tsx` with
`apps/web/test/fixtures.ts`, the real in-process server, and a real temporary Git repository. Drive
both creation choices, render the shared chip, delete the final session, and prove the project-level
manager consumes that reconstructed shell snapshot and restores dirty/failed/missing rows. Exercise
force preview, post-confirmation drift, and renewed confirmation through the real UI; this is the gate
for manager reachability and confirmation behavior rather than the server-only test above.

### Verify

```sh
cd packages/contracts
bun run test -- src/tests/orchestration.test.ts src/tests/worktree-lifecycle.test.ts
bun run typecheck
bun run lint
bun run format:check
cd ../../apps/server
bun --bun vitest run \
  src/db/tests/migrations.test.ts \
  src/git/tests/worktree-list.test.ts \
  src/git/tests/worktrees.test.ts \
  src/orchestration/tests/worktree-lifecycle.integration.test.ts \
  src/orchestration/tests/worktree-provisioning.test.ts \
  src/orchestration/tests/worktree-blocked-turn-cancel.test.ts \
  src/orchestration/tests/worktree-attention-fanout.test.ts \
  src/orchestration/tests/worktree-diff-base.test.ts \
  src/orchestration/tests/worktree-operation-fencing.test.ts \
  src/orchestration/tests/worktree-metadata-refresh.test.ts \
  src/orchestration/tests/worktree-command-dispatch.test.ts \
  src/orchestration/tests/worktree-cleanup.test.ts \
  src/orchestration/tests/worktree-cleanup-blob-failure.test.ts \
  src/orchestration/tests/worktree-cleanup-failed-stop.test.ts \
  src/orchestration/tests/worktree-cleanup-terminal-lease.test.ts \
  src/orchestration/tests/worktree-cleanup-external-driver.test.ts \
  src/orchestration/tests/worktree-force-cleanup-authorization.test.ts \
  src/orchestration/tests/worktree-missing-resolution.test.ts \
  src/orchestration/tests/worktree-cleanup-runtime-race.test.ts \
  src/orchestration/tests/worktree-orphan-recovery.test.ts \
  src/orchestration/tests/worktree-recovery.test.ts \
  src/orchestration/tests/provider-worktree-gate.test.ts \
  src/terminal/tests/service.test.ts
bun run typecheck
bun run lint
bun run format:check
cd ../web
bun --bun vitest run --project node --project dom \
  src/features/chat/tests/worktree-lifecycle.integration.test.tsx \
  src/features/chat/utils/tests/command-builders.test.ts \
  src/features/chat-mode/components/tests/worktree-picker.test.tsx \
  src/features/chat-mode/components/tests/worktree-chip.test.tsx \
  src/features/chat-mode/components/tests/worktree-cleanup-dialog.test.tsx \
  src/features/chat-mode/components/tests/worktree-cleanup-eligibility.test.tsx \
  src/features/chat-mode/components/tests/worktree-manager.test.tsx \
  src/features/chat-mode/utils/tests/session-rail-model.test.ts \
  src/keymap/tests/session-commands.test.ts
bun run typecheck
bun run lint
bun run format:check
cd ../..
if rg -n "worktrees/create|worktrees/remove" \
  apps/server/src apps/web/src --glob '!**/tests/**'; then
  exit 1
fi
git diff --check
git status --short
```

The final `rg` is empty. No bare root verify and no second dev server are part of this gate.

## Done when

- Session creation visibly and durably chooses current versus new worktree by ID.
- Multiple live sessions can reference one ready worktree.
- No client command carries a worktree path, branch guess, or `requestWorktree` boolean.
- Non-Git projects can use current but reject/disable new-worktree creation consistently.
- New worktree failure is visible and blocks provider execution; there is no shared-root fallback.
- One projected, operation-versioned lifecycle explains provisioning, ready, failed, orphaned,
  missing, cleanup, blocked, and removed state after live operation or restart.
- The row and header use one worktree chip component backed by refreshed projection truth; the
  project worktree manager keeps zero-session lifecycle rows actionable.
- Session deletion never removes a shared checkout.
- Referenced cleanup is rejected without changing ready state; an adapter appearing after acceptance
  durably blocks the operation before removal. Attached/detached Platform PTYs also block until
  positively acknowledged exit; kill-without-exit and stale terminal ownership stay blocked, and
  unverified external-driver history requires release/manual cleanup. Blob-reclamation failure does
  not gate cleanup. Safe cleanup refuses dirty work; retain/retry is possible; force cleanup has
  explicit durable authorization bound to current Git state and requires reconfirmation after drift;
  branch/commits remain.
- Stale provisioning/cleanup outcomes cannot overwrite a later operation, and metadata refresh
  records `A → B → A` instead of losing the second `A` to receipt deduplication.
- Provisioning/missing lifecycle changes fan projected worktree attention to every referenced session;
  retry→ready clears only that overlay and recomputes underlying turn state.
- Unprojected managed paths remain unclaimed until verified adoption, and missing Platform worktrees
  plus failed operations with no checkout have a separately confirmed no-delete resolution path.
- Project deletion cannot silently orphan or deadlock on Platform-owned worktrees.
- Migration 11 upgrades fresh and post-068 databases; recovery closes every named provable crash
  window through commands/events/receipts/projections and surfaces ambiguous ones.
- No public Git create/remove mutation route bypasses orchestration.
- No compare view/query/score/race feature, setting knob, direct projection write, or compatibility
  layer was added.
- All focused gates pass and baseline-delta review contains only intended changes.

## STOP conditions

Stop and ask the operator if any of these occurs:

- Plan 068 is not complete/deleted or root `PLAN.md` has not scheduled this plan.
- The post-068 domain still has nullable worktree ownership, copied session paths, ThreadId aliases, or
  single-page projection catch-up.
- “New worktree” can reach the provider on current/project root after provisioning failure.
- A non-Git project can accept a new-worktree intent or synthesize branch/HEAD metadata.
- A cleanup design relies only on a live reactor, in-memory set, or log line.
- Cleanup cannot prove zero non-deleted session references, provider stop `completed | no-binding`,
  zero projected active terminals, no unknown/unverified driver ownership, plus exclusive
  `WorktreeExecutionGate` acquisition and final ProviderService/TerminalService rechecks immediately
  before Git removal.
- Safe or force cleanup would proceed after unowned/discovered driver history without positive stop
  evidence; this plan must offer release/manual cleanup instead.
- Terminal disposal would release its gate/count before positive PTY/bridge exit, or startup would
  treat an older terminal epoch as proven dead.
- Force cleanup lacks a distinct confirmed command/receipt or recovery would infer force.
- Force authorization is not bound to HEAD/index plus the exact tracked, untracked, ignored, mode,
  and symlink checkout fingerprint, or a restart could remove work after that fingerprint drifts
  without renewed confirmation.
- Git cannot prove the target is a listed, Platform-owned, non-protected worktree inside the managed
  repository boundary.
- Provisioning would resolve HEAD or a collision-adjusted branch only in memory, or recovery cannot
  distinguish successive operation IDs.
- A missing/prunable Git admin state would require broad `git worktree prune` or guessing ownership.
- Project deletion would hide a retained Platform-owned checkout without cleanup or explicit release.
- Any proposal adds Orca compare/race state or UI.
- A default/cleanup knob is proposed without registry entry, consumer, and regenerated settings
  reference. This plan currently needs no setting.
- Tests would delete a non-temp path or require starting another server.

## Maintenance

If the landed post-068 source changes lifecycle names, bootstrap order, projection shape, or cwd
ownership, reconcile this plan before execution. Update anchors, commands, and STOP conditions rather
than layering an adapter around drift. Delete this plan after implementation and verified completion;
Git history is the archive.
