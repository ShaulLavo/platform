# Dockable Workbench PRD

## Summary

Platform should evolve from a custom editor-pane layout into a dockable
workbench where editors, diffs, terminals, and search are peer panels. Users
should be able to open any work surface, place it anywhere in the main
workspace, combine heterogeneous panels into tab groups, split panels in any
direction, resize groups, and restore the layout per workspace.

Dockview is the current candidate layout manager because it supports IDE-style
panels, tabbed groups, drag-and-drop docking, resizing, floating groups, popout
windows, edge groups, and layout serialization. The PRD treats Dockview as the
preferred implementation path, but the product requirements are framed around
the end-state workbench behavior rather than a library-specific API.

Reference docs:

- Dockview introduction: https://dockview.dev/docs/overview/introduction/
- Dockview quickstart: https://dockview.dev/docs/overview/quickstart/?framework=react
- Dockview core concepts: https://dockview.dev/docs/core/overview/
- Dockview state loading/saving: https://dockview.dev/docs/core/state/load/
- Dockview theming: https://dockview.dev/docs/core/theming/

## Problem

The current workspace has several separate layout systems:

- Custom editor pane/tab state under `editorPaneLayout`.
- Custom editor tab drag/drop and split behavior.
- Terminal panels that live outside the editor pane model.
- Search UI that is a sidebar/workspace feature instead of a peer work surface.
- Sidebar and status bar layout managed separately from the main editor area.

This is workable for an editor-only experience, but it makes the workspace feel
less like an IDE workbench. A terminal cannot be placed beside a file like a
normal pane, search cannot sit next to the file it references, and future panels
would each need custom layout behavior.

## Product Goals

1. Make the main workspace a dockable workbench.
2. Treat editor files, diff views, terminal sessions, and search as first-class
   panels.
3. Allow mixed panel groups, where any panel type can share one tab strip.
4. Persist layout per workspace root.
5. Preserve current core editor guarantees: dirty-state handling, file/session
   reuse, LSP behavior, focus handling, shortcuts, and status bar updates.
6. Replace duplicate layout logic rather than adding long-lived compatibility
   shims.
7. Create an architecture that can later support dockable side panels, floating
   panels, popouts, and saved workbench profiles.

## Non-Goals

V1 does not need to:

- Make the file tree/sidebar dockable.
- Make the activity bar dockable.
- Make the status bar dockable.
- Support floating groups.
- Support popout browser windows.
- Support multiple independent saved layout profiles.
- Support extension-contributed panels.
- Preserve the old `editorPaneLayout` model as a long-term parallel system.

The final version may support several of these, but they should not block V1.

## Users

### Primary User

A developer working in Platform who needs to inspect files, run terminal
commands, compare diffs, and search across the workspace without constantly
switching contexts.

### Secondary User

A power user who wants a highly customized workbench layout: multiple editors,
one or more terminals, search results, side tools, logs, and future agent views
arranged for a specific workflow.

## Product Principles

- Panels are peers. A terminal is not a drawer, and search is not only a
  sidebar. Each can be placed in the same layout system as editor files.
- Layout is workspace state. The layout should restore when reopening the same
  root folder, but should not leak between unrelated workspaces.
- Content identity is separate from panel placement. Moving a file panel should
  not recreate its document session or lose scroll, selection, dirty state, LSP
  state, or status state.
- Library state is not product state. Dockview can own geometry and grouping,
  while Platform owns panel identity, documents, terminals, search buffers,
  dirty-state rules, commands, and persistence policy.
- V1 should be substantial but constrained. The first release should prove the
  mixed dockable workbench without taking on floating, popout, or full shell
  docking complexity.

## End State

The final workbench is a full IDE-style layout system:

- The main workspace is powered by a dockable layout manager.
- Editors, diffs, terminals, search, logs, chat/agent views, git views, preview
  views, and future tools are all panel types in a shared registry.
- Any panel can be opened, closed, split, reordered, moved between groups, or
  restored from layout state.
- Users can mix panel types in the same tab group.
- Sidebars remain shell regions rather than dockable panels, but can later
  support left/right placement through explicit controls.
- Users can reset layout, save workspace-scoped named layouts, and restore
  workspace defaults.
- The workbench supports keyboard-first workflows for panel navigation,
  splitting, moving, closing, reopening, and cycling.
- The layout persists per workspace because panel identities and paths are
  workspace-specific.
- Floating groups and popout windows are supported only after lifecycle, focus,
  terminal, and editor-session behavior is proven reliable.

## V1 Scope

V1 should replace the main editor area with a dockable central workbench.

Included panel types:

- File editor panel.
- Diff editor panel.
- Terminal session panel.
- Search panel.

Included layout behavior:

- Open panels.
- Close panels with existing dirty-file guardrails where relevant.
- Reorder tabs within a group.
- Move tabs between groups.
- Split left, right, up, or down.
- Resize groups.
- Mix files, diffs, terminals, and search in the same group.
- Persist and restore layout per workspace root.
- Reset to a default layout.

Kept outside Dockview in V1:

- Activity bar.
- File tree/sidebar.
- Status bar.
- Command palette.
- Global dialogs.
- Toasts.

Explicitly deferred:

- Floating groups.
- Popout windows.
- Sidebar left/right placement controls.
- Saved layout profiles.
- User-authored layout JSON.
- Extension panel registry.

## V1 Default Layout

When a workspace has no saved layout:

1. The workbench starts with one empty editor group.
2. Opening a file creates or focuses a file editor panel in the active group.
3. Opening search creates or focuses a Search panel in the active group.
4. Creating a terminal opens a terminal session panel. Default placement:
   bottom split.
5. Opening a diff creates or focuses a diff panel in the active group.

The exact default placement is adjustable during implementation, but the V1
principle is that search and terminal are real panels, not overlays or drawers.

## Core Concepts

### Workbench Panel

A workbench panel is a persisted item in the layout. It has a stable ID, a type,
metadata needed for rendering, and lifecycle rules.

```ts
type WorkbenchPanel =
  | FileEditorPanel
  | DiffEditorPanel
  | TerminalPanel
  | SearchPanel
```

### Panel Types

File editor panel:

- Identity: document path plus optional view state identity.
- Renders the existing `Editor` surface.
- Participates in dirty-state close confirmation.
- Updates selected path and status bar when active.

Diff editor panel:

- Identity: diff document ID.
- Renders the existing diff viewer/editor path.
- May expose diff-specific tab actions such as reveal previous/next change and
  diff view mode.

Terminal panel:

- Identity: terminal session ID.
- Renders one terminal session.
- Each terminal session is its own workbench panel.
- Closing the panel disposes the session in V1. Collapsing or hiding the group
  keeps the session alive.

Search panel:

- Identity: singleton search panel ID for V1.
- Renders search controls and results.
- Opening search focuses the existing search panel if present.
- Later versions may support multiple search panels keyed by query or saved
  search ID.

### Dock Group

A dock group is a tabbed container managed by the layout manager. A group can
contain any mix of panel types.

### Active Panel

The active panel is the current focus owner for command routing, status bar
state, and default panel placement.

## Functional Requirements

### Opening Panels

- Opening a file focuses an existing file panel for that path if present.
- If the path is not open, create a new file panel in the active group.
- Future versions may allow duplicate file panels for the same path. Duplicate
  panels share the same backing buffer while preserving independent view state.
- Opening a diff focuses an existing diff panel for the same diff ID if present.
- Creating a terminal creates a new terminal panel with a new session ID.
- Opening search focuses the singleton search panel if it exists, otherwise
  creates it.
- Commands must be able to specify placement: active group, beside active panel,
  below active panel, or default placement.

### Closing Panels

- Closing a clean file panel removes it from the layout.
- Closing a dirty file panel triggers the existing dirty-tab confirmation.
- Closing multiple panels must batch dirty-file confirmation where possible.
- Closing a terminal panel should follow an explicit terminal lifecycle policy:
  closing disposes the session in V1. Collapsing or hiding a terminal group
  keeps the session alive.
- Closing the search panel hides/removes it without clearing search history.
- Closing the last panel leaves an empty workbench state that can accept new
  panels.

### Moving And Splitting

- Users can drag any panel tab into any group.
- Users can drag any panel tab to split a group left, right, top, or bottom.
- Keyboard commands should exist for split-active-panel-right,
  split-active-panel-down, move-panel-to-group, close-active-panel, and focus
  next/previous panel.
- V1 should not enforce the current editor split depth cap. If a depth cap is
  needed for usability, it should be a Dockview/workbench policy, not inherited
  from the old editor-only model.

### Layout Persistence

- Persist layout per workspace root path.
- Persist enough information to restore panel types and content identities.
- Do not persist transient runtime-only details that cannot be restored safely.
- Invalid or stale layouts should fail gracefully and fall back to a default
  workbench.
- Missing files should restore as closed panels or as recoverable stale tabs,
  depending on the existing file-not-found behavior chosen during
  implementation.
- Layout saves should be debounced and should not write on every minor event if
  the layout manager emits high-frequency changes.

### Focus And Commands

- Active Dockview panel must update Platform focus state.
- Editor-local commands should continue to route to the active editor panel.
- Terminal-local shortcuts should route to the active terminal panel.
- Global commands should work regardless of panel type unless a panel consumes
  them.
- The command palette should understand workbench panels and expose commands for
  opening, closing, splitting, moving, and resetting panels.

### Status Bar

- File editor panels should continue to publish editor status sources.
- Diff panels should publish diff-specific status only if available.
- Terminal and search panels should clear editor-specific status or publish
  panel-specific status.
- The status bar remains outside Dockview in V1.

### Search

- Search is a workbench panel in V1.
- The search panel contains both controls and results.
- Search state should survive panel moves and layout restores.
- Closing the search panel should not erase query history or cached search
  state.
- V1 search is singleton. Future versions may support multiple search panels.

### Terminal

- Each terminal session is a separate workbench panel.
- Terminal panel titles should show the terminal title or shell label.
- Terminal panels can be mixed with editors and search in any group.
- Terminal resize behavior must work when Dockview resizes the host panel.
- Terminal sessions clean up when their panel is closed. Collapsing or hiding
  the terminal group keeps sessions alive.

### Editor And Diff

- File editor panels must reuse existing document/session state.
- Moving or splitting an editor panel must not recreate the document buffer.
- Dirty state, save, rename, delete, conflict handling, scroll restoration, LSP,
  and definition/references navigation must remain intact.
- Diff panels should preserve current diff mode and navigation behavior.

### Accessibility

- Tab groups must be keyboard navigable.
- Close buttons and panel actions must have accessible labels.
- Focus outlines must be clear for active groups and active panels.
- Drag-and-drop must have keyboard alternatives for core operations.
- The layout must be usable at the current minimum workspace width.

### Theming

- Dockview chrome should visually match Platform, not look like a separate
  embedded product.
- Use a custom or extended Dockview theme rather than accepting a stock theme
  unchanged.
- Tab height, colors, separators, hover states, active group states, and drag
  overlays should match current workspace chrome.
- Avoid nested-card styling. The workbench is a full-height tool surface.

### Performance

- Opening, moving, and resizing panels should not recreate expensive editor,
  terminal, or search instances unnecessarily.
- Layout changes should not trigger broad React rerenders across inactive
  panels.
- Terminal resizing must be responsive.
- Search result rendering performance must not regress when search is docked.
- Layout persistence should be debounced.

## Technical Direction

### Candidate Library

Use `dockview-react` for the main workbench spike and likely V1 implementation.
Dockview panels map naturally to workbench panels, and Dockview serialization
can store layout geometry and grouping. Platform should still own the panel
registry and panel metadata.

### Proposed Ownership Split

Dockview owns:

- Group geometry.
- Tab grouping.
- Split placement.
- Drag/drop layout changes.
- Serialized layout structure.

Platform owns:

- Panel registry.
- Panel IDs and metadata.
- Document/session lifecycles.
- Terminal session lifecycles.
- Search state.
- Dirty close behavior.
- Command routing.
- Workspace persistence policy.
- Default layout policy.

### Panel Registry

Add a Platform workbench panel registry that maps panel type to:

- Render component.
- Title builder.
- Icon builder.
- Close policy.
- Restore policy.
- Serialization metadata.
- Optional tab actions.

Example shape:

```ts
type WorkbenchPanelDescriptor<TPanel extends WorkbenchPanel> = {
  type: TPanel['type']
  render: React.ComponentType<WorkbenchPanelRenderProps<TPanel>>
  title: (panel: TPanel) => string
  closePolicy: (panel: TPanel) => WorkbenchClosePolicy
  serialize: (panel: TPanel) => SerializedWorkbenchPanel
  restore: (data: SerializedWorkbenchPanel) => TPanel | null
}
```

### State Migration

The existing `editorPaneLayout` should not remain as a long-term source of
truth. V1 should migrate toward:

- `workbenchLayout`: serialized Dockview layout plus panel metadata.
- `openFilePaths`: derived from file editor panels.
- `selectedFilePath`: derived from active file editor panel.
- Dirty paths and document state remain in existing editor document services.
- Recently closed files can be maintained from file panel close events.

During implementation, a short-lived migration adapter may be needed, but the
final V1 code should avoid keeping both editor layout models active.

### Persistence Format

Persist one object per workspace root:

```ts
type SerializedWorkbenchState = {
  version: number
  layout: unknown
  panels: SerializedWorkbenchPanel[]
  activePanelId: string | null
}
```

The `layout` field can hold Dockview's serialized state. The `panels` field is
Platform-owned metadata required to restore content.

### Failure Handling

If persisted layout restore fails:

1. Log a structured client error.
2. Drop the invalid workbench layout.
3. Restore a default workbench.
4. Preserve recoverable open paths if possible.

## V1 Acceptance Criteria

Product:

- A file editor, a diff editor, a terminal session, and search can all exist as
  workbench panels.
- A terminal can be placed beside an editor, above an editor, below an editor,
  or in the same tab group as an editor.
- Search can be opened as a workbench panel and moved/split like any other
  panel.
- Layout restores per workspace root after reload.
- Closing dirty files still prompts correctly.
- Reset layout restores a sane default.

Engineering:

- Old editor-only layout state is removed or clearly bounded to a temporary
  migration path.
- Panel rendering is registry-driven, not hard-coded in Dockview callbacks.
- Typecheck and relevant tests pass.
- Browser verification covers opening, splitting, moving, closing, restoring,
  terminal resize, and search rendering.
- No long-lived backward compatibility aliases or duplicate layout behavior.

## Final Version Acceptance Criteria

- All major workbench tools are panel registry entries.
- Users can save and restore workspace-scoped named layout profiles.
- Sidebar/file tree can move between left and right shell positions through
  explicit controls. It does not become a dockable panel.
- Floating panels are supported with reliable focus and lifecycle behavior.
- Popout windows are supported only if editor, terminal, search, and command
  routing remain stable across windows.
- Extension or plugin panel contribution is possible without changing core
  layout code.
- Keyboard workflows cover common panel operations.
- The workbench can recover from stale persisted layouts gracefully.

## Implementation Phases

### Phase 0: Spike And Decisions

- Install or inspect `dockview-react`.
- Build a small local prototype inside the app or a perf entry.
- Verify custom theme fit.
- Verify panel serialization and restore.
- Verify editor surface can survive moves without losing state.
- Verify terminal resize works inside Dockview.
- Decide whether Dockview limitations block V1.

Exit criteria:

- Written spike notes.
- Go/no-go decision on Dockview.
- Confirmed panel registry architecture.

Phase 0 spike notes, 2026-06-05:

- Installed `dockview-react@6.6.1`, which pulled `dockview@6.6.1` and
  `dockview-core@6.6.1`.
- Added an isolated spike entry at `apps/web/dockview-workbench-spike.html`.
  It is intentionally outside the production workspace route and can be opened
  at `/dockview-workbench-spike.html` while the web dev server is running.
- Built a registry-backed Dockview prototype under
  `apps/web/src/features/workbench-spike/`. The prototype registers the V1 panel
  classes as Platform-owned metadata: file, diff, terminal, and search.
- Verified a custom Platform-aligned Dockview theme through
  `dockview-theme-platform`. The stock Dockview stylesheet is usable, but V1
  should continue overriding tab height, borders, active group outline, sash
  affordances, and drag overlay colors so Dockview does not read as a separate
  embedded product.
- Verified default mixed layout behavior: file and diff can share a tab group,
  search can sit in a right split, and terminal panels can sit in bottom splits.
  Adding another terminal creates a new terminal panel and split.
- Verified serialization and restore with `api.toJSON()` and `api.fromJSON()`.
  The spike persists Dockview layout separately from Platform-owned panel
  metadata in a shape matching the proposed `SerializedWorkbenchState`.
- Verified the actual editor host can render inside a Dockview panel using an
  in-memory `EditorTextBuffer` and `EditorViewSession`. The spike uses
  Dockview `renderer: 'always'` for editor panels so tab inactivity does not
  tear down the editor instance.
- Verified a real `ghostty-web` terminal renderer and `FitAddon` can mount
  inside Dockview and report resized cell dimensions. The spike does not open a
  server terminal socket; session creation, disposal, and socket lifecycle
  remain Phase 3 work.
- Browser verification passed against the local spike with no page errors or
  console errors. It covered initial render, adding a terminal panel,
  save/restore, serialized state output, terminal resize metrics, and the file
  editor tab rendering an editor host.

Phase 0 decision:

- Go: Dockview is suitable for V1. No Phase 0 blocker was found for theming,
  mixed panel groups, split placement, serialization/restore, editor mounting,
  or terminal resize.
- Confirmed architecture: Dockview should own geometry, groups, tab movement,
  split placement, and serialized layout. Platform should own panel IDs, panel
  metadata, registry entries, document/session lifecycles, terminal lifecycle,
  search state, dirty close policy, command routing, and workspace persistence.
- Keep `renderer: 'always'` as the default for file editor and terminal panels
  until lifecycle measurements prove a cheaper renderer is safe.
- Phase 1 should promote the spike's type split into production workbench state:
  panel union types, serialized state, registry descriptors, restore/fallback
  helpers, and open/focus commands.
- Remaining validation before replacing `FileViewer`: production file/diff
  panels must reuse existing document services, dirty close prompts must be
  wired into Dockview close events, and terminal panels must prove socket
  cleanup on close.

### Phase 1: Workbench State And Registry

- Define workbench panel types.
- Define serialized workbench state.
- Add panel registry.
- Add restore/fallback logic.
- Add commands for opening/focusing panels.

### Phase 2: Dockview Shell

- Replace the central editor-only area with Dockview.
- Keep sidebar, activity bar, status bar, and command palette outside Dockview.
- Render file editor and diff panels through the registry.
- Wire active panel changes into Platform state.

### Phase 3: Terminal As Panel

- Convert each terminal session into a workbench panel.
- Remove bottom/floating terminal assumptions from the main workbench path.
- Ensure terminal creation, focus, resize, close, and cleanup are correct.

### Phase 4: Search As Panel

- Render search controls/results as a singleton workbench panel.
- Wire search open/focus commands.
- Ensure search state survives panel movement and layout restore.

### Phase 5: Persistence And Migration

- Persist layout per workspace root.
- Migrate or reset old editor pane layout state.
- Implement reset layout.
- Handle stale panels and invalid layout state.

### Phase 6: Polish And Verification

- Theme Dockview to match Platform.
- Add keyboard commands.
- Add browser coverage.
- Add focused unit tests for state restore, panel serialization, and close
  policies.
- Remove obsolete editor-pane drag/drop/split code and tests.

### Final-Version Phases

- Left/right sidebar placement controls.
- Multiple search panels or saved searches.
- Logs/git/agent panels in the registry.
- Workspace-scoped named layout profiles.
- Floating groups.
- Popout windows.
- Extension-contributed panels.

## Risks

- Dockview may conflict with existing custom tab chrome or keybinding behavior.
- Editor instances may remount during panel movement if identity is not handled
  carefully.
- Terminal resize and lifecycle behavior may be fragile inside a third-party
  docking container.
- Search rendering may regress if hidden or inactive panels keep expensive
  editor-backed surfaces mounted.
- Persisted Dockview JSON may not align perfectly with Platform-owned panel
  metadata, requiring careful validation.
- Replacing `editorPaneLayout` touches many call sites and tests.

## Resolved Decisions

1. Closing a terminal panel disposes the session in V1.
2. Collapsing or hiding a terminal group keeps the terminal session alive.
3. Search opens as a singleton panel in the active group.
4. New terminals open as new terminal session panels, defaulting to a bottom
   split.
5. Duplicate file panels for the same path are allowed in the final version and
   share the same backing buffer.
6. The file tree/sidebar is not dockable in the final version, but it can move
   left or right through an explicit control.
7. Saved layout profiles are workspace-level because restored layouts contain
   workspace-specific paths and panel identities.
8. Popout windows are optional polish, not product-critical.

## Remaining Open Decisions

1. Should V1 include a collapsed terminal affordance, or only closing and
   docking?
2. Should duplicate file panels be allowed in V1, or only in the final version?
3. What independent view state should duplicate file panels preserve: cursor,
   selection, scroll, folded ranges, find state, or all of these?
4. Should left/right sidebar placement be persisted globally, per workspace, or
   both?
5. What is the exact default layout when the first opened panel is search or
   terminal instead of a file?
