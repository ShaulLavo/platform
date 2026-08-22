# Plan 050: Compose Multiple Language Servers Per Document

> **Executor:** Read this plan in full before editing. Then read `/Users/shaul/Desktop/D/platform/AGENTS.md`, `/Users/shaul/.agents/skills/never-nester/SKILL.md`, and `/Users/shaul/Desktop/D/platform/.agents/skills/improve/SKILL.md`. Keep nesting at three levels or less. Work only in the files listed under **Implementation scope**. Do not create a branch, worktree, commit, push, or PR unless the user explicitly asks.

## Status

- **State:** Ready
- **Priority:** P1
- **Effort:** L
- **Risk:** Medium
- **Category:** Feature / architecture completion
- **Depends on:** The shipped server and browser connection pools and the shipped live editor integration
- **Enables:** [Plan 049b — JSON language-server support for settings](./049b-json-language-server-for-settings.md)
- **Planned against:** platform `a33a0abb`, Editor `42f07a7`, 2026-08-22

## Ordering decision

Implement this plan before plan 049b.

The finished pools already provide all transport-level multi-server primitives: one backend process per `{root, serverId}`, shared initialization, request-ID isolation, document ownership, notification fanout, idle grace, and deterministic disposal. They do **not** provide document-level server discovery, feature ownership, capability arbitration, composite diagnostics, or aggregate status. Those responsibilities are still singular in the live editor path.

JSON is not an isolated consumer: `.json` and `.jsonc` already match Biome, while the JSON language server must own schema-aware completion and hover. Settings buffers also need a route path independent of their synthetic document URI and must suppress LSP diagnostics because the settings pipeline already owns validation diagnostics. Implementing JSON first would therefore create JSON-only matching, routing, lifecycle callbacks, feature suppression, and status behavior. This plan supplies those generic extension points once; plan 049b only registers and configures the JSON consumer.

The dependency is strict:

```text
050 multi-server composition
  └─ 049b JSON language server + settings schema association
```

Do not execute the plans in parallel. Both touch the LSP registry and web editor integration, and 049b is defined against the contracts introduced here.

## Problem statement

The transport architecture is already multi-connection, but the selection and editor architecture still assume one server per document:

- `apps/server/src/lsp/registry.ts` sorts all extension matches and returns only the first.
- `apps/server/src/lsp/routes.ts` exposes one match from `GET /lsp/match` and acquires one explicitly selected backend for each websocket.
- `apps/web/src/features/editor/hooks/use-language-server-match.ts` stores one match.
- `apps/web/src/features/editor/hooks/use-lsp-plugin.ts` creates one language-server plugin and one status source.
- `apps/web/src/features/editor/utils/language-server-plugin.ts` creates one Editor LSP contribution.
- `apps/web/src/features/editor/state/language-server-status-source.ts` stores one status and one diagnostic collection.

Installing multiple copies of the current Editor plugin is not a solution. Each copy registers the same command IDs and edit capability and independently owns hover, diagnostics, document highlights, semantic tokens, and other visible surfaces. The Editor host rejects duplicate command and capability ownership. Completion is the exception: it already supports multiple registered sources through `EDITOR_COMPLETION_SOURCE`.

## Existing architecture that must be preserved

### Server process and protocol ownership

`apps/server/src/lsp/proxy-session.ts` already owns the backend lifecycle through `LspSessionPool`:

- one process per `{root, serverId}`;
- one in-flight start per key;
- cached and replayed initialize results;
- per-connection request-ID remapping;
- shared document ownership with `didClose` only after the last owner leaves;
- diagnostic and server-notification broadcast;
- idle backend teardown; and
- application-wide disposal from `apps/server/src/app.ts`.

`apps/server/src/lsp/routes.ts` also has a short per-websocket queue while asynchronous matching and acquisition complete. That queue is transport startup buffering, not multi-server scheduling.

### Browser connection ownership

`apps/web/src/features/editor/state/language-server-connection-pool.ts` adapts the Editor package's `LspConnectionPool` and keys entries by `{rootPath, serverId}`. `../Editor/packages/lsp-plugin/src/lspConnectionPool.ts` already owns:

- one websocket/client per key;
- per-view leases;
- initialization and ready-state replay;
- notification fanout;
- a 30-second last-lease grace period; and
- final disposal.

### Live editor ownership

The current live editor already mounts the language-server plugin through `apps/web/src/features/editor/components/editor.tsx`. Settings JSON uses that same editor component and has its own settings-validation diagnostics plugin.

Diff hovers legitimately require a distinct proxy connection owner because they open immutable old/new document copies and must close them without closing a live editor's ownership. The current `diff-language-session.ts` also reimplements the websocket handshake, request IDs, startup queue, and the same 15-second request timeout already owned by the LSP client. Preserve the distinct owner identity, but migrate its transport and requests to a dedicated lease from the existing browser pool in this plan.

## Architecture boundary

This plan adds composition above the existing pools. It must not create another process pool, websocket pool, client cache, request queue, initialization barrier, idle timer, reconnect loop, or server-side protocol multiplexer.

| Concern                                                                   | Sole owner after this plan                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Backend process, initialize replay, protocol request IDs, document owners | `LspSessionPool` in `apps/server/src/lsp/proxy-session.ts`                                       |
| Browser websocket/client leases and grace disposal                        | `LspConnectionPool` in `../Editor/packages/lsp-plugin/src/lspConnectionPool.ts`                  |
| Diff connection identity                                                  | A dedicated key issued by the platform pool adapter; the existing pool still owns the connection |
| Diff immutable document `didOpen`/`didClose`                              | `diff-language-session.ts`, over its dedicated existing-pool lease                               |
| Static server definitions, extension matching, declared feature ranks     | Platform server LSP registry                                                                     |
| Runtime capability truth                                                  | Each initialized LSP client                                                                      |
| One document's lane composition and feature arbitration                   | One composite plugin in `@singapor/lsp-plugin`                                                   |
| Match loading, document-specific exclusions, shared ready notifications   | Platform web editor integration                                                                  |
| Combined status and diagnostics exposed to platform UI                    | Platform language-server status source                                                           |
| Settings schema generation and JSON-specific association                  | Plan 049b only                                                                                   |

Every matched server still receives its own explicit `/lsp?...&server=<id>` websocket and its own existing pool key. A secondary server may initialize, fail, disconnect, be acquired again, and dispose independently. No server may delay another server's connection acquisition or initial editor usability.

## Target design

### 1. Shared feature vocabulary and ranks

Add a contracts-level `LspFeatureId` wire vocabulary used by server match descriptors and the platform web client:

- `completion`
- `hover`
- `navigation`
- `signatureHelp`
- `diagnostics`
- `codeActions`
- `formatting`
- `rename`
- `documentHighlights`
- `semanticTokens`

Document synchronization is mandatory transport behavior for every lane. It is not a feature role and cannot be ranked or disabled.

Each `LspServerDefinition` declares a partial feature-rank map. A lower numeric rank wins. Missing features do not participate. The declaration controls which clients the composite plugin may ask; the initialized client's advertised capabilities remain authoritative at request time.

Extend the existing `lsp.servers` override contract with a `features` record. A non-negative integer enables or re-ranks a feature; `null` disables an inherited feature. Reject negative, fractional, and unknown feature values. Do not add a second setting or a hardcoded web-only priority table. Update the `lsp.servers` registry description to distinguish match-time extension/feature changes from command/environment/initialization changes that apply on the next backend start, then regenerate `docs/settings-reference.md`.

Built-in definitions must state their intended participation explicitly. In particular:

- language servers rank ahead of linters for semantic features;
- formatter/linter servers may rank first for formatting and diagnostics;
- Biome continues to match `.json` and `.jsonc` after plan 049b adds the JSON server; and
- stable ordering falls back to the existing server priority and then server ID when feature ranks tie.

### 2. Collection matching, explicit transport

Replace the implicit single winner with a collection matcher. `GET /lsp/match` returns every eligible descriptor in stable order:

```ts
type LspMatch = {
  root: string
  serverId: string
  features: Partial<Record<LspFeatureId, number>>
}
```

The websocket route remains single-server and requires or resolves one explicit `serverId`. Keep `LspSessionPool.acquire()` unchanged. Split collection matching from explicit server resolution if that makes the boundary clearer; never make the websocket route open or proxy several servers.

The semantic-token HTTP route, if retained, must accept an explicit server or select the highest-ranked semantic-token match using the same registry result. It must not retain the old unrelated first-extension-match rule.

### 3. One composite Editor plugin

Add one public composite factory in `@singapor/lsp-plugin`, named `createLanguageServerSetPlugin`. It accepts independently configured lanes, each with an ID, connection provider, declared feature ranks, and optional shared ready-time notifications.

Define the lane's transport/options shape once in the package and use it for both the composite contribution and a small headless lane-acquisition API. The headless API must resolve the same initialization defaults, capabilities, notification handlers, websocket transport, and request timeout as the view plugin, then return the existing provider's lease/client/ready state. It must not add request IDs, buffering, retries, or timeout policy.

The composite plugin owns exactly one set of editor commands, one edit capability, and one instance of each visible presenter/controller. Each lane independently borrows the existing connection provider and independently synchronizes the same document. Disposal releases every acquired lane through the existing lease API.

Keep `createLanguageServerPlugin` as the one-lane convenience API and implement it through the same composite core. This is a single implementation path, not a compatibility fork.

Use these arbitration rules:

| Feature             | Policy                                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completion          | Register one existing completion source per eligible, capable lane; let the Editor completion registry combine them                                                                                                                            |
| Hover               | Query eligible ready lanes concurrently and combine non-empty results in rank order in one tooltip                                                                                                                                             |
| Diagnostics         | Keep batches keyed by lane, union them in stable rank order, and render through one `DiagnosticsPresenter`; clearing or failure removes only that lane's batch                                                                                 |
| Code actions        | Query eligible ready lanes concurrently, retain lane provenance for execution, and combine in rank order                                                                                                                                       |
| Document highlights | Query eligible ready lanes concurrently and render one combined decoration set                                                                                                                                                                 |
| Navigation          | Use the highest-ranked ready lane that advertises the requested capability                                                                                                                                                                     |
| Signature help      | Use the highest-ranked ready lane that advertises the capability                                                                                                                                                                               |
| Formatting          | Use exactly one highest-ranked ready lane; document and on-type formatting share that owner                                                                                                                                                    |
| Rename              | Use exactly one highest-ranked ready lane                                                                                                                                                                                                      |
| Semantic tokens     | Designate exactly one highest-ranked lane before construction and use one semantic decoration layer; if that lane does not advertise support, disable semantic tokens for the document instead of switching profiles underneath the live layer |

For merged requests, an individual lane error contributes no result and does not fail or clear other lanes. Use the existing per-client request behavior; do not introduce arbitrary sleeps, aggregate initialization waits, startup races, or new timeout workarounds.

The existing single-server behavior must remain a degenerate one-lane case. Do not modify Editor core duplicate-capability rules or add parallel command namespaces to make several full plugins coexist.

### 4. Generic document targeting

Add one platform editor input, `LanguageServerDocumentTarget` (exact name may follow local conventions), with:

```ts
type LanguageServerDocumentTarget = {
  matchPath: string
  disabledFeatures?: readonly LspFeatureId[]
  sharedNotificationsByServer?: Readonly<
    Record<string, readonly { method: string; params: unknown }[]>
  >
}
```

The default file-backed target uses the editor document path, has no exclusions, and has no notifications. `matchPath` is server-selection and root-resolution input for both `GET /lsp/match` and each explicit server websocket. The editor document ID remains the URI synchronized to each LSP. This separation is required by plan 049b for `settings-json:user` and `settings-json:workspace`, which intentionally are not filesystem paths.

Feature exclusions are applied before constructing lanes. Ready-time notifications are sent only to their named lane after initialization and before that lane starts `DocumentSync` or any request controller. A slow or failed notification blocks only its own lane.

The notification contract is intentionally strict because the backend is pooled: every notification must be idempotent and carry complete backend-wide state. Every lease sharing `{root, serverId}` must produce the same payload; this layer does not merge arbitrary per-view notification parameters. Sending the same payload after a new pooled connection acquisition is allowed and must use the existing client lifecycle rather than a new reconnect mechanism. Plan 049b satisfies this rule by associating both stable settings document IDs in one complete JSON-server notification.

### 5. Aggregate platform state

Replace the singular match hook with a plural hook that preserves the existing abort and stale-result guards. Build one composite plugin from the returned descriptors.

The platform status source stores per-server connection state internally and exposes one aggregate to the current UI:

- `idle` when there are no eligible matches;
- `loading` when matches exist, none is ready, and at least one is connecting;
- `ready` when any eligible lane is both connected and usable under the existing interactive-ready contract;
- `error` only when every eligible lane has reached an error state; and
- combined diagnostics from the composite presenter, never a last-writer-wins batch.

A secondary failure must not replace a ready aggregate with `error` or erase another lane's diagnostics.

The diff-language hook selects the highest-ranked lane eligible for its requested hover/navigation work. Keep `diff-language-session.ts` as a separate **document** owner, but remove its connection implementation:

- request a dedicated provider key from the platform's existing pool adapter, so the proxy sees a connection owner distinct from any live editor; the adapter appends an opaque per-session suffix to the existing `{root, serverId}` browser key and reports that suffix only as an owner kind in logs;
- acquire the selected lane through the package's shared headless lane API;
- await that lease's ready state, then send the diff session's own `didOpen` notifications;
- send requests through the returned `LspClient`, which already owns request IDs and the shared 15-second timeout; and
- send `didClose` for opened diff documents and release the lease on disposal.

Do not retain the raw socket, handshake ID, queued message array, pending-request map, or `REQUEST_TIMEOUT_MS` in `diff-language-session.ts`. Do not share the live editor's browser connection key: the server pool still shares the backend by `{root, serverId}`, while the dedicated browser lease preserves the proxy's per-connection document-owner accounting. Diff remains single-lane; this plan does not fan a diff request out to several servers.

Acquire that dedicated lease lazily on the first diff request. The existing pool grace may retain its now-documentless connection briefly after release; do not add a diff-specific timer or a second pool to close it sooner.

## Current-source evidence

Before implementation, verify these invariants at the planned revisions:

- `apps/server/src/lsp/registry.ts`: `matchLspServer()` currently filters, sorts, and returns index zero.
- `apps/server/src/lsp/routes.ts`: `lspRouteMatch` returns one `{root, serverId}`; the websocket already accepts an explicit `server` query.
- `apps/server/src/lsp/proxy-session.ts`: `LspSessionPool` already owns process sharing, request mapping, document ownership, notification broadcast, and disposal.
- `apps/web/src/features/editor/state/language-server-connection-pool.ts`: the platform adapter already keys the Editor pool by root and server ID.
- `../Editor/packages/lsp-plugin/src/lspConnectionPool.ts`: leases, status replay, notification fanout, grace disposal, and ready state already exist.
- `../Editor/packages/lsp-plugin/src/plugin.ts`: the current top-level factory installs fixed commands and one contribution that owns all visible LSP features.
- `../Editor/packages/editor/src/plugins.ts`: the language feature registry supports several providers, but completion is the only LSP feature with an existing multi-provider contribution token.
- `apps/web/src/features/settings/state/diagnostics-plugin.ts`: settings validation already owns settings-buffer diagnostics.
- `apps/web/src/features/editor/state/diff-language-session.ts`: diff documents need a separate proxy owner, but the current raw socket, handshake ID, queued bodies, pending request map, and copied 15-second timeout duplicate the shipped pool/client architecture.

If any invariant has changed, stop and update this plan before editing source. Do not layer the plan onto a different architecture by assumption.

## Implementation scope

### Platform files allowed

- `packages/contracts/src/lsp-protocol.ts` (new)
- `packages/contracts/src/settings.ts`
- `packages/contracts/src/settings/keys.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/tests/settings-registry.test.ts`
- `docs/settings-reference.md` (generated)
- `apps/server/src/lsp/registry.ts`
- `apps/server/src/lsp/routes.ts`
- `apps/server/src/lsp/tests/registry.test.ts`
- `apps/server/src/lsp/tests/routes.test.ts`
- `apps/web/src/features/editor/hooks/use-language-server-match.ts` (delete/rename)
- `apps/web/src/features/editor/hooks/use-language-server-matches.ts` (new)
- `apps/web/src/features/editor/hooks/use-lsp-plugin.ts`
- `apps/web/src/features/editor/hooks/use-diff-language.ts`
- `apps/web/src/features/editor/components/editor.tsx`
- `apps/web/src/features/editor/utils/language-server-plugin.ts`
- `apps/web/src/features/editor/state/language-server-connection-pool.ts`
- `apps/web/src/features/editor/state/diff-language-session.ts`
- `apps/web/src/features/editor/state/language-server-status-source.ts`
- `apps/web/src/features/editor/hooks/tests/use-language-server-matches.test.tsx` (new)
- `apps/web/src/features/editor/hooks/tests/use-diff-language.test.tsx` (new)
- `apps/web/src/features/editor/state/tests/language-server-status-source.test.ts` (new)
- `apps/web/src/features/editor/state/tests/diff-language-session.test.ts` (new)
- `apps/web/src/features/editor/tests/language-server-plugin.test.ts`

### Editor files allowed

- `../Editor/packages/lsp-plugin/src/plugin.ts`
- `../Editor/packages/lsp-plugin/src/lane.ts` (new)
- `../Editor/packages/lsp-plugin/src/serverSet.ts` (new)
- `../Editor/packages/lsp-plugin/src/pluginTypes.ts`
- `../Editor/packages/lsp-plugin/src/types.ts`
- `../Editor/packages/lsp-plugin/src/completionProviders.ts`
- `../Editor/packages/lsp-plugin/src/codeActions.ts`
- `../Editor/packages/lsp-plugin/src/diagnosticsPresenter.ts`
- `../Editor/packages/lsp-plugin/src/documentHighlightController.ts`
- `../Editor/packages/lsp-plugin/src/documentSync.ts`
- `../Editor/packages/lsp-plugin/src/hoverDefinitionController.ts`
- `../Editor/packages/lsp-plugin/src/semanticTokens.ts`
- `../Editor/packages/lsp-plugin/src/signatureHelpController.ts`
- `../Editor/packages/lsp-plugin/src/websocket.ts`
- `../Editor/packages/lsp-plugin/src/index.ts`
- `../Editor/packages/lsp-plugin/test/serverSet.test.ts` (new)
- `../Editor/packages/lsp-plugin/test/lane.test.ts` (new)
- existing focused LSP-plugin tests changed only when their one-lane assertions exercise the delegated composite core

### Explicitly out of scope

- `apps/server/src/lsp/proxy-session.ts`
- `../Editor/packages/lsp-plugin/src/lspConnectionPool.ts`
- Editor core command, plugin, or capability registries
- server-side multiplexing or protocol rewriting
- JSON server registration, settings schema generation, or settings schema association
- new UI for per-server details
- unrelated LSP installer, logging, or settings refactors

If implementation appears to require changing an out-of-scope ownership file, stop and reconcile the plan. Do not duplicate its responsibility elsewhere.

## Git and drift checks

The platform worktree was dirty when this plan was written. Preserve all unrelated user changes. Before editing:

```bash
git status --short
git rev-parse --short HEAD
git -C ../Editor status --short
git -C ../Editor rev-parse --short HEAD
```

Expected revisions are platform `a33a0abb` and Editor `42f07a7`. If either HEAD differs, inspect the relevant diffs and update the **Current-source evidence**, scope, and gates before implementation. Never reset or discard existing work.

## Implementation steps and gates

### Step 1: Define feature ranks and collection matching

Add the shared feature vocabulary, settings override shape, built-in rank declarations, stable collection matcher, and explicit single-server resolver. Update focused registry tests for:

- multiple extension matches;
- deterministic feature ordering;
- numeric override and `null` exclusion;
- disabled servers;
- explicit server resolution; and
- Biome retaining `.json` and `.jsonc` eligibility.

Regenerate the settings reference.

**Gate:** In `/Users/shaul/Desktop/D/platform`, run:

```bash
bun run settings:reference
bun --filter @workspace/contracts test -- settings-registry
bun --filter server test -- src/lsp/tests/registry.test.ts
```

Do not continue until generated documentation is current and the collection matcher is deterministic.

### Step 2: Return all matches without changing transport ownership

Change `GET /lsp/match` to return the collection descriptor. Keep each websocket explicit and single-server. Update route tests to prove:

- the match response returns several descriptors when applicable;
- every descriptor retains its independently resolved root, including when two matching servers choose different roots;
- an explicit websocket server still acquires only that backend;
- an unknown explicit server is rejected; and
- the existing startup queue remains per socket and is not used for cross-server coordination.

**Gate:** Run:

```bash
bun --filter server test -- src/lsp/tests/routes.test.ts
bun --filter server typecheck
```

Review the diff and confirm that `proxy-session.ts` is unchanged.

### Step 3: Add one composite Editor contribution

Implement the lane set and arbitration table above inside `@singapor/lsp-plugin`. Reuse the existing completion registry and connection-provider lease API. Add focused fake-client tests that prove:

- two lanes acquire and release independent existing pool keys;
- the view composite and headless acquisition resolve the same connection defaults and both delegate ownership to the supplied provider;
- only one command/edit/presenter contribution is registered;
- completion, hover, diagnostics, code actions, and highlights combine in stable rank order;
- formatting, rename, and semantic tokens have one owner;
- runtime capability absence skips a lane for routable features, while absence on the designated semantic-token lane disables that feature without a second layer or runtime profile switch;
- a secondary initialization or request failure does not block a ready primary;
- clearing one diagnostic batch preserves the other; and
- one-lane construction has the existing behavior.

Do not add sleeps or wall-clock startup assertions. Drive fake connection state synchronously or with explicit deferred promises.

**Gate:** From `/Users/shaul/Desktop/D/platform`, run:

```bash
bun --cwd ../Editor run --filter @singapor/lsp-plugin test -- serverSet.test.ts lane.test.ts
bun --cwd ../Editor run --filter @singapor/lsp-plugin typecheck
```

Review the Editor diff and confirm that `lspConnectionPool.ts` and Editor core registries are unchanged.

### Step 4: Wire plural matches, document targets, and aggregate state

Add the plural match hook and generic document target. Construct one lane per match and one composite plugin. Implement ready-time named notifications and feature exclusions without changing document IDs. Aggregate status and diagnostics using the rules above. Update the diff hook to select one role-ranked server while preserving its separate session.

Add focused web tests that prove:

- stale match responses cannot replace the current path's collection;
- each descriptor receives a distinct existing pool provider;
- a synthetic document may match through a separate relative `matchPath`;
- exclusions remove a feature before lane construction;
- complete shared notifications go only to the named ready lane and replay after a new pooled connection acquisition through the existing lifecycle;
- a ready primary plus failed secondary remains aggregate `ready`;
- diagnostics are a union, not last-writer-wins; and
- diff hover selects one highest-ranked eligible server;
- each diff session receives a dedicated browser-pool key but reaches the same server-pool `{root, serverId}` backend;
- requests issued before readiness await the lease rather than entering a second message queue; and
- disposal closes only the diff documents and releases the lease without closing a live editor owner.

**Gate:** Run:

```bash
bun --filter web test -- language-server-plugin.test.ts use-language-server-matches.test.tsx language-server-status-source.test.ts use-diff-language.test.tsx diff-language-session.test.ts
bun --filter web typecheck
```

### Step 5: Final scoped verification

Run only the relevant package gates:

```bash
bun --filter @workspace/contracts typecheck
bun --filter server typecheck
bun --filter web typecheck
bun --cwd ../Editor run --filter @singapor/lsp-plugin test
bun --cwd ../Editor run --filter @singapor/lsp-plugin typecheck
git diff --check
git -C ../Editor diff --check
```

Use the already-running development server for a manual smoke check with a file matched by at least two configured servers. Confirm that one server becoming unavailable does not remove the other's completion or diagnostics and does not create duplicate commands, hover surfaces, or semantic layers. Do not start another dev server.

## Done criteria

- A document can receive a stable list of independently connected servers.
- The existing server and browser pools remain the only connection owners.
- There is one editor contribution and one visible owner for commands, edits, hover, diagnostics, highlights, and semantic tokens.
- Feature arbitration follows one shared descriptor rather than server-name conditionals in the web app.
- Runtime capability checks remain authoritative.
- Status and diagnostics are aggregated without last-writer-wins behavior.
- Synthetic documents can supply a separate match path and named ready-time notifications.
- Diff documents retain a distinct proxy owner and choose one ranked server, while their handshake, request IDs, timeout, connection lifecycle, and transport come from the existing pool/client architecture.
- Plan 049b can add JSON by registering a server and supplying settings-specific target data, without adding generic routing or lifecycle behavior.

## Stop conditions

Stop and update the plan before continuing if:

- either existing pool lacks a primitive required above;
- the implementation needs a second queue, pool, connection cache, idle timer, or server-side multiplexer;
- the diff session retains its raw websocket, initialize handshake, request-ID map, startup queue, or copied timeout;
- multiple full Editor plugins or duplicate command/capability registrations appear necessary;
- feature ownership cannot be expressed by the shared rank descriptor plus runtime capabilities;
- settings JSON support would still need a JSON-only routing or lifecycle path after this plan; or
- relevant source has drifted outside the documented scope.

## Plan maintenance

When implementation completes, mark this plan complete, record the actual revisions and focused commands, then unblock plan 049b in both that plan and `plans/README.md`. If implementation changes any public contract described here, update plan 049b in the same pass before JSON work begins.
