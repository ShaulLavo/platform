# Tiling Surface Manager PRD

Date: 2026-06-05

## Summary

Platform should become a workflow shell with a tiling workspace. Files, diffs,
search, terminals, file navigation, git changes, diagnostics, and future agent
work should all be first-class surfaces that can be arranged as tiled windows,
stacked as tabs, minimized into a rail, previewed transiently, or promoted into
durable workspace state.

This is an app-first Platform workbench capability, not a standalone generic
tiling library. The short product framing is: workflow-native surfaces, tiled by
the workspace. GitButler is the strongest product-feel reference: it proves that
a code workspace can be shaped around the work itself instead of generic editor
chrome.

## Vocabulary

- Surface: a stateful work object the user can arrange, minimize, restore, or
  close. Examples: file editor, diff, search results, terminal, file navigator,
  git changes, diagnostics.
- Window: an in-app tiled container that can hold one surface or a tab stack of
  surfaces.
- Chrome-style tabs: the existing Platform tab presentation style for stacked
  surfaces inside a window. This is visual/interaction chrome, not a browser
  surface type.
- Preview: a transient surface that can be replaced by the next selection.
- Durable surface: a surface that belongs to the workspace until closed.
- Running surface: a durable surface with an active process/session, such as a
  terminal.
- Singleton surface: a durable surface with one primary instance per workspace,
  such as Search Results, File Navigator, Git Changes, or Diagnostics.
- Rail: a surface shelf, taskbar, and scratchpad for visible, minimized,
  running, and pinned surfaces.
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
- Dense workflows should support folding, panning, clear drop zones, and
  persistent preferred sizes.
- Git, review, search, and future agent work should feel like first-class
  workspaces, not tools bolted onto the side of an editor.
- GitButler-style lanes are a workflow interaction pattern, not automatically a
  generic V1 tiling primitive.

## Locked Decisions

1. The workbench is powered by the tiling surface manager from day one.
2. Default first run uses a familiar classic-shaped recipe on top of that
   tiling model, defined in `default-recipe.md`: tool surfaces in left nested
   panes, editor center/main view, Terminal/Problems in the bottom tool pane,
   and tabs where users expect them.
3. Classic editor behavior must be credible onboarding and compatibility, but
   classic is a recipe, not the architecture ceiling.
4. The rail primarily focuses/restores stateful surfaces and recipes. It is not
   a separate "tool" model.
5. Search is a durable singleton surface. Opening search restores its query,
   filters, selection, and result state when one exists.
6. Search defaults to the left nested tool panes, but can be moved, maximized,
   tabbed, split, or minimized.
7. Search durability means preserving search state, not keeping the heavy search
   UI rendered in the background. Hidden or minimized search can unmount and
   rehydrate from its surface state.
8. Search Preview is contextual and transient. It is replaced by selection
   changes, promoted on explicit open/pin/edit intent, and cleaned up when its
   owning search context closes or changes.
9. Git Changes is a durable singleton surface. It restores selection, grouping,
   staged/unstaged state, filters, and linked diff context when possible.
10. File Navigator is a durable singleton surface. It restores expansion and
    selection when possible.
11. Diffs behave like file tabs by default. V1 should not require a special
    diff-only side region.
12. Window tab stacks should use the existing Chrome-style tab treatment by
    default, including close affordances, active/inactive shape, overflow
    behavior, and drag/reorder feel where applicable.
13. Minimize preserves surface state through the rail. Close removes the surface
    from the workspace, subject to close rules.
14. Transient previews generally do not minimize. They are replaced, closed, or
    promoted into durable surfaces.
15. Drag and drop should live-preview snapped layouts. As the user drags,
    surrounding windows rearrange around the potential drop target; releasing
    commits the previewed layout.
16. Keyboard control should follow classic tiling-window-manager grammar,
    inspired by Hyprland/Wayland and i3: directional focus, move, split, resize,
    maximize/restore, minimize/restore, parent focus, and recipe/workspace
    switching should all be first-class commands.
17. Editor muscle memory still matters. File, tab, command palette, close,
    reopen, and search shortcuts should remain compatible where possible.
18. Windows have visible gaps by default, with a wallpaper/background visible
    through the gaps.
19. Windows have a very slight translucent and blurred background. The effect
    must not hurt code readability, terminal contrast, or performance.
20. Stacked groups, floating surfaces, browser popouts, extension surfaces, and
    agent implementation are deferred from V1.
21. Agent surfaces are still a required follow-up product plan because agent
    chat, plans, tasks, logs, patches, artifacts, and terminals need surface
    semantics later.
22. Git/review workflows should target GitButler-level clarity: contextual
    preview, visible state, dense workflow navigation, and workflow-specific
    drop behavior where that model fits.
23. GitButler-style lanes should live inside git/review workflow surfaces or
    recipe policies in V1. They should not be added as generic layout tree nodes
    unless a prototype proves they generalize beyond git/review/agent workflows.
24. Workflows are nested experiences inside surfaces. The tiling workspace gives
    those surfaces space, focus, persistence, previews, and restore behavior; it
    does not own each workflow's internal interaction model.
25. Generic tiling is the foundation, but the best Platform layouts should be
    workflow-native, not merely rearranged editor panes.
26. Far future should support a Niri-like spatial mode where surfaces can become
    independent windows placed freely in space. V1 should only preserve the
    product distinction between surface identity and presentation.
27. The command palette is part of the tiling product, not only a generic app
    command list. It should expose window management commands with searchable
    names, category labels, icons, shortcuts, aliases, and disabled states
    derived from active surface/window capabilities.
28. The intended UX ladder mirrors Raycast Window Management: users can search
    and run a command, promote repeated commands to global hotkeys, apply a
    preset if they are migrating from another window manager, then mostly live
    in muscle memory.
29. Platform should ship a broad built-in window management command catalog:
    maximize, almost maximize, fullscreen, restore, center, reasonable size,
    halves, thirds, fourths, quarters, sixths, move by direction, move to next
    or previous display when available, focus by direction, and rail/minimize
    operations.
30. Repeated left/right sizing commands should support cycling behavior where
    useful, such as cycling through one-half, two-thirds, one-third, and
    adjacent display targets. Cycling state must be scoped so repeated
    invocation feels intentional rather than surprising.
31. Settings must include a command management table with Name, Type, Alias,
    Hotkey, and Enabled-style fields, plus an extension/detail panel for gap,
    cycling, display wrapping, Stage Manager or OS-integration compatibility
    toggles where relevant, and hotkey preset import.
32. Users should be able to create custom single-window commands from the
    command palette or settings by choosing size, pinned position, and offsets
    in percentages or points.
33. Users should be able to create layout commands that arrange multiple
    Platform surfaces, optionally associate URLs/files/quicklinks with surfaces
    that know how to open them, and bind the result to a global hotkey.
34. Raycast is a reference for command search, hotkey management, presets, and
    layout-builder UX. It is not a reason to remove Platform's planned mouse
    drag/drop tiling, live previews, edge drops, or rail drops.

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
6. Which advanced mouse interactions, such as parent-edge drop, should wait
   until after the basic edge/center drop model is proven?
7. How much live rearrangement during drag feels helpful before it becomes
   visually distracting?
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
