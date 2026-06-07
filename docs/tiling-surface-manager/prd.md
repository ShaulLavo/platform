# Tiling Surface Manager PRD

Date: 2026-06-05

## Summary

Platform should become a workflow shell with a tiling workspace. Files, diffs,
search, terminals, file navigation, git changes, diagnostics, and future agent
work should all be first-class surfaces that can be arranged as tiled windows,
stacked as tabs, collapsed into accordion headers, previewed transiently,
surfaced in the rail, or promoted into durable workspace state.

This is an app-first Platform workbench capability, not a standalone generic
tiling library. The short product framing is: workflow-native surfaces, tiled by
the workspace. GitButler is the strongest product-feel reference: it proves that
a code workspace can be shaped around the work itself instead of generic editor
chrome.

## Vocabulary

- Surface: a stateful work object the user can arrange, collapse, expand, or
  close. Examples: file editor, diff, search results, terminal, file navigator,
  git changes, diagnostics.
- Window: an in-app tiled container that can hold one surface or a tab stack of
  surfaces.
- Collapsed window: a tiled window that remains in the split tree but renders as
  a fixed accordion header instead of full content. This is presentation state,
  not surface lifecycle.
- Chrome-style tabs: the existing Platform tab presentation style for stacked
  surfaces inside a window. This is visual/interaction chrome, not a browser
  surface type.
- Preview: a transient surface that can be replaced by the next selection.
- Durable surface: a surface that belongs to the workspace until closed.
- Running surface: a durable surface with an active process/session, such as a
  terminal.
- Singleton surface: a durable surface with one primary instance per workspace,
  such as Search Results, File Navigator, Git Changes, or Diagnostics.
- Rail: a command/status surface for focusing, expanding, collapsing, opening,
  and inspecting visible, collapsed, background, running, pinned, and recipe
  surfaces. It is not where collapsed panes live.
- Recipe: a workspace placement behavior plus reset shape, not just a saved
  layout.
- Command palette: the keyboard-first launcher for finding and running surface,
  window, recipe, and layout commands. It remains a global overlay, not a
  managed tiled surface.
- Window management command: a command that applies one structural or geometric
  operation to the focused surface/window, such as Left Half, Right Half,
  Maximize, Move to Next Display, or Restore.
- Layout command: a saved multi-surface workspace arrangement that can open or
  focus several surfaces, assign each to a slot, apply sizes/positions, and be
  launched from search or a global hotkey.
- Hotkey preset: a named mapping of window management commands to shortcut
  chords, including compatibility presets for common external window managers.
- Spatial mode: a far-future workspace mode where surfaces can detach from the
  tiled tree into independent spatial windows while preserving surface identity.

## GitButler Inspiration Bar

GitButler should be a heavy inspiration for product feel. That does not mean
copying its branch-stack UI everywhere. It means Platform should be confident
about workflow-shaped layouts:

- Workflows can have their own spatial grammar, not only generic split tabs.
- Related work can use lane-like workflow surfaces when sequence, ownership, or
  review state matters.
- Preview should often be contextual, transient, and close to the selected work.
- Dense workflows should support folding, panning, snapped drag reflow, and
  persistent preferred sizes without visible drop-zone chrome.
- Git, review, search, and future agent work should feel like first-class
  workspaces, not tools bolted onto the side of an editor.
- GitButler-style lanes are a workflow interaction pattern, not automatically a
  generic V1 tiling primitive.

## Locked Decisions

1. The workbench is powered by the tiling surface manager from day one.
2. Default first run uses a familiar classic-shaped recipe on top of that
   tiling model, defined in `default-recipe.md`: tool surfaces in left nested
   panes, editor center/main view, Terminal/Problems at the bottom of the
   editor/main panel, and tabs where users expect them.
3. Classic editor behavior must be credible onboarding and compatibility, but
   classic is a recipe, not the architecture ceiling.
4. The rail primarily focuses/restores stateful surfaces and recipes. It is not
   a separate "tool" model and not layout storage for collapsed panes.
5. Terminal is special only as default recipe behavior: default terminal actions
   target the bottom of the editor/main panel, but user-driven terminal
   placement in any split is valid and sticky while its concrete target remains
   valid.
6. Recipe-managed tool panes are order-packed from the current visible set. The
   default recipe must not keep appending tools into stale split history that
   shrinks older panes.
7. Search is a durable singleton surface. Opening search restores its query,
   filters, selection, and result state when one exists.
8. Search defaults to the left nested tool panes, but can be moved, maximized,
   tabbed, split, or collapsed.
9. Search durability means preserving search state, not keeping the heavy search
   UI rendered in the background. Collapsed, hidden, or background search can
   unmount and rehydrate from its surface state when registry policy allows it.
10. Search Preview is contextual and transient. It is replaced by selection
    changes, promoted on explicit open/pin/edit intent, and cleaned up when its
    owning search context closes or changes.
11. Surfaces opened from inside a maximized or fullscreen window default to a tab
    in that same window. They must not open behind the active fullscreen context
    unless the user explicitly requests a different placement.
12. Git Changes is a durable singleton surface. It restores selection, grouping,
    staged/unstaged state, filters, and linked diff context when possible.
13. File Navigator is a durable singleton surface. It restores expansion and
    selection when possible.
14. Diffs behave like file tabs by default. V1 should not require a special
    diff-only side region.
15. Window tab stacks should use the existing Chrome-style tab treatment by
    default, including close affordances, active/inactive shape, overflow
    behavior, and drag/reorder feel where applicable. A whole window/tab stack
    is draggable as one group, and an individual surface tab is draggable as one
    surface. Tab drag starts as an in-strip slide/reorder interaction: the
    dragged tab stays in the tab bar while sibling tabs animate aside. Pulling
    the pointer down past a researched Chrome-like detach threshold converts
    that single tab into a snapped workspace placement. The detached tab becomes
    a window immediately in preview, snaps to the grid, and shows its final
    release geometry before commit. It never floats as a loose tab or pane.
16. Minimize means collapse the window in place into an accordion header.
    Collapse/expand is independent from whether the surface keeps running,
    unmounts UI, suspends, or disposes resources.
17. Close removes the surface or represented window from the visible layout, but
    close is also independent from runtime. Registry close policy decides
    whether the underlying state/session is disposed, suspended, kept in the
    background, or protected by confirmation.
18. Transient previews generally do not collapse. They are replaced, closed, or
    promoted into durable surfaces.
19. Drag and drop must use sticky snapped layout preview everywhere in the app.
    There are no visible drop zones, drop-zone overlays, placeholder slots, or
    "dragged out" floating previews anywhere. As the user drags, the dragged
    object stays visually attached to the tiling system and all other tiles
    rearrange around the snap destination. The screen should show the exact
    end-result layout that will be committed on mouse release. This applies to
    whole windows, groups of tab stacks/windows, individual tabs detached from a
    stack, and single-surface moves. Dragging must not create a floating,
    popout, or otherwise unsnapped intermediate state. Future floating windows
    may exist only through explicit commands or policy, not by dragging a window
    or tab out of the grid. Non-layout drag flows such as file-tree moves must
    also avoid visible drop-zone or target chrome; they may resolve targets
    privately, but the UI must not draw separate drop affordances.
20. Keyboard control should follow classic tiling-window-manager grammar,
    inspired by Hyprland/Wayland and i3: directional focus, move, split, resize,
    maximize/restore, collapse/expand, parent focus, and recipe/workspace
    switching should all be first-class commands.
21. Editor muscle memory still matters. File, tab, command palette, close,
    reopen, and search shortcuts should remain compatible where possible.
22. Windows have visible gaps by default, with a wallpaper/background visible
    through the gaps.
23. Windows have a very slight translucent and blurred background. The effect
    must not hurt code readability, terminal contrast, or performance.
24. Stacked groups, floating surfaces, browser popouts, extension surfaces, and
    agent implementation are deferred from V1.
25. Agent surfaces are still a required follow-up product plan because agent
    chat, plans, tasks, logs, patches, artifacts, and terminals need surface
    semantics later.
26. Git/review workflows should target GitButler-level clarity: contextual
    preview, visible state, dense workflow navigation, and workflow-specific
    snap/reflow behavior where that model fits.
27. GitButler-style lanes should live inside git/review workflow surfaces or
    recipe policies in V1. They should not be added as generic layout tree nodes
    unless a prototype proves they generalize beyond git/review/agent workflows.
28. Workflows are nested experiences inside surfaces. The tiling workspace gives
    those surfaces space, focus, persistence, previews, and restore behavior; it
    does not own each workflow's internal interaction model.
29. Generic tiling is the foundation, but the best Platform layouts should be
    workflow-native, not merely rearranged editor panes.
30. Far future should support a Niri-like spatial mode where surfaces can become
    independent windows placed freely in space. V1 should only preserve the
    product distinction between surface identity and presentation.
31. The command palette is part of the tiling product, not only a generic app
    command list. It should expose window management commands with searchable
    names, category labels, icons, shortcuts, aliases, and disabled states
    derived from active surface/window capabilities.
32. The intended UX ladder mirrors Raycast Window Management: users can search
    and run a command, promote repeated commands to global hotkeys, apply a
    preset if they are migrating from another window manager, then mostly live
    in muscle memory.
33. Platform should ship a broad built-in window management command catalog:
    maximize, almost maximize, fullscreen, restore, center, reasonable size,
    halves, thirds, fourths, quarters, sixths, move by direction, move to next
    or previous display when available, focus by direction, focus rail, and
    collapse/expand operations.
34. Repeated left/right sizing commands should support cycling behavior where
    useful, such as cycling through one-half, two-thirds, one-third, and
    adjacent display targets. Cycling state must be scoped so repeated
    invocation feels intentional rather than surprising.
35. Settings must include a command management table with Name, Type, Alias,
    Hotkey, and Enabled-style fields, plus an extension/detail panel for gap,
    cycling, display wrapping, Stage Manager or OS-integration compatibility
    toggles where relevant, and hotkey preset import.
36. Users should be able to create custom single-window commands from the
    command palette or settings by choosing size, pinned position, and offsets
    in percentages or points.
37. Users should be able to create layout commands that arrange multiple
    Platform surfaces, optionally associate URLs/files/quicklinks with surfaces
    that know how to open them, and bind the result to a global hotkey.
38. Raycast is a reference for command search, hotkey management, presets, and
    layout-builder UX. It is not a reason to remove Platform's planned mouse
    drag/repositioning, sticky snapped previews, edge/center snap destinations,
    or explicit background moves.

## Initial Surface Set

- File editor
- Diff
- Search results
- Search preview
- Terminal
- File navigator
- Git changes or review list
- Diagnostics/problems

## Deferred Product Scope

- Agent surface implementation
- Extension-contributed custom surfaces
- Floating surfaces
- Stacked groups
- Browser popout windows
- OS-level multi-window or full multi-monitor behavior
- Niri-like spatial mode with independent surface windows
- Deep saved profile management beyond command presets and layout commands
- User-authored layout scripts or algorithms

## Required Follow-Up Plans

1. Agent surfaces plan: define how agent chat, plans, tasks, logs, patches,
   artifacts, terminals, and generated diffs map to surfaces and recipes.
2. Placement policy plan: choose automatic placement behaviors after basic
   tiling and live drag interactions are proven.

## Open Product Questions

1. Which surfaces can tab together by default?
2. Should File Navigator be minimizable like every other surface, or should it
   have special always-available behavior?
3. What visual language makes tiling obvious without looking like desktop
   window chrome?
4. How should transient preview and durable surface state be distinguished at a
   glance?
5. How much automatic placement should happen before it feels like the product
   is fighting the user?
6. Which advanced mouse interactions, such as parent-edge or root-edge snapping,
   should wait until after the basic edge/center snap model is proven?
7. What exact tab detach threshold, drag-down progress animation, and sibling
   tab slide timing should be copied or adapted from Chromium's tab strip
   source?
8. In far-future spatial mode, should independent surface windows be OS-level
   windows, in-app canvas windows, or both?
9. Should layout commands launch external URLs/files in V1, or should V1 limit
   them to Platform-native surfaces while preserving the schema for later?
10. Which hotkey presets should ship first: Rectangle, Magnet, Spectacle, VS
    Code-compatible, Hyprland/i3-style, or a Platform default?
11. Should command palette layout creation be a guided modal, a settings detail
    panel, or both?

## References

- Research findings: `docs/tiling-surface-manager/research-findings.md`
- Technical design draft: `docs/tiling-surface-manager/technical-design.md`
- Raycast Window Management UX research notes captured in
  `docs/tiling-surface-manager/research-findings.md`
