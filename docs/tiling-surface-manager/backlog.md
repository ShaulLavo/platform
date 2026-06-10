# Backlog

Date: 2026-06-10

Status: open work and open questions for the tiling surface manager. V1
phases are complete; this replaces the pending content of the deleted
`implementation-plan.md`, `technical-design.md`, and `research-findings.md`
(all recoverable from git history). Anything not listed here, in
`behavior-contracts.md`, or in a follow-up plan doc is considered done or
abandoned.

## Dnd-Proof Production Cutover Gaps

Status: proven by the temporary `/shell-proof` route and tracked in
`shell-proof-plan.md`. The original `/dnd-proof` page remains the drag/snap
mechanics proof; `/shell-proof` covers the app-shell recipe semantics needed
for production cutover.

- [x] Terminal window semantics: default terminal placement targets the
      bottom tool pane; terminal tabs do not mix with file editors by default,
      while user-driven sticky placement can still override.
- [x] Tool-pane window semantics: nested tool panes (Files, Search, Git,
      Chat, Logs) with collapse, recipe slots, and rail interaction.
- [x] Recipe-slot snap destinations and recipe-aware fallback when a drop
      target is invalid for the surface type.
- [x] Placement capability rules: which surface types may merge as tabs into
      which windows.

Regression coverage lives in
`apps/web/src/features/shell-proof/tests/recipe.browser.tsx`,
`apps/web/src/features/shell-proof/tests/rail-flows.test.tsx`, and
`packages/tiling/src/utils/tests/`.

## Next

- `placement-policy-follow-up-plan.md` — versioned placement memory and an
  explicit placement policy contract. Gated on the dnd-proof cutover proving
  real snapped drag and basic tiling behavior.
- `agent-surfaces-follow-up-plan.md` — agent-native surfaces (plans, tasks,
  patches, artifacts, per-run logs) as ordinary registry entries. Gated on
  the first workflow recipes.

## Future (Not Scheduled)

Nothing here blocks or shapes current work. Do not pull these into a current
change without an explicit decision.

- `future-layout-plan.md` — frame offset semantics: offset/free-space
  projection should become recipe policy instead of being absorbed into split
  ratios by `frameAxisSize()`. Includes the known default-recipe offset bug,
  which is intentionally unfixed until a real policy boundary exists.

## Open Questions

- Settings UI ownership for the command table, hotkey presets, and the layout
  command editor.
- Whether layout commands should launch external URL/file/quicklink payloads
  or stay limited to Platform-native surfaces while preserving the schema.
- How extension-contributed surfaces register: surface types with capabilities
  and placement preferences, not arbitrary React nodes with layout power.
- Surface capability schema evolution as new surface types land.
- Visual identity: quieter than marketing UI, fresher than IDE chrome; avoid
  becoming a VS Code clone or a generic dock skin.

## Deferred Beyond V1

- Agent surface implementation beyond the follow-up plan.
- Extension-contributed custom surfaces.
- Generic floating surfaces.
- Generic stacked groups.
- Generic lane layout node type (workflow lanes stay inside surfaces or
  policies until proven as primitives).
- Browser popouts.
- Multi-window behavior and OS-level multi-monitor display/space movement
  beyond stored display hints.
- Niri-like spatial mode.
- User-authored layout scripts or algorithms.
- Deep saved profile management (per-project "editing", "review", "agent",
  "focus" profiles with separate placement policies).
