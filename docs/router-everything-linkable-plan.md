# Addressable State: URL Design and Implementation Plan

**Status:** proposal · **Scope:** `apps/web` (+ two lines in `apps/desktop`) · **Author:** judge synthesis of the three competing designs

---

## 0. Verdict

I am not adopting any of the three as written. I am taking **the grammar and the boot rule from URL-as-truth**, **the ownership model and the incrementality from URL-as-projection**, and **the three-state restore result and the document-kind codec table from the codec-registry design** — plus one move none of them make, which is what fixes the projection design's fatal objection.

### Why the others lose

**URL as single source of truth loses on cost/benefit against the primary target.** The desktop shell opens `BrowserWindow({ url: WEB_URL, titleBarStyle: 'hiddenInset' })` with no path, no query, and no protocol handler (`apps/desktop/src/bun/index.ts:132-154`; `WEB_URL` is `runtimeUrl(WEB_HOST, WEB_PORT)` at `:31-33`). There is no address bar. On the platform this app is actually built for, the URL is a string no user can read, type, or share. The design pays for that invisible string by deleting `isActiveWorkspaceRoot` (`apps/web/src/state/active-project-store.ts:28-30`), rekeying every consumer of `activeEditorTabId`, and putting a router above `EditorStateProvider` — which takes all 45 files importing `renderWithProviders` (`apps/web/test/render.tsx:26-49`) onto a router dependency. And it does not achieve what it claims: its own text concedes a local shadow during tab drag, and `parkedWorkspaces` (`apps/web/src/features/editor/state/editor-workspace-state.tsx:126-155`) holds unsaved buffers that are not addressable and never will be. A single source of truth with two admitted exceptions is the current architecture with the exception moved.

**URL as projection loses on its own stated objection: two writers, silent drift.** A hand-written `addressFromState` that mirrors a subset of ~28 stores is correct only for as long as nobody adds a third code path that sets `activeSidebarTab`. Its classification test catches a new key, not changed semantics. Its loop guard — a module-level `applying` flag, a `popstate` listener, and an rAF coalescer that must all agree under StrictMode double-invocation — is the epicycle machine CLAUDE.md's debugging section forbids, and the design says so itself.

**The codec registry loses to its own concession.** Nine surfaces, all written by us, no plugin story: a six-slot `SurfaceAddressCodec` registry with an `AddressSlot` enum is generality with no consumer. Its author already names the honest version — a registry for _document kinds only_, plain named fields for everything else. I am taking exactly that, and nothing more.

### The move that makes the projection safe

The projection design's drift risk exists because the URL is **write-only decoration**: nothing depends on it, so nothing notices when it is wrong.

So make it load-bearing. **The `Address` value is both the URL serialization and the localStorage restore payload for the fields it owns.** `uiMode`, the chat-mode session selection, and the intra-document position stop having their own cache keys and are restored _through_ `parseAddress`. One serializer, one parser, exercised on the author's own machine on every single reload. A drift bug in the encoder is no longer "links sometimes open the wrong pane a year from now" — it is "reload lands me on the wrong file", noticed within one dev session.

That is the whole thesis:

> **Stores own state. An `Address` is a sparse, serializable value naming _where you are_. The URL is one rendering of it; localStorage is the other. Absent keys mean "defer to the remembered slice", never "reset to default".**

> [!IMPORTANT]
> **Overruled 2026-08-12: TanStack Router is adopted from the first milestone, not deferred to the last.**
> The paragraph below argued for a hand-rolled `history` + `URLSearchParams` transport with the library as an
> optional endgame. Three checks retired that argument:
>
> 1. **The desktop shell loads over `http://`** (`apps/desktop/src/bun/index.ts:31-33` → `waitForHttp(WEB_URL)`),
>    so pushState works natively. The "no address bar" objection is about URL _visibility_, and it is an argument
>    against routing at all — not against this library. Linkability is a settled requirement.
> 2. **TanStack is already the house stack** — `react-query`, `react-virtual`, `react-pacer`, `react-hotkeys` are
>    all in `apps/web/package.json:52-55`. The router is consistency, not a new vendor.
> 3. **The two hardest parts of the hand-rolled design ship in the box.** `retainSearchParams`
>    (`refs/.../routes/_chat.$environmentId.$threadId.tsx:281-283`) _is_ the "absent means defer to the remembered
>    slice" rule §2 specifies by hand, and `createMemoryHistory` is the answer to the ~200 `renderWithProviders`
>    tests §6 names as the largest risk. The reference's whole routing layer is 1064 lines and `router.ts` is 32
>    of them.
>
> Building the transport first means writing it and then deleting it — two migrations for one outcome.
>
> **What survives unchanged:** the `Address` value as _dual_ serialization — one codec feeding both the URL and the
> localStorage restore payload — which is the load-bearing idea of this plan and is orthogonal to the transport.
> Under TanStack it gets cleaner: the valibot schema validating search params becomes that codec, and valibot is
> already the repo's schema language.
>
> **Two costs accepted with eyes open.** Use **code-based routes**, not `@tanstack/router-plugin` — our shape is a
> handful of routes with rich search params, so the codegen and the generated `routeTree.gen.ts` buy nothing.
> And `apps/web/test/render.tsx` must build a memory-history router, after which every component test renders
> inside one; that is the change most likely to surprise us and it lands in milestone one, not last.
>
> Where the milestones below defer the library, read them as adopting it up front and dropping the bespoke
> transport step. §1.2's warning still applies and gets _more_ urgent: the root route must declare the four dev
> params or TanStack's strip-unvalidated-params default kills them silently.

No router library in the plan. The transport is `history` + `URLSearchParams`. TanStack Router is a _last, optional_ milestone once the grammar is proven, taken only for `useBlocker` and injectable history — the reference proves the factory shape works (`/Users/shaul/Desktop/D/refrences/t3code/apps/web/src/router.ts:8-32`) and equally proves it buys nothing on the data side (zero loaders anywhere in that codebase).

---

## 1. The URL grammar

```
/~<workspace-slug>/<mode>/<document-token>?<view params>#<position>
```

- **Path** = identity: which workspace, which mode, which _active_ document.
- **Search** = composition and filters: the full tab set, panel selection, per-surface filters, overlays.
- **Fragment** = intra-document position. Never sent to a server, never in referers or logs.

The workspace segment always starts `~` so the flat top-level namespace stays free. `/` alone means "no address — restore from storage". `/~-` means "no folder open" and renders `EmptyWorkspace` (`apps/web/src/components/app-workspace.tsx:59`).

### Document tokens

One grammar, used identically in the path segment and inside `?tabs=`.

| token                                  | document                                                                      | source of the encoding                                                                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `f/<relpath>`                          | file                                                                          | `EditorTabRecord.path` (`apps/web/src/components/workspace/editor-tabs/utils/editor-tab-model.ts:34-37`)                                                                                               |
| `d/<source>/<old>..<new>/<relpath>`    | snapshot diff; `source` ∈ `worktree`\|`staged`, `old`/`new` are 40-hex or `_` | replaces `snapshotDiffDocumentId` (`apps/web/src/features/git/diff-document.ts:121-133`)                                                                                                               |
| `d/branch/<base>...<head>[/<relpath>]` | **reserved, currently unavailable**                                           | server answers `/git/branch-diff` (`apps/server/src/git/routes.ts:48`) but nothing on the client renders it — stated verbatim at `apps/web/src/features/chat/utils/thread-diff-scope-storage.ts:14-18` |
| `k/<threadId>/<from>..<to>`            | checkpoint diff, thread scope                                                 | `checkpointDiffDocumentId` (`diff-document.ts:103-119`)                                                                                                                                                |
| `k/<threadId>/<from>..<to>!turn`       | checkpoint diff, turn scope                                                   | same                                                                                                                                                                                                   |
| `k/<threadId>/<from>..<to>/<relpath>`  | checkpoint diff, file scope                                                   | same                                                                                                                                                                                                   |
| `c/<relpath>`                          | compare-saved (buffer vs disk)                                                | `compareSavedDocumentId` (`apps/web/src/features/editor/compare-saved-document.ts:12`)                                                                                                                 |
| `s`                                    | the search buffer                                                             | `searchBufferDocumentId` (`apps/web/src/features/search/search-buffer-document.ts:10-12`) — the encoded absolute root disappears, because the workspace is already in the path                         |
| `t/<threadId>`                         | chat thread (mode `chat` only)                                                | `SessionSelection {kind:'session'}`                                                                                                                                                                    |
| `t/new`                                | chat draft (mode `chat` only)                                                 | `SessionSelection {kind:'draft'}`                                                                                                                                                                      |
| _(absent)_                             | mode `chat` with no explicit pick                                             | `SessionSelection {kind:'auto'}`                                                                                                                                                                       |
| `conflict-*`                           | **no token exists**                                                           | rejected by the parser; see §3.5                                                                                                                                                                       |

`~` inside a path segment is percent-encoded as `%7E` so `?tabs=` can join tokens with `~`. `|` is reserved as a future pane separator (`splitTab: () => false` today — `apps/web/src/features/editor/state/editor-commands.ts:122`).

### Owned search params

Bare keys: `tabs side bottom tool rail scope settings`. Prefixed groups: `s.*` (search buffer), `log.*` (log dashboard). **Every other key passes through untouched** — see §1.2.

### Examples

| what                                                      | URL                                                                                                                                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| no address (cold desktop launch)                          | `/`                                                                                                                                                                                       |
| a project                                                 | `/~platform`                                                                                                                                                                              |
| a project, no folder open                                 | `/~-`                                                                                                                                                                                     |
| chat, newest thread                                       | `/~platform/chat`                                                                                                                                                                         |
| **a chat thread**                                         | `/~platform/chat/t/thread-9f3a1c2e-77b0-4d51-9a2e-0c8f1b6d4a10`                                                                                                                           |
| **a draft**                                               | `/~platform/chat/t/new`                                                                                                                                                                   |
| chat thread + git tool pane                               | `/~platform/chat/t/thread-9f3a1c2e-77b0-4d51-9a2e-0c8f1b6d4a10?tool=git`                                                                                                                  |
| chat thread, tool pane on one turn's diff                 | `/~platform/chat/t/thread-9f3a1c2e-77b0-4d51-9a2e-0c8f1b6d4a10?tool=git&scope=turn-4a1b0c22`                                                                                              |
| chat, archived rail across all projects                   | `/~platform/chat?rail=archived&scope=all`                                                                                                                                                 |
| **open file with a line number**                          | `/~platform/workbench/f/apps/web/src/lib/workspace-cache.ts#L484`                                                                                                                         |
| file with line and column                                 | `/~platform/workbench/f/apps/web/src/main.tsx#L21,9`                                                                                                                                      |
| file with a selected range                                | `/~platform/workbench/f/apps/web/src/lib/workspace-cache.ts#L484-L520`                                                                                                                    |
| **several editor tabs, one active**                       | `/~platform/workbench/f/apps/web/src/main.tsx?tabs=f/apps/web/src/App.tsx~f/apps/web/src/main.tsx~d/worktree/_..8c1d0f3a…/apps/web/src/keymap/commands.ts~s&side=git&bottom=problems#L21` |
| **diff — working tree**                                   | `/~platform/workbench/d/worktree/a1b2c3d4…..f6a7b8c9…/apps/web/src/App.tsx`                                                                                                               |
| diff — staged                                             | `/~platform/workbench/d/staged/a1b2c3d4…..f6a7b8c9…/apps/web/src/App.tsx?side=git`                                                                                                        |
| diff — added file (no old blob)                           | `/~platform/workbench/d/worktree/_..f6a7b8c9…/apps/web/src/features/address/utils/grammar.ts`                                                                                             |
| **diff — checkpoint, one file**                           | `/~platform/workbench/k/thread-9f3a1c2e/3..5/apps/web/src/keymap/commands.ts`                                                                                                             |
| diff — checkpoint, whole thread                           | `/~platform/workbench/k/thread-9f3a1c2e/3..5`                                                                                                                                             |
| diff — checkpoint, one turn                               | `/~platform/workbench/k/thread-9f3a1c2e/4..5!turn`                                                                                                                                        |
| **diff — branch** (reserved; renders "not available yet") | `/~platform/workbench/d/branch/main...feature%2Flogin`                                                                                                                                    |
| compare buffer against disk                               | `/~platform/workbench/c/apps/web/src/App.tsx`                                                                                                                                             |
| **search with a query**                                   | `/~platform/workbench/s?s.q=createStructuredError&s.m=regex&s.case=1&s.x=**%2Ftests%2F**`                                                                                                 |
| search scoped to a subtree                                | `/~platform/workbench/s?s.q=useAddressProjection&s.in=apps%2Fweb%2F**`                                                                                                                    |
| **git panel**                                             | `/~platform/workbench/f/apps/web/src/App.tsx?side=git`                                                                                                                                    |
| git panel in chat mode                                    | `/~platform/chat/t/thread-9f3a1c2e?tool=git`                                                                                                                                              |
| **terminal**                                              | `/~platform/workbench/f/apps/web/src/App.tsx?bottom=terminal`                                                                                                                             |
| **problems**                                              | `/~platform/workbench/f/apps/web/src/App.tsx?bottom=problems`                                                                                                                             |
| **logs — relative window**                                | `/~platform/workbench?side=logs&log.level=error&log.area=git&log.since=6h&log.slow=500`                                                                                                   |
| **logs — frozen window (Copy link)**                      | `/~platform/workbench?side=logs&log.level=error&log.area=git&log.from=2026-08-12T09:00:00Z&log.to=2026-08-12T15:00:00Z`                                                                   |
| logs with a text filter                                   | `/~platform/workbench?side=logs&log.src=be&log.find=ENOENT`                                                                                                                               |
| **settings — providers**                                  | `/~platform/workbench/f/apps/web/src/App.tsx?settings=providers`                                                                                                                          |
| **settings — models**                                     | `/~platform/chat/t/thread-9f3a1c2e?settings=models`                                                                                                                                       |
| **settings — keybindings**                                | `/~platform/workbench?settings=keybindings`                                                                                                                                               |
| settings with no folder open                              | `/~-?settings=providers`                                                                                                                                                                  |
| unknown workspace                                         | `/~someone-elses-repo/workbench/f/src/index.ts` → disambiguation screen (§5)                                                                                                              |

Settings sections come from the existing panel composition: `provider-section.tsx`, `model-section.tsx`, `keybinding-section.tsx` under `apps/web/src/features/settings/components/`. Settings stays a **dialog** overlaying whatever is behind it (`?settings=` is a param, not a path). That preserves the reason it is a dialog — `AppCommandSurface` renders above the `rootFolder ? WorkspaceView : EmptyWorkspace` branch so `Mod+,` lands identically in both modes (`apps/web/src/components/app-command-surface.tsx:27-29`, `apps/web/src/features/settings/components/dialog.tsx:11-15`) — and preserves the deliberate discard-on-close of half-typed provider config, because `SettingsPanel` is still mounted only while open (`dialog.tsx:37-39`). Closing is `navigate(addressWithoutOverlay)`, always well defined; the reference had to guess with `useCanGoBack() ? history.back() : navigate('/')` precisely because it made settings a route.

### 1.1 Push vs replace, decided once by slot

The reference has the same logical diff toggle pushing from the panel rail (`routes/_chat.$environmentId.$threadId.tsx:196-214`) and replacing from the keyboard (`components/ChatView.tsx:1507-1517`). One rule here, keyed to the address slot, so two ways to reach the same place cannot disagree:

| slot      | fields                                                    | history                 |
| --------- | --------------------------------------------------------- | ----------------------- |
| workspace | slug                                                      | **push**                |
| mode      | `chat`/`workbench`                                        | **push**                |
| document  | active token                                              | **push**                |
| overlay   | `settings`                                                | **push**                |
| panel     | `side`, `bottom`, `tool`, `rail`, `scope`, `tabs` reorder | replace                 |
| filter    | `s.*`, `log.*`                                            | replace, trailing 500ms |
| focus     | `#L…`                                                     | replace                 |

Retention on a document change (the analogue of `retainSearchParams(['diff'])` at `refs/.../_chat.$environmentId.$threadId.tsx:279-285`): `side`, `bottom`, `tool`, `settings` are **retained**; `s.*`, `log.*` and the fragment are **dropped**. Switching files must not close the git sidebar and must not carry the previous file's line number.

### 1.2 Reserved pass-through (non-negotiable)

The serializer owns a fixed key set and copies every other search key through byte-for-byte. Four params are read _before React mounts_ and would die silently otherwise:

- `editorPerfTrace`, `editorPerfDisable`, `editorPerfLayout` — `installEditorPerformanceTraceFromUrl()` at `apps/web/src/main.tsx:21`, names at `apps/web/src/lib/editor-performance-trace.ts:67-69`, read again at `:100`, `:391`, `:407`.
- `decode` — `apps/web/src/features/editor/utils/decode-mode.ts:6-16`, read again at plugin-build time off `location.search` (`apps/web/src/features/editor/editor-plugins.ts:164`).

A round-trip test asserts `?decode=diffusion&editorPerfTrace=1&editorPerfDisable=x` survives encode → decode → encode unchanged. This is exactly the failure mode TanStack's strip-unvalidated-params default produces, and it is one reason the router is deferred to last.

### 1.3 Loop control

`history.pushState`/`replaceState` do not emit `popstate`. Driving `history` directly therefore gives **two inbound edges — boot and `popstate` — and one outbound edge**, structurally. There is no echo to guard against, so there is no `applying` flag, no rAF race, no StrictMode hazard. This is the single strongest reason not to install a `RouterProvider` on day one: a router re-renders on every `navigate()`, which turns the outbound write into an inbound apply and forces retention middleware to stop the bleeding.

The outbound writer coalesces to one write per frame and carries a rate budget: Safari throttles `replaceState` (~100 calls / 30s) and _throws_. On trip, the writer logs a wide event `address.projection_throttled{writes, windowMs}` and stops projecting until the next user-initiated navigation.

---

## 2. Address / preference / ephemeral

The load-bearing table. `features/address/utils/classification.ts` encodes it as data, with a test that fails when a new `platform.*` key or a new store appears unclassified.

### 2.1 ADDRESS — goes in the URL

| state                                                                                           | lives today                                                                                                               | in the address as                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `uiMode`                                                                                        | `platform.workspace-state.v16.uiMode` (`apps/web/src/lib/workspace-cache.ts:57`); type at `apps/web/src/lib/ui-mode.ts:1` | path segment 2 — **key deleted**                                          |
| `rootFolder.path`                                                                               | `…v16.rootFolder` (`workspace-cache.ts:56`)                                                                               | `~slug`; absolute path stays local                                        |
| `SessionSelection`                                                                              | `…v16.chatModeSelection`; store at `apps/web/src/features/chat-mode/state/session-selection-store.ts:44-67`               | `t/<id>` \| `t/new` \| absent — **key deleted, module-init read deleted** |
| rail `view` (`active`/`archived`)                                                               | in-memory, `session-rail-store.ts:33-44` ("a moment, not a preference")                                                   | `?rail=archived`                                                          |
| rail `scope` (`ProjectId \| null`)                                                              | in-memory, same store                                                                                                     | `?scope=all`                                                              |
| `chatModePanels.activeToolTab`                                                                  | `…v16.chatModePanels` (`apps/web/src/features/chat-mode/utils/panels.ts:10-14`)                                           | `?tool=`                                                                  |
| `workbenchPanels.activeSidebarTab`                                                              | per-project slice (`workspace-cache.ts:208-217`)                                                                          | `?side=`                                                                  |
| `workbenchPanels.activeBottomTab`                                                               | per-project slice                                                                                                         | `?bottom=`                                                                |
| `workbenchPanels.editorTabs` (order + identity)                                                 | per-project slice                                                                                                         | `?tabs=` when present; otherwise deferred to the slice                    |
| `workbenchPanels.activeEditorTabId`                                                             | per-project slice                                                                                                         | the path's document token (resolved to a tab by token, never by id)       |
| thread diff scope                                                                               | `platform.chat-thread-diff-scope.v1` (`thread-diff-scope-storage.ts:4`)                                                   | `?scope=wt` \| `?scope=turn-<id>` in chat mode                            |
| search `query`, `matchMode`, `caseSensitive`, `wholeWord`, `includeGlobText`, `excludeGlobText` | fused into `CachedSearchBufferState` (`workspace-cache.ts:77-96`)                                                         | `s.q s.m s.case s.word s.in s.x`                                          |
| `LogsFilterState` (`area level search slowMs source timeRange`)                                 | plain `useState`, survives nothing (`apps/web/src/features/logs/log-filter-params.ts:5-21`, `panel.tsx:24-26`)            | `log.*`                                                                   |
| `definitionTarget` `{path, range}`                                                              | in-memory (`apps/web/src/features/editor/state/editor-ui-state.tsx:16-20`)                                                | `#L…`                                                                     |
| settings section                                                                                | does not exist; `settingsOpen` boolean at `app-command-surface.tsx:22`                                                    | `?settings=`                                                              |
| snapshot / checkpoint / compare-saved / search-buffer document ids                              | encoded into `EditorTabRecord.path`                                                                                       | document tokens (§1)                                                      |

### 2.2 PREFERENCE — stays in localStorage, never in a URL

| state                                                                       | lives today                                                                              | why                                                                                                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workbenchLayout` pane percentages                                          | `…v16.workbenchLayout` (`apps/web/src/features/workbench/utils/workbench-layout.ts:1-5`) | its own doc says pane geometry is global; "a sidebar that changes width because they clicked a session in another project reads as a rendering bug" |
| chat-mode resizable group                                                   | `platform.resizable-layout.chat-mode` (`packages/ui/src/components/resizable.tsx:6-7`)   | second, unversioned geometry system                                                                                                                 |
| app theme                                                                   | the bare `theme` key (`apps/web/src/components/theme-provider.tsx:76`)                   | machine appearance; also the one key outside `platform.*`                                                                                           |
| editor syntax theme                                                         | `platform.editor-color-theme.v1`                                                         | machine appearance                                                                                                                                  |
| `wallpaperHidden`, `diffViewMode`                                           | `…v16.*`                                                                                 | global toggles; one link must not change how every later diff renders                                                                               |
| `sessionRailOpen`, `toolPaneOpen`                                           | `…v16.chatModePanels` (fused with `activeToolTab`)                                       | chrome, not identity — see §2.4                                                                                                                     |
| `collapsedProjectIds`                                                       | `platform.chat-rail-collapse.v1`                                                         | tidying                                                                                                                                             |
| search `collapsedPaths`, `queryHistory`, `replaceHistory`, `filtersVisible` | search buffer key                                                                        | tidying / history                                                                                                                                   |
| `scrollPositionByPath`                                                      | per-project slice                                                                        | remembered position ≠ addressed position                                                                                                            |
| `editorHistory`, `recentlyClosedEditorPaths`, `previousOpenEditorPath`      | slice + `editor-tab-paths.ts:39-66`                                                      | MRU stack, not a place                                                                                                                              |
| changed-files / work-log expansion, session read stamps                     | `platform.chat-changed-files-expansion.v1`, `platform.chat-session-reads.v1`, in-memory  | "have I read this" is a property of this browser                                                                                                    |
| git panel `panelOpen`, `sectionOpen`                                        | `apps/web/src/features/git/state.tsx:8-19`                                               | chrome                                                                                                                                              |
| workspace index / order                                                     | `…v16.workspaces` (`workspace-cache.ts:336-352`)                                         | the slug→root oracle, not an address                                                                                                                |
| file-tree expansion                                                         | inside the imperative `FileTree` model, unpersisted                                      | reconstructed per mount                                                                                                                             |

### 2.3 EPHEMERAL — never in a URL, and several never durable at all

| state                                                                                      | lives today                                                                   | why it is dangerous                                                                                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `useTerminalCommandInboxStore`                                                             | `apps/web/src/features/terminal/state/command-inbox-store.ts:3-38`            | `take`-once queue; a replayed URL **runs a shell command on load**                                       |
| `useComposerInboxStore`                                                                    | `apps/web/src/features/chat/state/composer-inbox-store.ts:9-44`               | same shape; **injects prompt text on load**                                                              |
| chat input drafts                                                                          | `platform.chat-input-drafts.v1`                                               | unsent text is the archetypal non-linkable state                                                         |
| prompt stash                                                                               | `platform:prompt-stash:v1` (colon namespacing stray — fix in M9)              | same                                                                                                     |
| git `commitMessage`; commit progress stdout                                                | `features/git/state.tsx:8-19`, `state/commit-progress-store.ts:14-30`         | a draft and a live stream                                                                                |
| search `replaceText`, `replaceVisible`                                                     | search buffer key                                                             | **a link that prefills a bulk-replace field is one click from data loss**                                |
| search `matches`, `totalCount`, `truncated`, `runId`, `activeResultId`, `pendingResultIds` | search buffer key                                                             | results, not address — they re-run                                                                       |
| session / project delete requests                                                          | `session-delete-request-store.ts`, `project-delete-request-store.ts`          | a link must never open a delete dialog                                                                   |
| `useSessionMultiSelectStore`                                                               | `session-multi-select-store.ts:10-16`                                         | its own doc: restoring a marked set "would arm a destructive action the user no longer remembers making" |
| rail `renaming`, rail `query`                                                              | `session-rail-store.ts:16-21`                                                 | transient typing                                                                                         |
| `useRailOrderStore`                                                                        | `rail-order-store.ts:10-38`                                                   | optimistic order the server has not confirmed                                                            |
| command palette open + its `>` `@` `:` `view ` `color ` `edt ` DSL                         | `app-command-surface.tsx:20-21`, `command-palette-utils.ts:237-265`           | an open menu is never a place; a finder's _result_ is the address                                        |
| chat optimistic / projection / sync / pagination / connection-generation stores            | `features/chat/state/*`                                                       | projected server truth                                                                                   |
| `focusStore.activeArea`, file-picker session                                               | `focus/providers/focus-state.ts:6-21`, `components/file-picker/state.ts:7-14` | keyboard routing                                                                                         |
| conflict diff documents + `editor-conflict-state`                                          | `conflict-diff-document.ts:3-27`, `editor-conflict-state.tsx:9-25`            | the record is born from a watcher event and cannot survive a reload                                      |
| `scrollPositionByTabId`                                                                    | `editor-document-state.tsx:24-27`                                             | in-memory mirror of a persisted map, keyed by a random id                                                |

### 2.4 Two fused types must be split

Both currently put ADDRESS, PREFERENCE and RESULTS behind one setter, which blocks lifting only the addressable part.

- `ChatModePanels` (`apps/web/src/features/chat-mode/utils/panels.ts:10-14`) fuses `activeToolTab` with `sessionRailOpen` / `toolPaneOpen`. Split so the tab leaves and the booleans stay. Note `showChatModeToolTab` (`:60-66`) _deliberately_ opens the pane as a side effect of selecting a tab — that behaviour is preserved, because restore goes through the domain action, not a raw setter. So `?tool=git` selects git and opens the pane, exactly as a click would, without `toolPaneOpen` ever being serialized.
- `CachedSearchBufferState` (`workspace-cache.ts:77-96`) fuses 6 address fields, 2 fifty-entry histories, and a materialized `matches` array. Split three ways.

---

## 3. The addressing problem, solved concretely

### 3.1 Editor tab ids — not addressed at all, and that is the fix

`createEditorTabRecord` mints `editor-tab:${crypto.randomUUID()}` with an explicit comment that ids must **not** be derivable, because a counter collided with restored ids (`apps/web/src/components/workspace/editor-tabs/utils/editor-tab-model.ts:38-48`). A UUID cannot appear in a shareable URL.

It doesn't have to. **The address names documents by token; tab ids stay internal React keys and dirty-close handles.** Restore matches a token against `editorTabs[].path` and selects the tab it finds.

That is lossless today, and here is the proof rather than the assumption: `openEditorPathInWorkbenchPanels` returns the _existing_ tab when the path is already open (`apps/web/src/features/workbench/utils/workbench-panels.ts:57-59`), and `splitTab: () => false` / `setActivePane: () => undefined` are stubs (`apps/web/src/features/editor/state/editor-commands.ts:121-122`). So the tab list is flat, single-pane and path-deduped, and `editorPathCountsForWorkbenchPanels` (`workbench-panels.ts:44-51`) — the helper usually cited as proof duplicates exist — can only ever return 0 or 1. Token → tab is 1:1.

Two hooks are reserved so the day splits land is not a retrofit: `|` separates panes inside `?tabs=`, and a `#2` occurrence suffix on a token disambiguates the *n*th tab holding the same document. Both are parsed today and rejected with a structured error until the features exist.

`scrollPositionByTabId` (`editor-document-state.tsx:24-27`) is unaffected — it is in-memory, seeded from the path-keyed persisted map, and never leaves the machine.

### 3.2 Absolute file paths — relativized at the site that already knows the root

Every persisted path is absolute: `editorTabs[].path`, `editorHistory`, `recentlyClosedEditorPaths`, `scrollPositionByPath`. `sliceForWorkspace` already filters all four by prefix-matching them against the root via `pathForWorkspace` (`apps/web/src/lib/workspace-cache.ts:484-521`). That filter is exactly where relativization belongs — it is a local refactor of code that already relates a path to its root, not a new subsystem.

In memory paths stay absolute (the file server wants absolute). Only the serialized form is relative. Bump `CACHE_VERSION` 16 → 17 (`workspace-cache.ts:41`) and let the mismatch drop old entries; the file's own policy sanctions it ("update deliberately or drop intentionally", `:39-42`) and the greenfield rule forbids a migration shim.

This one change also fixes the search buffer document for free: `search-buffer:${encodeURIComponent(rootPath)}` (`search-buffer-document.ts:10-12`) stops embedding the machine's path, because the workspace is already in the URL path and the token is just `s`.

### 3.3 Workspace identity — a slug, never a `ProjectId`, never an absolute path

`ProjectId` is `project-${stablePathHash(rootPath)}` — a one-way FNV-1a-32 over the **absolute** path (`apps/web/src/features/chat/lib/chat-command-builders.ts:482-484, :542-553`). It never appears in a URL. It is derived _after_ the slug resolves to a root.

Slug = the root's leaf directory name (`workspaceProjectTitle`, `chat-command-builders.ts:486-491`), suffixed with 4 hex of the same hash only when two remembered roots collide: `~platform`, `~platform-3f9c`.

Resolution at boot, in order, all synchronous except the last:

1. exact slug match in the workspace index — at most 8 roots, read from localStorage (`workspace-cache.ts:44-48, :336-352`);
2. unique basename match in that index (so `~platform` still resolves after a collision suffix was introduced);
3. unique basename match in the file server's recent directories (`apps/web/src/hooks/use-restore-recent-workspace-root.ts:17-38`);
4. otherwise the **unknown-workspace surface** (§5) — never the reference's permanent blank pane (`refs/.../_chat.$environmentId.$threadId.tsx:234-236`).

An explicit escape hatch `?root=<percent-encoded absolute path>` exists for bench scripts and for "open this exact folder"; it is consumed and stripped on apply, never re-emitted.

### 3.4 Diff documents — one portable, one machine-local, one reserved

Today a diff document id is `git-diff:v2:` + percent-encoded JSON (`snapshotDiffDocumentId`, `diff-document.ts:121-133`) — a realistic checkpoint measures ~622 characters with two dozen `%2F` sequences.

- **Snapshot diffs are genuinely portable.** The payload's `oldObjectId`/`newObjectId` are git blob hashes; they mean the same thing in any clone that has the objects. The token keeps only identity — source, both oids, relative path — and drops `status`, which the git status query re-derives for the icon anyway. ~100 chars instead of 622, with `/` as a real separator and no double-encoding hazard.
- **Checkpoint diffs are machine-local** because the payload carries a `ThreadId` (`diff-document.ts:31-42`). Recipients get an explicit panel (§5), not a spinner.
- **Branch diffs are reserved and currently unavailable.** The server route exists (`apps/server/src/git/routes.ts:48`, `worktrees.branchDiff` at `apps/server/src/git/worktrees.ts:98`) but nothing on the client renders it, which the codebase already states as the reason `branch` is deliberately not a `ThreadDiffScope` variant (`thread-diff-scope-storage.ts:14-18`). The parser accepts the token and returns `{status:'unavailable', reason:'branch diffs are not rendered yet'}`. When the surface lands, the URL form already exists.

Version-gating is the honest cost: `parseDiffDocumentId` rejects outright on `version !== 2` / `version !== 1` (`diff-document.ts:186, :200`). The compact grammar shrinks the blast radius — worktree/staged/snapshot tokens carry no version and are content-addressed — but `k/` tokens embed a schema. A grammar bump is a broken-link event, and the greenfield rule forbids the shim. The grammar has to be right roughly once.

### 3.5 Conflict diffs — deliberately not addressable, reusing the existing predicate

`pathForWorkspace` already returns `false` for conflict documents so they are never persisted (`workspace-cache.ts:516-519`, calling `parseConflictDiffDocumentId`). The conflict record is born from a filesystem watcher event and holds `localText`/`remoteText` snapshots in memory (`apps/web/src/features/editor/state/editor-conflict-state.tsx:9-25`); it cannot survive a reload, let alone a machine.

The address encoder **calls the same predicate**. One exclusion rule, one place, reused rather than re-derived. This is the existing precedent for "some tabs are not addressable" and it is what makes the deny-list structural: a document with no token cannot be encoded, so the encoder cannot leak it by accident.

### 3.6 Terminal — nothing to address

There is exactly one terminal per surface, `sessionId='terminal-1'` hardcoded at both mount sites (`apps/web/src/features/workbench/components/bottom-panel.tsx:49`, `apps/web/src/features/chat-mode/components/tool-pane.tsx:82`), and the socket is keyed `(rootPath, sessionId)` (`apps/web/src/features/terminal/terminal-panel.tsx:60`). The complete address is `?bottom=terminal` / `?tool=terminal`. There is no id to leak.

If multiple terminals ever land, the id must be a per-root ordinal, not a UUID, or it inherits the tab-id problem.

### 3.7 Thread ids — machine-local, and the UI says so

`ThreadId` is `thread-${crypto.randomUUID()}` minted client-side into the local server's SQLite (`chat-command-builders.ts:511-513`). It is stable across reloads and second windows on one machine and meaningless anywhere else. Thread links are **this-machine links** until sessions sync, and §5 makes the recipient's experience explicit rather than pretending otherwise.

### 3.8 Two "which thread" states — the address names only one

Chat mode has `session-selection-store`; the workbench sidebar's chat tab has its own unpersisted `useActiveChatThreadId` (`apps/web/src/features/chat/hooks/use-active-chat-thread-id.ts:4-10`). **The address names chat mode's thread only.** `/~platform/workbench?side=chat` names the panel, not a thread. Unifying the two is a real change with its own design and must not be smuggled into the address layer.

---

## 4. Milestones

Each ships alone, each is revertible, each has a user-visible exit. Foundations first; the largest change is last on purpose because everything before it de-risks it.

### M1 — Workspace-relative paths and workspace slugs

`features/address/utils/slug.ts` (slug derivation, collision suffix, the four-step resolver) plus relativization inside `sliceForWorkspace` / `pathForWorkspace` (`workspace-cache.ts:484-521`). `CACHE_VERSION` 16 → 17. No URL, no router, no new dependency.

**Done when** a user can open the workspace switcher and pick a project by its short name instead of an absolute path, and remembered tabs survive that switch unchanged.

### M2 — The `Address` value and the grammar, with no URL

- `features/address/utils/grammar.ts` — `parseAddress(href): Address`, `serializeAddress(Address): {pathname, search, hash}`. `Address` is a valibot `strictObject`: nothing outside the schema can be written. This is the whitelist that makes §2.3 structural.
- `features/address/utils/document-token.ts` — the one place document kinds are encoded, a single discriminated switch calling the parsers that already exist in each feature (`parseDiffDocumentId`, `parseSearchBufferDocumentId`, `parseCompareSavedDocumentId`, `parseConflictDiffDocumentId`). This is the _only_ polymorphism in the design; everything else is a named field. Six kinds today, arrived one at a time, and the tab set is a heterogeneous list — that is where a table earns itself and nowhere else.
- `features/address/utils/classification.ts` — the §2 table as data, plus a test that fails on an unclassified `platform.*` key or store module.
- `features/address/utils/snapshot.ts` — `AddressSnapshot`, a narrow hand-written record. The encoder takes this, not a store. `useComposerInboxStore` is not importable from here.
- A palette command `workspace.copyAddress`.

Round-trip property tests in the `node` project, fuzzed over generated paths: `serialize(parse(u))` reaches a fixed point after one round; a 622-char checkpoint id collapses to ~100; `?decode=diffusion&editorPerfTrace=1` survives; a conflict document produces no token.

**Done when** a user can hit `Copy address` in the command palette and paste a short, human-readable string naming their project, mode and open file into a bug report — with no absolute paths in it.

### M3 — Read-only projection

`features/address/state/projection.ts` (a factory over an injected `History`-like object, so `node` tests drive it with a stub) and `features/address/hooks/use-projection.ts`, mounted once in `app-runtime-content.tsx` alongside `useWorkspaceCachePersistence`. Store → URL, `replaceState` only, rate-budgeted. **Nothing reads the URL.**

Structurally unbreakable, and useful before any link works: `apps/web/scripts/bench-workspace.mjs:8` seeds `platform.workspace-state.v14` against a v16 app, so its fixtures have been silently discarded by schema validation for two versions. Bench seeding moves to URLs and becomes self-verifying.

**Done when** a user can glance at the address bar and see where they are, and reloading behaves exactly as before.

### M4 — Boot restore, and the address becomes load-bearing

Add the single inbound edge at boot. This is the milestone that turns the projection from decoration into infrastructure.

```
location.pathname !== '/'  → the URL wins for every field it names (sparse overlay)
location.pathname === '/'  → read platform.address.v1 and history.replaceState to it
                             before the app renders; then proceed as above
```

`uiMode` and `chatModeSelection` lose their own cache keys and are restored _through_ `parseAddress`. `session-selection-store`'s module-init read and its write-on-every-change subscription are deleted in this commit — the store's own comment says "a selection restored one frame late is a selection the auto-pick has already overwritten" (`workspace-cache.ts:290-300`), and two writers on the same frame is the bug that comment says was already fixed once.

Restore goes through **domain actions, never raw setters** — `useOpenWorkspaceRoot()` (`apps/web/src/hooks/use-open-workspace-root.ts:31-74`), `showChatModeToolTab`, `openEditorPathInWorkbenchPanels`, `selectSession` — in slot order `workspace → mode → document → panel → overlay → focus`. Three consequences: the URL cannot express invalid state; the deterministic order removes the palette's existing ordering hack ("the stage that will show this session has to exist before the pick lands", `command-palette/content.tsx:170-176`); and the applier **inherits the supersede protocol** rather than competing with it. `isActiveWorkspaceRoot` (`active-project-store.ts:28-30`) stays and remains the single arbiter of which project switch won. Two supersede protocols would be exactly the two-epicycle situation CLAUDE.md forbids.

Restore returns three states, lifted from `activeSession` (`apps/web/src/features/chat-mode/utils/active-session.ts:9-16`, whose doc says collapsing them "is what makes a deleted session look like an app that hung"): `applied` / `pending(reason)` / `unavailable(reason)`.

`use-validate-root-folder.ts` currently calls `clearRootFolder()` when a restored root fails its stat. Under this design, clearing state while the address still names the folder is exactly the divergence the layer exists to prevent: it must navigate to `/~-` and surface why.

**Done when** a user can paste a link to a file in a project into a fresh browser tab and land on that file, in that project, at that line — and a desktop launch is byte-for-byte what it is today, because the desktop always gets `/`.

### M5 — Chat addresses

Three token shapes for the three `SessionSelection` variants, plus `?rail=`, `?scope=`, `?tool=`, and the thread diff scope. Split `ChatModePanels` (§2.4). `useThreadDiffScopeStore` is kept only as the memory that picks the _initial_ address when you click into a thread; once you are in one, the address is authoritative.

Add the `projectionHydrated` gate: `restored` is computed at store construction (`session-selection-store.ts:49`), so a URL-supplied thread is `restored` by definition and would return `missing` before the projection loads. Treat `restored && !hydrated` as `resolving`. The projection cache is painted from localStorage before connect (`chat-projection-cache.ts:26`), so on the same machine the window is near-zero — but not zero, and the five-state union exists precisely for this.

**Done when** a user can paste a chat-thread link and land on that conversation, and gets a clear "this thread is not on this machine" panel when they paste someone else's.

### M6 — Panels and the settings overlay

`?side`, `?bottom`, `?settings=`. Cheap single fields that exercise the retention rule before anything expensive depends on it. Settings v1 scrolls to the named section within the existing single-scroll panel — a small real addition, not free.

**Done when** a user can send a teammate a link that opens the git sidebar, or the providers settings page, over whatever that teammate had open.

### M7 — Logs, then search

Logs first: it persists nothing today, so there is no storage to delete and the feature strictly gains. `LogTimeRange` (`log-filter-params.ts:3`) is widened with an absolute variant; the UI writes the relative `since=6h` because that is the control the user touched, and **Copy link rewrites it to `log.from`/`log.to` absolutes at copy time**. Live URLs track the control; shared URLs freeze. Search second: split `CachedSearchBufferState` three ways; the URL carries query + flags + globs, results re-run, `replaceText` never serializes.

**Done when** a user can send "here are the errors in git over the last six hours" or "search the repo for this, regex, excluding tests" as a link.

### M8 — History, the keymap, and the command palette

This is where push navigation and `popstate` land, and it **must carry three fixes or it is a regression**.

1. **`Mod+[` / `Mod+]` become explicit app bindings.** They are bound as _editor_ commands (`apps/web/src/keymap/default-bindings.ts:325-326`) and filtered out of the document listener by `isAppKeyBinding` (`apps/web/src/keymap/use-app-keymap.ts:53-56, :68-70`), so in the file tree, terminal, git panel and chat rail they already reach the browser untouched — harmless only while there is no history to walk. Same for the mouse back button and trackpad swipe-back.
2. **The unsaved-work guard's comment becomes false.** `use-unsaved-work-guard.ts:4-8` states its enumeration is complete ("the only remaining way to lose unsaved edits is to close the tab or reload... the only one left"), and `beforeunload` cannot observe a `popstate`. A `popstate` whose `tabs=` would drop dirty buffers returns `{status:'pending'}` and raises the existing `useDirtyTabCloseRequest` dialog; the address stays uncommitted until resolved. `popstate` cannot be cancelled, so this is push-a-sentinel-and-restore. The comment is corrected in the same commit.
3. **The workspace segment re-points, never re-keys.** Project switching is a park/restore swap inside one live store (`editor-workspace-state.tsx:126-155`, `editor-commands.ts:222-250`) and `parkedWorkspaces` holds unsaved buffers for projects that are not open. A keyed remount destroys them silently. No `key={slug}` on any workspace-scoped subtree, ever.

**Keymap.** `workspaceCommandHandlers` (`apps/web/src/keymap/commands.ts:186-380`) converts one handler at a time. `dispatchWorkspaceCommand` keeps its boolean return and the `handled` field on the `workspace.command` wide event (`:160-175`) — `navigateAddress(next)` validates and applies synchronously and returns a boolean, because there is no router promise in the way. This is a concrete advantage of the transport choice: the palette's close policy (`content.tsx:144, :157, :188, :200`, which stays open on `handled === false`) needs no redesign.

**Command palette.** Rows stay `CommandItem onSelect`; nothing becomes an `<a>`. The reference used `<Link>` exactly once in its entire app (`refs/.../components/Sidebar.tsx:2394`) — this is a desktop-shaped UI, not a hypertext one. Three changes: `selectSession` drops its mode-first dispatch and issues one address; `openSessionRow`'s mount-scoped `setSessionProjectOpener` indirection (`session-commands.ts:24-50`) becomes a plain module function, since the reconciler runs outside React; and row context menus gain `Copy address`.

`workspace.quickOpenPreviousEditor` is **kept**, against the codec design's recommendation to delete it. MRU-previous-editor and chronological back are genuinely different orderings and both are useful — VS Code ships both. `recentlyClosedEditorPaths` stays too; resurrecting a closed tab is a different operation from navigating.

**Done when** a user can press `Cmd+[` anywhere in the app and go back to the previous document, with a save prompt if that would drop unsaved work.

### M9 — Tab sets, and cleaning up the cache

`?tabs=` with the 1500-char cap: over budget, `tabs` is **dropped entirely and never truncated** — a partial tab set would delete tabs on apply — with a wide event `address.tabs_omitted{tabCount, bytes}`. The path still names the active document, so the link degrades to something useful. Tab drag-reorder holds the order locally for the gesture and commits one `replace` on drop, the same shape as `useRailOrderStore` (`rail-order-store.ts:10-38`).

Also: remove the now-dead `uiMode` and `chatModeSelection` global keys, bump `CACHE_VERSION` again, and fix the two namespacing strays while the file is open — the bare `theme` key (`theme-provider.tsx:76`) and `platform:prompt-stash:v1` (`prompt-stash-store.ts:11`).

**Done when** a user can send a link that opens their whole tab layout — files, a diff, and the search buffer — on someone else's machine with the same repo.

### M10 — Optional: adopt a router as the transport

By now the grammar is proven and the swap is confined to one module. Take TanStack Router for `useBlocker` and the injectable-history test story, or decline it. `createBrowserHistory` in both shells; do **not** copy the reference's `isElectron ? createHashHistory()` (`refs/.../main.tsx:14-17`) — its Electron shell is file-backed, ours loads `http://127.0.0.1:5173` (`apps/desktop/src/bun/index.ts:31-33, :132-154`) and pushState works normally. If adopted, the root route must declare the four dev params (§1.2) or they die silently.

The honest framing: if M1–M4 ship and nobody uses the address bar outside browser dev, **stop**. The correct answer was a serializer, and M1–M4 are the cheap way to find that out.

---

## 5. Stale and invalid links

Every case gets a screen. The rule inherited from `activeSession` is that "still arriving" and "not here" must never render the same way.

| link                                                                             | what happens                                                                | what the user sees                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **deleted thread** — `/~platform/chat/t/thread-…` for a thread that existed here | projection hydrated + thread unknown → `unavailable`                        | The rail and composer render normally; the stage shows "This conversation was deleted." with _Start a new conversation_. Never a spinner, never a silent fall-through to the newest thread.                                                                                                                                                                                         |
| **thread still arriving** — same URL, cold load, projection not hydrated         | `pending`                                                                   | Stage skeleton with the rail already live. Near-zero on the same machine because the projection cache paints from localStorage before connect (`chat-projection-cache.ts:26`).                                                                                                                                                                                                      |
| **missing file** — `f/apps/web/src/gone.ts`                                      | root resolves, `statPath` fails                                             | The workspace opens fully, the tab strip appears, and the editor pane shows "`apps/web/src/gone.ts` isn't in this workspace." with _Search for it_ (prefilled) and _Close tab_. Other tabs from `?tabs=` still open.                                                                                                                                                                |
| **unknown project** — `~someone-elses-repo`                                      | all four resolution steps fail                                              | Full-screen: "No workspace named **someone-elses-repo** on this machine." Lists the remembered workspaces as buttons, plus _Choose a folder…_ which prefills the picker. This is deliberately the surface the reference never wrote — its equivalent is a permanent blank pane behind `bootstrapComplete: false` (`refs/.../_chat.$environmentId.$threadId.tsx:217-219, :234-236`). |
| **ambiguous slug** — two remembered roots basename `platform`                    | step 2 finds >1                                                             | Same screen, narrowed: "Two workspaces are named platform" with both absolute paths as buttons.                                                                                                                                                                                                                                                                                     |
| **link from another machine, file part**                                         | works                                                                       | Slugs resolve locally and paths are repo-relative, so a file/diff/search link opens correctly on any machine with the same repo checked out anywhere. This is the payoff of M1.                                                                                                                                                                                                     |
| **link from another machine, thread part**                                       | `unavailable`                                                               | "This conversation lives on another machine." — explicitly different copy from "deleted", because `ThreadId` is a client-minted UUID in local SQLite (`chat-command-builders.ts:511-513`) and every cross-machine thread link is dead by construction. Getting this wrong makes every shared link read as a bug.                                                                    |
| **snapshot diff, objects not fetched**                                           | git blob lookup 404s                                                        | "This diff references objects your clone doesn't have." with _Fetch and retry_. The oids are content hashes, so the link becomes valid after a fetch — the one address that heals.                                                                                                                                                                                                  |
| **checkpoint diff from another machine**                                         | thread unknown                                                              | Same panel as the thread case; the `k/` token carries a `ThreadId`.                                                                                                                                                                                                                                                                                                                 |
| **branch diff** — `d/branch/main...feature`                                      | parser returns `unavailable`                                                | "Branch diffs aren't rendered yet." The server route exists (`apps/server/src/git/routes.ts:48`); the client surface does not (`thread-diff-scope-storage.ts:14-18`).                                                                                                                                                                                                               |
| **conflict document in a URL**                                                   | no token can encode one; a hand-typed `conflict-*` fails `pathForWorkspace` | The document is dropped from the address and the rest applies. No error toast — it is a malformed address, not a user mistake.                                                                                                                                                                                                                                                      |
| **stale grammar** (`k/` after a version bump)                                    | token parses to `null`                                                      | That one tab is dropped; everything else in the link applies. Every existing parser returns `null` rather than throwing (`diff-document.ts:62-69, :186, :200`), so the address layer logs `address.token_rejected{token, reason}` — otherwise the failure is a blank tab with no error and no log.                                                                                  |
| **`?tabs=` would drop dirty buffers**                                            | `pending`                                                                   | The existing dirty-tab dialog; the address does not commit until resolved.                                                                                                                                                                                                                                                                                                          |
| **garbage** — `/~platform/wrkbnch/f/x`                                           | unknown mode                                                                | Falls back to the remembered mode for that workspace and applies the rest; the URL is re-canonicalized on the next frame so it stops lying. The URL is untrusted input parsed by a normalizing parser, never a schema that throws — the same posture as `parseDiffRouteSearch` in the reference (`refs/.../diffRouteSearch.ts:9-39`).                                               |

---

## 6. Testing

### `apps/web/test/render.tsx` — unchanged

This is the headline, and it is the main practical reason this design beats URL-as-truth. No component calls a URL hook. Components keep reading the stores they read today; the address layer restores _into_ those stores. So the provider stack at `apps/web/test/render.tsx:34-45` (QueryClient → Theme → EditorColorTheme → MenuCommand → Tooltip) gains nothing, and the **45 source files importing `renderWithProviders` are untouched**. Compare the reference, where five unrelated non-route components read `useParams({strict:false, select})` (`Sidebar.tsx:2734`, `CommandPalette.tsx:148`, `toast.tsx:345`, `DiffPanel.tsx:180`, `useHandleNewThread.ts:151`) — porting that shape takes the whole suite onto a router in one commit.

Fixture-store tests keep working for the same reason. `app-titlebar.test.tsx:33-45` overrides `EditorWorkspaceStateContext` with `createEditorWorkspaceStore({...})`; that store is still the source of truth, so nothing there changes.

### What is added

- **`apps/web/src/features/address/tests/` in the `node` project.** Pure functions, no DOM, no `--bun` gotchas. Round-trip fixed-point property tests over generated addresses (fuzzed paths including `~`, `..`, spaces, unicode, and `#`); dev-param pass-through; the 622 → ~100 char assertion on a real checkpoint payload; a golden-file test pinning the exact emitted key set for search and logs, so a careless spread cannot leak a 50-entry `queryHistory` or a materialized `matches` array; and the classification test that fails on an unclassified `platform.*` key or store module.
- **`apps/web/test/address.ts`** — one helper, `withAddress(href, fn)`, that stubs the injected history. Used only by the handful of tests that exercise restore.
- **Restore tests in the `dom` project** mount the real domain actions against real stores through `renderWithProviders`, with the stub history — no router, no memory history, no `viteEnvironment` change. Cases: unknown slug, dead thread, missing file, dirty-tab block, sparse overlay preserving the remembered sidebar.
- **Projection tests** drive the store subscription against the stub history and assert one write per frame plus the throttle degradation path.

### What does not get tested where you would expect

The `browser` project hangs at the RUN banner even for trivial tests, so real end-to-end address verification goes through Playwright against the running dev server at `:5173` — the same route already used for shell-proof and tiling verification. Two flows are worth pinning there: paste a deep link into a fresh tab and land correctly; and `Cmd+[` from the file tree walking history without triggering browser back.

### Fixtures that must be fixed

`apps/web/scripts/bench-workspace.mjs:8` seeds `platform.workspace-state.v14` against an app at v16, so its seeds are already being silently discarded by schema validation. From M3 it seeds by navigating to a URL and becomes self-verifying — which is a real argument for this work that has nothing to do with sharing links.

---

## 7. What we deliberately will not make linkable

| not linkable                                                                                           | why                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Terminal and composer inbox queues** (`command-inbox-store.ts:3-38`, `composer-inbox-store.ts:9-44`) | These are `take`-once queues. A URL that replayed one would **execute a shell command or inject prompt text on page load.** The sharpest case in the app, and the reason the deny-list is structural (a whitelist schema plus an `AddressSnapshot` the store is not reachable from) rather than a comment.                                                                                                        |
| **`replaceText` / `replaceVisible`** in the search buffer                                              | A link that prefills a bulk-replace field is one click from data loss. The query is addressable; the replacement never is.                                                                                                                                                                                                                                                                                        |
| **Chat input drafts and the prompt stash**                                                             | Unsent text is the archetypal non-linkable state.                                                                                                                                                                                                                                                                                                                                                                 |
| **`commitMessage`** and live commit hook output                                                        | A draft and a stream.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Delete-confirmation requests and multi-select sets**                                                 | A link must never open a delete dialog or re-arm a bulk action. `session-multi-select-store.ts` says it in its own doc: it "would arm a destructive action the user no longer remembers making."                                                                                                                                                                                                                  |
| **Pane percentages** — both `workbenchLayout` and `platform.resizable-layout.chat-mode`                | The workbench layout's own comment has the right principle: "a sidebar that changes width because they clicked a session in another project reads as a rendering bug." A link must never resize your window.                                                                                                                                                                                                      |
| **App theme, editor syntax theme, `wallpaperHidden`, `diffViewMode`**                                  | Machine appearance. `diffViewMode` is the closest call — split-vs-stacked genuinely changes how a diff reads — but it is global and keyboard-toggled, so one link would silently change how every _later_ diff renders too. Preference wins.                                                                                                                                                                      |
| **`sessionRailOpen` / `toolPaneOpen`**                                                                 | Chrome. They still _move_ when a link selects a tool tab, because `showChatModeToolTab` opens the pane as a documented side effect (`panels.ts:60-66`) — the same thing a click does. They are never serialized.                                                                                                                                                                                                  |
| **Scroll positions, editor MRU history, recently-closed paths**                                        | Where you were is not where the link points. Three orthogonal notions of "position" already exist (`scrollPositionByPath`, `scrollPositionByTabId`, and now `#L…`); adding a fourth to the URL would guarantee they disagree.                                                                                                                                                                                     |
| **Expansion maps and read stamps**                                                                     | `session-read-store` documents "have I read this" as a property of this browser with no server opinion.                                                                                                                                                                                                                                                                                                           |
| **Conflict diff documents**                                                                            | The record cannot survive a reload. `pathForWorkspace` already refuses to persist them (`workspace-cache.ts:516-519`) and the encoder reuses that exact predicate.                                                                                                                                                                                                                                                |
| **Command palette open state and its `>` `@` `:` search DSL**                                          | An open menu is never a place. Quick-open, go-to-symbol and go-to-line are _finders_; the addressable thing is the result (a file at a line), not the finder.                                                                                                                                                                                                                                                     |
| **Settings as a path**                                                                                 | Addressable as `?settings=`, never as `/settings`. A real route unmounts the workspace behind it, killing live terminal sockets and editor DOM, and forces the reference's guess-the-exit problem (`refs/.../routes/settings.tsx:40-46`). An overlay closes to a known base address, works at `/~-` with no folder open, and preserves the deliberate discard of half-typed provider config (`dialog.tsx:37-39`). |
| **The workbench sidebar's own thread pick** (`use-active-chat-thread-id.ts:4-10`)                      | There are two answers to "which thread" and unifying them is a separate change. Addressing both would make `t/` ambiguous about which surface it targets.                                                                                                                                                                                                                                                         |

---

## 8. Honest residue

Three things this design does not solve, stated so nobody has to discover them:

1. **It is still a projection, and projections can drift.** The mitigations are real but not a compiler: a `strictObject` whitelist, a narrow `AddressSnapshot` the dangerous stores are not reachable from, a fixed-point property test, a classification test — and, decisively, the fact that `uiMode`, the session selection and the focus position are restored _only_ through the address, so an encoder bug breaks reload on the author's machine within one dev session. What it cannot catch is a fourth code path that sets `activeSidebarTab` and forgets the layer. That produces a URL that lies while the app keeps working.

2. **The most valuable links are the least portable.** A file, a search and a snapshot diff travel between machines. A chat thread and a checkpoint diff do not, because both embed a client-minted UUID from local SQLite. That is the content people will most want to send, and the fix is session sync, not addressing.

3. **On the desktop shell, none of this is visible.** The window has no address bar and always launches at `/` (`apps/desktop/src/bun/index.ts:132-154`). The address layer's value there is durable restore as one atomic string instead of a race between independently-persisted fields, plus `Cmd+[` actually meaning something. That is worth M1–M4 and M8. It is not obviously worth M9. The plan is ordered so that judgement can be made with evidence instead of in advance.
