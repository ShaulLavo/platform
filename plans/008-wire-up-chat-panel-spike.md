# Plan 008 (SPIKE): Wire the built-but-unmounted chat feature into the workbench

> **Executor instructions**: This is a **spike / design plan**, not a
> build-everything plan. Your job is to (a) get the existing chat UI to actually
> render in the workbench through the smallest honest change, and (b) write down
> what is still missing. Follow the steps, run the verification commands, and if
> you hit any "STOP conditions" stop and report — do **not** start building chat
> backend or new providers. When done, update the status row in
> `plans/README.md` and leave the design notes file described in Step 5.
>
> **Drift check (run first)**: `git diff --stat 445a97d..HEAD -- apps/web/src/features/chat apps/web/src/features/workbench/components/sidebar-panel.tsx apps/web/src/features/workbench/components/tool-pane-header.tsx apps/web/src/features/workbench/utils/workbench-panels.ts`
> If the chat feature or the sidebar wiring changed since this plan was written,
> re-read the live code before proceeding.

## Status

- **Priority**: P3 (maintainer-directed; this is product direction, not a defect)
- **Effort**: M (spike — bounded by the STOP conditions, not by "make chat fully work")
- **Risk**: MED (mounting a never-rendered feature can surface missing providers/backend)
- **Depends on**: none. Note it interacts with plan 005 (the chat input uses `lexical`/`@lexical/react`, which 005 must keep).
- **Category**: direction
- **Planned at**: commit `445a97d`, 2026-06-18

## Why this matters

`apps/web/src/features/chat/` is a complete, recently-developed feature — ~34
components, hooks, a projection store, a local chat environment, and a
lexical-based input editor — wired to a full server-side orchestration / codex
provider stack (`apps/server/src/orchestration`, `apps/server/src/provider`).
But **nothing in the app renders it.** `knip` reports the entire chat component
tree as "unused files," and the only thing referencing chat outside its own
folder is a test type-import plus a `'chat'` tab icon/label already present in
`tool-pane-header.tsx` (`:19,:146,:157`). The `@lexical/react`, `lexical`, and
`@singapor/diff` dependencies show up as "unused" purely because this feature is
inert.

For a coding-agent platform this is plausibly the headline feature, parked
mid-integration. The maintainer has asked to wire it up. The goal of this spike
is a **minimal, real mount** plus a clear-eyed note on what remains — so the
decision to finish it or shelve it is made on evidence, not on a knip report that
makes a deliberate WIP look like dead code.

## Current state

- **Entry component** — `apps/web/src/features/chat/components/chat-side-panel.tsx:16`:

  ```tsx
  export const ChatSidePanel = memo(({ rootPath }: { rootPath: string }) => { ... })
  ```

  It is self-contained: it builds its own environment (`createLocalChatEnvironment()`), subscribes to the chat shell, manages threads from the projection store, and renders `ChatPanelHeader` + (`ChatView` | `ChatDraftView`) + `ChatPanelStatus`. **The only prop it needs is `rootPath`.**

- **Where sidebar content is chosen** — `apps/web/src/features/workbench/components/sidebar-panel.tsx`:
  - Tab type: `WorkbenchSidebarTab = 'files' | 'git' | 'search'` (defined in `workbench-panels.ts:6`).
  - Nav buttons for files/git/search at `:44-61`.
  - Content switch `renderSidebarPanel` at `:105-121` returns `GitChangesPanel` / `SearchPane` / `FileNavigatorPanel`.
  - `focusAreaForSidebarTab` at `:123` maps tab → focus area.

- **The tool-pane header already knows about chat** — `tool-pane-header.tsx`:
  - `ToolPaneHeaderTab = 'chat' | 'files' | 'git' | 'logs' | 'search'` (`:19`)
  - `panelTabTitle`/`toolPaneHeaderIcon` already handle `'chat'` (`:146,:157`, `ChatCircleIcon`).
    So the header vocabulary is ahead of the panel-state model (`WorkbenchSidebarTab` lacks `'chat'` and `'logs'`). That mismatch is the seam to close.

- **Provider context**: the app's provider stack is mirrored by `apps/web/test/render.tsx` (`renderWithProviders`, per AGENTS.md) and the real one is in `apps/web/src/main.tsx`. The chat store (`useChatProjectionStore`) is a module-level zustand store; chat also uses TanStack Query. Confirm in Step 1 which providers chat needs and that they already wrap the workbench.

- **Backend reality check**: chat talks to the server orchestration/provider stack. Whether a usable provider is configured in dev (real codex binary vs `MockProviderAdapter`) and what env it needs is exactly the kind of thing this spike must _discover and document_, not assume.

## Commands you will need

| Purpose       | Command                                                                              | Expected                  |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------- |
| Typecheck web | `bun run --filter web typecheck` (repo root)                                         | exit 0                    |
| Lint web      | `bun run --filter web lint` (repo root)                                              | exit 0                    |
| Web tests     | `bun run --filter web test` (repo root)                                              | exit 0                    |
| Re-run knip   | `bunx knip --no-config-hints` (repo root)                                            | fewer chat "unused files" |
| Dev server    | Already running — do **not** start your own (AGENTS.md). Verify in the existing one. |

Run from `/Users/shaul/Desktop/D/platform`.

## Suggested executor toolkit

- The dev server is always running; use it to confirm the panel renders (per AGENTS.md "Dev Server"). If a browser-driving tool (Playwright MCP) is available, navigate to the app and select the chat tab; otherwise inspect via the running app and report what you observed.
- AGENTS.md styling rules apply to any markup you add (theme tokens only, compose `@workspace/ui` primitives, no raw palette colors). The existing chat components are your style reference.

## Scope

**In scope** (minimal mount — the sidebar-tab route is the recommended MVP because the entry component is literally `ChatSidePanel` and the header already has the affordance):

- `apps/web/src/features/workbench/utils/workbench-panels.ts` — add `'chat'` to `WorkbenchSidebarTab` (and handle it in `normalizeWorkbenchPanels` only if needed).
- `apps/web/src/features/workbench/components/sidebar-panel.tsx` — add a chat nav button and a `renderSidebarPanel` branch returning `<ChatSidePanel rootPath={rootPath} />`; add a `focusAreaForSidebarTab` case.
- A new design-notes file: `docs/chat-wiring-notes.md` (Step 5).

**Out of scope** (STOP rather than entering these):

- Any change under `apps/server/` (backend, providers, orchestration). If chat needs a backend change to render, that is a finding, not this spike's work.
- Adding new React providers/context to `main.tsx`. If chat needs a provider the workbench doesn't already have, STOP and report it as a prerequisite.
- Deleting any chat component, hook, or dependency. (Several "unused" files become used once `ChatSidePanel` mounts; deciding what is _still_ dead is Step 5's output, not an action here.)
- Building new chat functionality, fixing chat UX, or restyling chat.
- Plan 005's dependency work — leave `lexical`/`@lexical/react`/`@singapor/diff` alone.

## Git workflow

- **Work directly on `main`. Do NOT create a branch, worktree, or PR.** (Operator rule: everything happens on `main`.)
- Commit style: conventional commits — e.g. `feat(workbench): mount chat side panel`. **Only commit if the operator asked; otherwise leave for review.**
- Do NOT push.

## Steps

### Step 1: Confirm the feature is type-valid and inventory its mount requirements

1. `bun run --filter web typecheck` → record whether it is already green (it builds all files, so chat is type-checked even while unmounted).
2. Read `chat-side-panel.tsx` and the hooks it imports (`use-active-chat-thread-id`, `use-chat-shell-subscription`, `use-workspace-chat-project`) and `createLocalChatEnvironment`. List every external dependency it needs at mount: which stores, which TanStack Query client, any context/provider.
3. Cross-check those providers against `apps/web/src/main.tsx` (the real provider stack). Confirm each one already wraps the workbench.

**Verify**: typecheck is green and you have a written list of mount requirements. If a required provider is **not** in `main.tsx`, STOP and report (do not add it) — that is a prerequisite decision for the maintainer.

### Step 2: Add `'chat'` to the sidebar tab model

In `workbench-panels.ts`, extend `WorkbenchSidebarTab` to include `'chat'`. Check whether `normalizeWorkbenchPanels` or any exhaustive switch on the tab needs a new branch (TypeScript will tell you via `bun run --filter web typecheck`).

**Verify**: `bun run --filter web typecheck` → exit 0 (or a small, finite list of `WorkbenchSidebarTab` exhaustiveness errors you then resolve in step 3).

### Step 3: Render `ChatSidePanel` from the sidebar

In `sidebar-panel.tsx`:

- Add a chat nav button (use `ChatCircleIcon` from `@phosphor-icons/react`, matching the existing `sidebarTabButton` calls and the icon already used in `tool-pane-header.tsx`).
- Add a branch to `renderSidebarPanel`: `if (tab === 'chat') return <ChatSidePanel rootPath={rootPath} />` (import from `@/features/chat/components/chat-side-panel`).
- Add a `focusAreaForSidebarTab` case for `'chat'` (reuse an existing focus area if there is no chat-specific one; note the choice).

**Verify**: `bun run --filter web typecheck && bun run --filter web lint` → exit 0.

### Step 4: Confirm it actually renders

Using the **already-running** dev server, select the new chat tab and observe.

**Verify**: the chat panel mounts and renders its header + draft/empty state without a runtime crash (check the browser console and `logs/` for errors — AGENTS.md: check the logs). Record what you see: does it render an empty/draft state, does it list threads, does it error on a missing backend? A clean empty render is success for this spike. If it throws on mount, capture the error and go to Step 5 (this is data, not a failure of the spike). If the crash is due to a missing provider or backend route, STOP and report it as a prerequisite.

### Step 5: Write the design note

Create `docs/chat-wiring-notes.md` capturing the spike's findings:

- What was mounted and where (the sidebar-tab MVP), and the alternative placements considered (dedicated right-hand panel; bottom tab) with a one-line trade-off each.
- The mount-requirement inventory from Step 1.
- Backend prerequisites discovered in Step 4: does chat need the orchestration server running, a configured provider (real codex binary vs `MockProviderAdapter`), specific env vars? Reference `.env.example` and the server provider code by path.
- Re-run `bunx knip --no-config-hints` and record which chat files are now used vs **still** unused after the mount — that is the real "delete vs keep" list for a future cleanup plan (do not delete here).
- A recommendation: finish wiring (and the next concrete steps) vs shelve.

**Verify**: `docs/chat-wiring-notes.md` exists and answers each bullet.

## Test plan

- This is a spike; the bar is "renders without crashing in the running app," not a new automated test. Do **not** invest in chat unit tests in this plan.
- If a trivial smoke test is cheap (e.g. `ChatSidePanel` renders given `rootPath` under `renderWithProviders` from `apps/web/test/render.tsx`), add one and note it; if it requires heavy backend faking, skip it and say so in the design note.
- Regression guard: `bun run --filter web test` must still pass (you changed shared workbench files).

## Done criteria

- [ ] `bun run --filter web typecheck` exits 0
- [ ] `bun run --filter web lint` exits 0
- [ ] `bun run --filter web test` exits 0
- [ ] Selecting the chat tab in the running app renders the chat panel (or the precise mount error is documented)
- [ ] `docs/chat-wiring-notes.md` exists with the Step 5 content, including the post-mount knip delta
- [ ] No files under `apps/server/` changed; no chat files deleted; no deps removed (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Chat requires a provider/context not already in `main.tsx`, or any change under `apps/server/`, to render.
- Mounting surfaces that chat needs a backend that isn't configured in dev (no usable provider) — document it and stop; standing up the provider is out of scope.
- Typecheck reveals chat is **not** type-valid (it has been drifting un-checked) and fixing it is more than a couple of obvious lines — report the errors.
- The minimal mount balloons beyond the in-scope files.

## Maintenance notes

- Once chat is mounted, `lexical`/`@lexical/react`/`@singapor/diff` are genuinely used — keep plan 005 from removing them, and re-run knip (its "unused" verdict for chat was an artifact of the feature being inert).
- The `tool-pane-header.tsx` tab vocabulary (`'chat' | 'logs' | …`) is ahead of the panel-state model. If chat (and later logs) become first-class panels, consider unifying `WorkbenchSidebarTab` with `ToolPaneHeaderTab` so the two can't drift.
- A reviewer should confirm the mount adds no new provider to the global stack and no server change — this PR should be small and reversible.
- Follow-ups this spike intentionally defers: real chat integration tests, the placement decision if the sidebar MVP is wrong, and the post-mount dead-file cleanup (driven by Step 5's knip delta).
