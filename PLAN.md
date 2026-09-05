# Cross-Project Execution Roadmap

> **Status:** reconciled against Platform base `704d6ab6`, Editor base `b0919967`, and
> `ghostty-webgpu` closeout `06b070b` on 2026-08-29, including the verified paired working-tree paint
> contract below. Re-run each executable plan's drift check and capture its current HEAD plus full
> dirty diff before editing.

This file is the sole source of cross-project execution order. [`plans/README.md`](plans/README.md)
is the Platform executable-plan inventory. Strategy documents under `docs/` describe product scope
but do not authorize implementation. A completed executable plan is deleted after its checks pass;
Git history is the archive.

## Verified completed foundations

- Platform's one-document representation and deterministic file-sync cutover are live. Completed
  plan 038 has been deleted.
- Editor BiDi geometry Tiers A and B are complete; Editor has no standalone BiDi execution plan.
- Multi-server-per-document LSP and schema-aware settings JSON support are live. Do not rebuild a
  one-server compatibility layer.
- Conflict-proof settings persistence is live: normal writes use one semantic intent pipeline,
  confirmed and projected state are separate, raw JSON retains compare-and-swap conflicts, and the
  consolidated appearance provider owns transient preview plus commit handoff. Completed plan 059
  has been deleted.
- Editor-parity wave E0 is complete.
- The bounded last-visible-paint contract is live across Editor and Platform. Editor owns
  `EditorVisibleSnapshot`, `EditorInitialHighlightStatus`, and the generation-tagged
  `EditorInitialPaintEvent`; Platform owns the one-record, 256 KiB
  `editor-visible-snapshot-cache.ts`, inert overlay handoff, exact applied-theme guard, and
  `editor-open-benchmark.mjs` paint marks. This cache is unvalidated visual paint only: it never
  supplies text, tokens, revision truth, or a correctness decision to the live editor.
- The sole typed command/focus runtime is live. `platformCommands` is the command definition table,
  `CommandBus` owns synchronous claims plus non-rejecting async settlement, and `FocusService` owns
  deepest registered targets, actual DOM focus, and explicit origin restoration. The superseded
  draft and completed implementation plan have been deleted.
- Platform's two-stroke keymap is implemented at `0f5b0618`. One provider-owned chord session
  serves app commands and terminal input through the existing bus and focus targets. Focused tests
  and trusted browser input pass. Current behavior is recorded in
  [`docs/vscode-keymap-development.md`](docs/vscode-keymap-development.md).
- Lockstep WorkspaceEdit transactions are live in Editor and Platform. Editor owns typed LSP edit
  parsing, planning, inversion, and document application; Platform owns preview, filesystem commit,
  recovery, undo/redo, mutation coordination, and product integrations. Completed plan 063 has been
  deleted.
- Platform's terminal now uses the native `ghostty-webgpu` integration. Phase 3 DOM/input is
  complete in `ghostty-webgpu@0.1.1` commit `50788b2`; its headed macOS
  keyboard, IME, clipboard, idle-rendering, and VoiceOver gate is PASS in
  `ghostty-webgpu/docs/phase-3-acceptance.md`. Platform remains on registry `0.1.0` because both
  installed wasm artifacts are byte-identical to the verified package.
- App-owned Shiki resolution is live across Platform and Editor. Platform resolves every supported
  grammar and theme to registration data; Editor's inline worker uses the static Oniguruma engine,
  accepts only resolved registrations, and has a package-build assertion that rejects sibling JS
  chunks. The real-browser built-dist proof resolves the bounded 53-language preload set and emits
  `editor.syntax.highlight_applied` to the shared JSONL log.

## Shared runtime boundary

The typed command/focus foundation is landed in `apps/web/src/keymap/table.ts`,
`apps/web/src/keymap/state/command-bus.ts`, `apps/web/src/keymap/providers/command-provider.tsx`, and
`apps/web/src/lib/focus/`. Settings commands submit through the semantic intent API and await its
`settled` result; no command may add another settings mutation or error-reporting path.

No later Platform editor milestone may create an active-Editor pointer, a second settings mutation
path, a React-effect transaction coordinator, or a compatibility shim for the deleted architecture.

## Independent package lane

The `ghostty-webgpu` xterm-facade program is a separate package lane. Plan 008 is complete with its
accepted divergences transferred to the later certification gate. Plan 009 is blocked because the
required parser/Unicode, inactive-buffer, row-marker, and OSC 8 APIs are not public. Plan 010's CPU
gate has passed, but it remains blocked on Plan 009 and physical operator evidence. Plans 011–015
remain in package-defined dependency order and are not prerequisites for current Platform work.

## Ghostty appearance lane

The completed config-resolver feasibility proof found that the pinned normal loader can create a
template when no config exists. The operator accepted one narrow divergence on 2026-08-28: the
resolver may derive the fixed default candidates from explicit roots and pinned suffixes, freeze
their paths and precedence in tests, then open and parse them read-only through Ghostty. It must
never call the template-writing loader, a create-capable candidate builder, or duplicate any
parser, include, theme, conditional, diagnostic, color, or palette semantics.

The revised exact-Zig proof confirmed that divergence works, then found that Ghostty's only
official Config initializer and shared executable graph retain and initialize GUI-only
shader/renderer dependencies. On 2026-08-28 the operator accepted that as a second narrow
divergence: the heavy helper may be a stripped, platform-specific optional host dependency, loaded
and spawned only when the registered appearance feature is enabled. Its absence must degrade to
the existing Platform appearance without a config read, subprocess, download, or startup failure.

The proof also found that Ghostty's macOS Application Support candidate builders reach
Foundation directory lookup with `create: true`. This is not a terminal proof failure. It refines
the accepted fixed-candidate divergence: neither the writing loader nor a create-capable path
builder may run during discovery. Derive the fixed legacy/current candidates read-only from the
explicit isolated home/config roots and the pinned constant suffixes, freeze their exact paths,
load order, and duplicate behavior in tests, and pass only existing files to Ghostty's read-only
loader.

The proof is complete at `ghostty-webgpu` evidence HEAD
`e9c198e073067d5415ac4224176db1eb076f5dbf`. Workflow run `33212162580`, attempt `1`, used proof
recipe SHA-256 `40083f27ad5f925808cc48e0fdd428b4ab0515eb38dedb42b0ca2065a16e44f0` and recorded native
`PASS` rows for `darwin-arm64`, `darwin-x64`, `linux-arm64`, and `linux-x64`. On 2026-08-29 the
operator accepted exact package ceilings of `2097152`, `2097152`, `8388608`, and `9437184` bytes
respectively, with total ceiling `22020096` bytes. Stable evidence lives at
`ghostty-webgpu/docs/config-resolver-feasibility.md` and
`ghostty-webgpu/docs/config-resolver-feasibility.json`; the maintained strict verifier is
`ghostty-webgpu/scripts/config-resolver-proof/verify-evidence.ts`.

Plan 066 is **PROPOSED — ROOT GO/NO-GO SCHEDULING**. The accepted proof makes that packaging plan
eligible for a separate root scheduling decision; it does not authorize implementation, artifact
creation, publication, or Plan 067. Plan 067 remains **BLOCKED ON 066 REVIEWED ARTIFACT**, separate
root scheduling, and dirty-file reconciliation. If Platform ever considers a Ghostty fork, prefer
contributing a read-only Config path API and Config-only initializer/build target upstream first;
the optional-heavy allowance does not make the current graph the preferred long-term boundary.

Do not replace this lane with a TypeScript Ghostty parser, `ghostty +show-config`, a maintained fork,
browser-visible host paths, or cold-start reads triggered by a disabled workbench setting.

## Ordered Platform editor lane

Plan 056 is complete at Platform `0f5b0618`. The remaining editor work is
**Plan 057, standalone Editor chords and the shared Platform keymap**, delivered in lockstep with
Editor.

First, prove automatic chord execution through standalone Editor's ordinary binding options and
its built public keymap entry point. Standalone default and custom chords must work before
Platform adopts that runtime. Then migrate Platform's combined app and editor table, disable the
embedded Editor matcher, and remove Platform's duplicate engine. Preserve the existing command
bus, target and enablement policy, and terminal handoff.

Follow [`plans/057-editor-native-vscode-keymap.md`](plans/057-editor-native-vscode-keymap.md).
Baseline work has started; see [`plans/057-baseline.md`](plans/057-baseline.md) for
the pinned Editor revision, binding comparison, and outstanding verification gates.
Both repositories must pass their paired verification before this lane is complete.

## Environments lane (foundation completed 2026-09-05)

[`docs/environments-and-remote-plan.md`](docs/environments-and-remote-plan.md) is the reviewed
strategy: several machines connected at once, chat across all of them, and the workbench following
one. The same repository on two machines groups as one project; each checkout keeps independent
files, Git changes, and unsaved buffers.

**Plan 077 is complete.** Runtime origins are canonicalized, server identity survives restarts,
and authenticated health and WebSocket handshakes refuse identity or protocol mismatches. Each
origin owns its HTTP client, QueryClient, and retained editor runtime. Switching remounts query
consumers while preserving documents and save destinations; queued mutations keep their original
owner. One command bus captures the selected runtime before execution. Chat transports close
explicitly, and WebSocket auth refusal uses `1008`. The development-only loopback switch is
verified with two real in-process servers and an A → B → A browser workflow. Its executable plan
has been deleted.

The remaining order is:

1. **Plan 068 — session domain, environment-aware.** Next. Machine-independent repository identity
   (origin remote, else root commit) makes ids repeat across machines by design. The web projection
   store uses environment-scoped refs; the rail model and address grammar carry the environment.
   Populates one environment; shapes for many.
2. **Plan 078 — federated environments.** Requires 068. Machines setting and page, desktop SSH
   launcher over a loopback-to-loopback forward with no install and no pairing, one chat connection
   per machine, scoped persistence, cross-machine rail with repository grouping, chips and a machine
   filter, add-project-on-machine, workbench switch, and per-machine failure states.
3. **Later, on demand only:** the direct `https://` origin check through the mesh proxy (WebSocket
   upgrade and path prefix), then pairing, issued sessions and revocation for a client that cannot
   SSH. The old design's auth analysis in git history (`docs/environments-and-remote-plan.md@1325b003`)
   is the reference for that plan.

Plan 068 must not be executed from its pre-2026-09-05 shape: the single-environment web store it
described is obsolete. Plan 069 follows 068, stays single-machine, and remains unscheduled. The
combined Git overview across checkouts and machines is also unscheduled; its scope is recorded in
strategy §5.6. Nothing in this lane binds a server off loopback; the SSH forward keeps both ends on
loopback and the existing origin allowlist is the whole guard.

## Verification boundaries

- **Platform-only:** verify the narrow Platform tests/typechecks named by the active plan.
  Completed Plan 056 was verified within this boundary.
- **Platform + Editor lockstep:** plan 057 requires focused checks and diff review in both
  worktrees. Neither repository's half is complete alone.
- **`ghostty-webgpu`:** run its package gates in that repository.
- **Environments (068, 078, extending completed 077):** verify with two isolated in-process or
  loopback servers and distinct databases; the SSH gate uses the `localhost` target only. No test or demo binds
  non-loopback. Pairing, sessions, and TLS refusal are one later security boundary, not part of
  these three plans.
- Preserve pre-existing dirty work in every linked worktree. Use baseline deltas and the narrowest
  checks that can catch a plausible regression; never use a bare root test count as completion proof.

## Promotion, rewrite, defer, and deletion decisions

- **Deleted:** completed plans 038 and 077, and superseded plan 058.
- **Editor lane:** Plan 056 is complete. Revised Plan 057 is next, with standalone Editor chord
  execution verified before Platform adopts the shared runtime.
- **Promoted:** environments foundation 077 is complete; remaining order is 068 → 078.
- **Deferred:** the mesh https proxy check and pairing/sessions, until a client that cannot SSH
  exists; all compatibility work for the obsolete per-tab/active-editor/one-server architecture.
- **Proposed independently:** accepted four-target config-resolver feasibility evidence makes Plan
  066 eligible only for a separate root go/no-go scheduling decision. It does not authorize
  packaging or publication. Plan 067 remains blocked on Plan 066's reviewed artifact, separate root
  scheduling, and dirty-file reconciliation; a future fork proposal must prefer upstreaming
  read-only Config path and Config-only build boundaries first.
- **Package-blocked:** `ghostty-webgpu` plan 009 needs public native extension surfaces. Plan 010 is
  additionally waiting on that dependency and physical operator gates; plans 011–015 remain downstream.
