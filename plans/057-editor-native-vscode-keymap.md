# Plan 057: Editor-Native VS Code Keymap and Single-Dispatcher Takeover

> **Executor:** Read this plan in full before editing. Then read `/Users/shaul/Desktop/D/platform/AGENTS.md`, `/Users/shaul/Desktop/D/platform/CLAUDE.md`, `/Users/shaul/Desktop/D/Editor/AGENTS.md`, and `/Users/shaul/.agents/skills/never-nester/SKILL.md`. This plan edits **two repositories**. Read §3 before touching either — CI clones the Editor at an unpinned `main`, so the merge order is not optional. Do not create a branch, commit, push, or PR unless the user explicitly asks.

## Status

- **State:** Blocked on 056
- **Priority:** P2
- **Effort:** XL
- **Risk:** HIGH — two of the failure modes (§6 H1, H2) are invisible to `dom` tests and read to a user as "the editor is broken"
- **Category:** Direction
- **Depends on:** `plans/056-multi-step-chord-keymap.md` complete and the landed typed
  `CommandBus`/`FocusService` runtime. VS Code's chorded families cannot be expressed before the
  chord machine exists, and the fold family (§5) is the reason the takeover is survivable.
- **Planned against:** platform `546a4c84`, Editor `899b3f3`, 2026-08-22; command/focus boundary reconciled 2026-08-25

## Decision record

Two directions were live. The measured evidence favoured keeping the keymap pack in platform; **the operator chose the editor-native pack and the full takeover, and that is what this plan implements.** The dissenting evidence is recorded in §2 rather than discarded, because it names real costs this plan has to pay rather than avoid.

## Problem statement

Three defects, one root cause: the Editor and platform each hold a keymap, and neither is authoritative.

**1. The app ships folding with no keys.** `grep -c fold apps/web/src/keymap/editor-commands.ts` returns **0**. Platform binds none of the Editor's folding pack and simultaneously disables the Editor's defaults with `defaultBindings: false` (`editor.tsx:123`). Fifteen fold commands are unreachable: no key, no palette row (the palette enumerates `platformCommands`, `table.ts:11`), no menu item.

**2. Thirty-five editor commands are unreachable the same way.** Measured by executing `defaultEditorKeyBindings(platform)` against the `keys` of `editorCommands`, both normalised:

|                                   | mac      | windows | linux    |
| --------------------------------- | -------- | ------- | -------- |
| Editor default hotkeys / commands | 102 / 98 | 98 / 97 | 100 / 97 |
| Platform hotkeys / bound commands | 88 / 70  | 70 / 67 | 72 / 67  |
| Identical key → identical command | 61       | 62      | 64       |
| **Same key → different command**  | **0**    | **0**   | **0**    |
| Commands only the Editor binds    | **35**   | 36      | 36       |
| Commands only platform binds      | 7        | 6       | 6        |

Folding ×15, column-select ×6, `smartSelect.expand`/`shrink`, `cursorWordPart*Select`, `deleteWordPart*`, `reindentlines`/`reindentselectedlines`, `cursorUndo`/`cursorRedo`, **`editor.action.toggleTabFocusMode`**, `editor.action.autoFix`, `inlineSuggest.acceptNextWord` (mac), and **`goToDefinition` F12**. The last two are not optional: `toggleTabFocusMode` is the keyboard-trap escape hatch (§6 H2) and F12 is currently a reserved no-op (`default-bindings.ts:106`).

Nothing failed while platform's table sat 35 commands behind, because the only mechanical link between the tables is `defineEditorCommand<const Id extends EditorCommandId>` (`define-command.ts:117`), which proves the _command_ exists and says nothing about the _key_.

**3. The Editor's standalone keymap is VS Code-wrong, and chordless.** Six genuine contradictions, all of which platform gets right and the Editor gets wrong:

| command                   | Editor                    | Platform    | why the Editor is wrong           |
| ------------------------- | ------------------------- | ----------- | --------------------------------- |
| `findReplace`             | `Mod+H` (`keymap.ts:519`) | `Mod+Alt+F` | `Mod+H` is macOS Hide Application |
| `toggleFindCaseSensitive` | `Alt+C` (`:550`)          | `Mod+Alt+C` | bare `Alt+C` types `ç`            |
| `toggleFindWholeWord`     | `Alt+W` (`:551`)          | `Mod+Alt+W` | types `∑`                         |
| `toggleFindRegex`         | `Alt+R` (`:552`)          | `Mod+Alt+R` | types `®`                         |
| `toggleFindInSelection`   | `Alt+L` (`:553`)          | `Mod+Alt+L` | types `¬`                         |
| `togglePreserveCase`      | `Alt+P` (`:554`)          | `Mod+Alt+P` | types `π`                         |

And `foldingBindings` (`keymap.ts:663-685`) transliterates VS Code's entire `Ctrl+K` fold family into single strokes via an invented modifier-depth scheme — its own comment says the third modifier "asks for the variant of the chord it extends". That scheme collides head-on with `workspace.jumpToSession${position}` (`workspace-commands.ts:127`, `Mod+Alt+1..9`) and `previousSession`/`nextSession` (`:838`, `:828`, `Mod+Alt+[` / `Mod+Alt+]`) — **9 contested keys on mac, 7 on windows/linux**.

## Why the editor-native pack, and what it costs

**The operator's rationale:** the Editor is a library. Its default keymap is its public face for anyone embedding it, and that keymap is currently both wrong on macOS and distorted by a missing primitive. Fixing the primitive where it is missing beats maintaining the workaround plus a translation layer above it.

**The costs this plan therefore pays, stated up front:**

1. **A new package export subpath.** `@singapor/core` has no `./keymap` and `files: ["README.md","dist"]`. Adding it is a real cross-repo change with a dev-resolution implication (§3).
2. **A permanent two-repo round trip on keymap edits.** Every future binding tweak is an Editor commit, a build, and a platform commit.
3. **Product copy in a general-purpose library.** The pack carries VS Code command identities; the Editor now ships opinions about a specific editor's keymap.
4. **The shared-prefix split.** `Ctrl+K Ctrl+C` is an editor command and `Ctrl+K Ctrl+S` is a workbench one. `EditorCommandId` cannot name `PlatformCommandId`, so **the pack is split by command space and merged in platform** (§4). The prefix is shared; no individual row spans both, so the split is clean — but platform, not the Editor, remains the only place that sees the whole trie.

**What was rejected and why it matters anyway:** keeping the pack in platform would have avoided all four. It was rejected in favour of a correct standalone Editor. §4's split and §3's sequencing exist specifically to keep that choice from leaking a second source of truth back in.

## Cross-repo mechanics — read before editing

### Verified facts about the boundary

- `platform/packages/editor-*` are **symlinks** into `/Users/shaul/Desktop/D/Editor/packages/*`, so Editor source is edited in place from inside the platform tree.
- Root `overrides` pins every `@singapor/*` to `link:`, so the `"@singapor/core": "0.1.1"` in `apps/web/package.json` is decorative. **There is no version negotiation and no way to stage a breaking change behind a version.**
- **Dev needs no rebuild.** `editorSourcePlugin` (`apps/web/vite.config.ts:79-99`, `apply: 'serve'`) rewrites `@singapor/*` specifiers to the sibling repo's `src/`, deriving each target from the package's own `exports` map — **all-or-nothing per package** (comment at `:74-82`). A new subpath needs its `exports` entry before dev resolution works.
- **Typecheck and prod build do need a rebuild.** Both resolve `exports.types` / `exports.import` → `dist/`.
- Platform's `typecheck` runs over `workspaces.packages`, which **excludes the symlinked `packages/editor-*`**. Platform never typechecks Editor source; type breakage there is invisible until the dist is rebuilt.
- **CI clones the Editor at an unpinned `main`**: `EDITOR_REF: main` (`.github/workflows/ci.yml:19`), `git clone --depth 1 --branch '${{ inputs.editor-ref }}'` (`.github/actions/setup/action.yml:65`).

### The consequence: no atomic breaking change is possible

Because CI resolves the Editor at `main` for **every open platform PR simultaneously**, an Editor commit that removes `EditorKeyBinding.hotkey` breaks every in-flight platform PR the moment it merges. The change must therefore be **additive, then migrated, then narrowed**, in three merges:

| Step  | Repo     | Change                                                                                                                                                                                                        | Gate before proceeding                                                                               |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **A** | Editor   | Add `./keymap` to `exports`. Add `key?: KeySpec` to `EditorKeyBinding` **alongside** the existing `hotkey?: RegisterableHotkey`; make exactly one required via a union. Add the static pack. `bun run build`. | Editor `typecheck` + `test` green; `dist/` rebuilt; platform CI still green with no platform change. |
| **B** | platform | Consume `@singapor/core/keymap`; migrate every producer and consumer to `key`.                                                                                                                                | Platform `verify` green; §8 browser checks pass.                                                     |
| **C** | Editor   | Delete `hotkey` from `EditorKeyBinding`; the union collapses to `key`. `bun run build`.                                                                                                                       | Both repos green.                                                                                    |

**This is not a back-compat shim.** CLAUDE.md's greenfield rule forbids permanent aliases and deprecation windows; it does not require a physically impossible atomic cross-repo merge. Step C is mandatory and lands in the same working session as B. If C is not done, the plan is not done.

**Local loop:** Editor edit → `bun run build` in `Editor/packages/editor` → platform typecheck. The dev server never needs the build, so the inner loop is unaffected.

## The pack model

### Split by command space

```
Editor  packages/editor/src/editor/keymap/pack.ts     — editor.* rows, EditorCommandId
        packages/editor/src/editor/keymap/vscode.ts   — the VS Code pack, generated + reviewed
        exported via @singapor/core/keymap

platform apps/web/src/keymap/packs/workspace-vscode.ts — workspace.* rows, PlatformCommandId
         apps/web/src/keymap/packs/resolve.ts          — merges both, resolves overrides, one table
```

Platform merges. The Editor never sees a `workspace.*` id, and platform never re-authors an `editor.*` binding.

### Editor-side types

```ts
// Editor/packages/editor/src/editor/keymap/pack.ts

/** One stroke. Object form (`RawHotkey`) whenever Shift meets punctuation: the `Hotkey`
 *  STRING union spells `Shift+${NonPunctuationKey}` on purpose to dodge layout dependence,
 *  so VS Code's `Ctrl+Shift+\` is unspellable as a string. `RawHotkey` can spell it, and
 *  `foldingBindings` already relies on that (keymap.ts:677). */
export type KeyStep = RegisterableHotkey

/** Exactly one or two. VS Code ships no three-step default; the tuple says so, so the pack
 *  cannot express what a resolver capped at two could not run. */
export type KeySpec = readonly [KeyStep] | readonly [KeyStep, KeyStep]

export type EditorPlatformName = 'linux' | 'mac' | 'windows'

export type EditorPackBinding = {
  readonly key: KeySpec
  readonly command: EditorCommandId
  /** Platform variance as DATA. Today ten producer functions branch on `platform`
   *  (keymap.ts:301-317), which a static pack cannot do. */
  readonly platforms?: readonly EditorPlatformName[]
  readonly preventDefault?: boolean
  readonly stopPropagation?: boolean
}

export type EditorKeymapPack = {
  readonly id: 'vscode' | 'default'
  readonly bindings: readonly EditorPackBinding[]
}
```

`EditorKeyBinding` gains `key: KeySpec` and loses `hotkey` at step C. `defaultEditorKeymapLayers()` becomes a filter over the static pack rather than ten platform-branching producers.

### What the Editor gains

- The six mac bugs are fixed **in the pack**, since the Editor's data is now authoritative.
- The fold family moves to `Ctrl+K Ctrl+0`, `Ctrl+K Ctrl+1..9`, `Ctrl+K Ctrl+[`, `Ctrl+K Ctrl+]`, `Ctrl+K Ctrl+,`, `Ctrl+K Ctrl+.` — which **dissolves the 9-key session-jump contest by construction**, because the fold family stops wanting `Mod+Alt+<digit>` at all.
- `Ctrl+K Ctrl+C` / `Ctrl+K Ctrl+U` (comment toggling), `Ctrl+K Ctrl+F` (format selection), `Ctrl+K Ctrl+X` (trim trailing whitespace), `Ctrl+K Ctrl+I` (show hover) become expressible for the first time.

### Silent-drop traps to fix in the same pass

- `editorCommandPackForCommand` (`keymap.ts:286-299`) has **no `clipboard` branch**, and neither does `editorKeyBindingsForCommandPack` (`:301-317`), yet `'clipboard'` is a live member of the union (`:21`), of `defaultEditorCommandPacks` (`:205`) and of `readonlySafeEditorCommandPacks` (`:219`) — a permanently empty layer. `EditorCommandId` has no copy/cut/paste; clipboard is browser-native. **Delete the member.**
- `editor.action.showHover` (`commands.ts:26`) is in **no pack**, so `editorKeymapLayersForBindings` would silently discard any binding for it. Latent today (platform declares it keyless) and live the moment `Ctrl+K Ctrl+I` ships. **Give it a pack.**
- `EditorKeymapLayerSource`'s `'plugin'` and `'user'` (`keymap.ts:31`) have zero producers in either repo. **Narrow to `'core' | 'app'`.**
- **Consumer outside `packages/editor`:** `packages/lsp-plugin/test/codeActions.test.ts:5,233` imports and asserts on `readonlySafeEditorCommandPacks`. Update it in the same commit.

## When-clauses

**Decision: a closed string union of predicate keys, ANDed, with `!` negation via a template-literal member.** No parser, no user-authored `when`, no `or` — two rows express `or`, which is what VS Code's backwards candidate scan amounts to.

```ts
// apps/web/src/keymap/define-command.ts + utils/when.ts   (pure evaluation)
export type CommandWhenKey =
  // landed workspace and target facts
  | 'workspaceOpen'
  | 'tabOpen'
  | 'editorTarget'
  | 'saveableTab'
  | 'fileBackedTab'
  | 'editorWritable'
  | 'chatMode'
  // editor-surface facts — from the resolved FocusService target and Editor.ts:691
  | 'editorHasSelection'
  | 'editorHasMultipleSelections'
  | 'editorTabMovesFocus'
  // editor-internal facts — need the Editor read side (Phase 7); NOT in the first cut
  | 'findWidgetVisible'
  | 'inlineSuggestionVisible'

export type CommandWhen = CommandWhenKey | `!${CommandWhenKey}`
```

`when` is evaluated **at both steps of a chord**, freshly, through the sole CommandBus snapshot and
resolved FocusService target — no store or subscription. This is what VS Code does. **A candidate
whose `when` fails does not consume the chord**: the resolver skips it and, if no candidate survives,
the prefix falls through untouched.

The landed `CommandBus.inspect()` already applies `CommandWhen` to keybindings, palette, and menus,
and `useAppKeymap` suppresses only a synchronously claimed ticket. Extend that evaluator; do not add
a parallel availability helper or reinterpret conditions in the chord machine.

## Settings surface

```ts
'keybindings.preset': defineSetting({
  schema: v.picklist(['default', 'vscode']),
  default: 'vscode',
  scope: 'application',
  widget: 'select',
  category: 'Keyboard',
  description: 'Which built-in keymap the default bindings come from. User overrides always win.',
  keywords: ['keymap', 'keybindings', 'preset', 'vscode', 'chord'],
})
```

**Scope is `application`, not `window`** — the value selects which keys bind to which commands, which reaches execution. CLAUDE.md's rule is explicit and a workspace file ships inside a cloned repository.

**Only two members, and the description says why.** A vim keymap is a _modal input mode_ — operator-pending state, counts, registers, a mode indicator — not a key table. It is not a third picklist entry and must not be presented as one.

The preset resolves **below** user overrides: preset → `resolvedPlatformKeyBindings` → overrides. A row dropped by preset switching is reported through the existing `shadowedBy` channel (`active-bindings.ts:33-43`), rendered by `keybinding-row.tsx` with no UI change. `keybinding-section.tsx` gains a preset selector and an `unmapped` ledger listing VS Code bindings with no platform command — visible, not silent.

**Collision detection must move first.** `keyBindingResolution` early-returns when there are no overrides (`active-bindings.ts:168`), so `collidesWith` never runs on the shipped defaults, and default-table ties fall to `selectActiveBinding:257`'s strictly-greater comparison — silent last-wins, array order. A preset adding a second `pane:'any'` binding on an existing key would be silently swallowed. **Move collision detection onto the default/preset merge path in `default-bindings.ts:25-32` before any preset ships.**

## Takeover hazards

| #       | Hazard                               | Why it bites                                                                                                                                                                                                                                                                                                                                                                                                          | Mitigation                                                                                                                                                                                                                    |
| ------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1**  | **Bare keys go dead**                | `eventTargetsTextEntry` (`use-app-keymap.ts:79,96-109`) returns true for any `<textarea>`, and the editor's focus target is one (`virtualizedTextViewHelpers.ts:162-163`). **Measured 39/88 mac, 38/70 win, 37/72 linux**: every arrow and Shift+arrow, Home/End, PageUp/PageDown, Backspace, Delete, Tab, F2, F3, Alt+Enter, Alt+Z… Silent; reads as "the editor is broken".                                         | `inEditorSurface(event)` exemption keyed on `[data-editor-surface]`, **in the same commit as the filter removal**. Verified by a **real-browser** test — happy-dom will not catch it.                                         |
| **H2**  | **Keyboard trap on Tab**             | `applyIndentCommand` returns `false` when `tabMovesFocus`, and `inputSelectionController.ts:1004-1010` states the mechanism verbatim: _"Refusing the command rather than consuming it is the whole mechanism: an unhandled key is not default-prevented."_ Platform prevents unconditionally (`use-app-keymap.ts:82`). Compounding: `toggleTabFocusMode` is one of the 35 orphans, so the exit does not exist either. | Prevent-if-handled **plus** binding `editor.action.toggleTabFocusMode`. **Both or neither.**                                                                                                                                  |
| **H3**  | Escape stops closing dialogs         | **REFUTED.** base-ui's `closeOnEscapeKeyDown` is a plain bubble-phase `document` listener (`useDismiss.js:416`, no capture flag) and never reads `defaultPrevented`. `stopPropagation()` from another listener on the same node does not suppress it. **Do not carry this claim into the work.** Keep prevent-if-handled anyway — its justification is H2 and `closeFind` returning false when the widget is shut.    |
| **H4**  | Wrong-editor routing                 | **Closed foundation.** FocusService resolves the event origin, current owner, exact destination, and deepest registered target; editor capabilities live on that target.                                                                                                                                                                                                                                              | Preserve the sole service and route every takeover command through CommandBus. Do not infer a target from mount order or keep another last-focused pointer.                                                                   |
| **H5**  | Stale-unmount race                   | **Closed foundation.** Focus targets use identity-safe registration tokens, so an older cleanup cannot remove a newer target.                                                                                                                                                                                                                                                                                         | Extend target capabilities in place if needed; do not add a second registry.                                                                                                                                                  |
| **H6**  | Diff panes leak commands             | **Closed foundation.** Diff sides register exact read-only targets, including tab and side identity, and writable conditions are evaluated by CommandBus.                                                                                                                                                                                                                                                             | Preserve exact destination identity and verify `Mod+Z` remains unclaimed on a read-only diff.                                                                                                                                 |
| **H7**  | Splits                               | FocusService is already target-per-DOM-owner and therefore split-ready.                                                                                                                                                                                                                                                                                                                                               | The takeover may add target facts, never singleton active-surface state.                                                                                                                                                      |
| **H8**  | Terminal                             | ghostty's `handleKeyDown` reaches the encoder branch for every ctrl/alt/meta chord and ends `preventDefault(), stopPropagation()` on its container, below `document`. **Ctrl/meta chords in the terminal never reach platform's bubble listener today.** Platform never sets `attachCustomKeyEventHandler` (grep: zero hits).                                                                                         | Unchanged by this plan. Chord arming in the terminal is 056's D2 and is gated on the ghostty-webgpu host swap (`plans/055`), not on this plan.                                                                                |
| **H11** | Loss of the stop-on-handled shield   | `keymap.ts:104-105` + `shouldStopPropagation` (`:126-130`) is undocumented and is the only thing keeping the two dispatchers from double-firing today. After the flip every editor key runs the full document path.                                                                                                                                                                                                   | Intended, but any future `document` listener registered after the keymap now sees keys it never used to. Note it in the keymap module header.                                                                                 |
| **H12** | Hotkey manager is a global singleton | `getHotkeyManager()` is process-wide with exactly one call site in either repo (`keymap.ts:99`). Two `@tanstack/hotkeys@0.8.0` module instances exist; `vite.config.ts:39` dedupes only react/react-dom.                                                                                                                                                                                                              | Platform never imports `getHotkeyManager` (grep: zero). Keep that an explicit invariant: **only data and types cross the repo boundary, never state.** After the takeover the manager has zero live registrations in the app. |
| **H13** | Find widget is a dead zone           | `EditorFindWidget.handleKeyDown` calls `stopPropagation()` as its **first statement on every keydown** (`find/src/findWidget.ts:208-209`; root hangs off `context.container`, a sibling of `scrollElement`). While find has focus **no platform binding fires** — not `Mod+P`, not `Mod+S`. True today; the takeover does not change it.                                                                              | Out of scope. Narrowing it wrongly means typing `d` in the find box deletes a line. Document it.                                                                                                                              |
| **H16** | Overrides degrade silently           | `appliedOverrides` (`active-bindings.ts:275-289`) skips any value failing `isBindableHotkey` **with no error**.                                                                                                                                                                                                                                                                                                       | 056 already widens the schema so bad values fail _parse_ (surfaced by `malformed-banner.tsx`) rather than validation. Greenfield: tell the user to delete the key.                                                            |

## Phases

Every phase leaves both repos green. Phases 1–2 are the cross-repo dance from §3.

### Phase 0 — Drift oracle _(platform only, no behaviour change)_

New `apps/web/src/keymap/tests/coverage-oracle.test.ts`: assert every command in `defaultEditorKeyBindings(platform)` — imported from the Editor **source**, not dist — is bound in `defaultPlatformKeyBindings(platform)`, modulo a written exception list of **35 entries on mac, 36 on win/linux**. Add a `dist`-vs-`src` guard so a stale `../Editor/dist` fails loudly rather than silently narrowing the comparison.

**Exit:** green with the exception list. The list shrinks to zero at Phase 6.

### Phase 1 — Editor: pack, subpath, additive `key` _(Editor only — §3 step A)_

Add `./keymap` to `exports`. Add `KeySpec`/`EditorPackBinding`/`EditorKeymapPack`. Add `key?: KeySpec` beside `hotkey?`, exactly one required via a union. Convert the ten platform-branching producers into one static pack with `platforms` as data. Fix the six mac bugs. Move the fold family onto `Ctrl+K` chords. Delete the `'clipboard'` pack member, give `showHover` a pack, narrow `EditorKeymapLayerSource`. Update `packages/lsp-plugin/test/codeActions.test.ts` and the nine `packages/editor/test/*` files asserting on `defaultEditorKeyBindings`. `bun run build`.

**Exit:** Editor `typecheck` + `test` green; `dist/` rebuilt; **platform CI green with no platform change** — this is the proof the step is additive.

### Phase 2 — Platform: consume the pack _(platform only — §3 step B)_

Import `@singapor/core/keymap`. `editor-commands.ts` stops declaring keys and keeps only titles, categories, icons and palette policy; the keys come from the pack. Add `packs/workspace-vscode.ts` and `packs/resolve.ts`. Move collision detection onto the merge path (§5). Migrate every producer and consumer to `key`.

**Exit:** the resolved table is a superset of today's plus the fold family; the Phase 0 oracle's exception list shrinks to the 7 platform-only commands; `bun run verify` green.

### Phase 3 — Editor: narrow _(Editor only — §3 step C)_

Delete `hotkey` from `EditorKeyBinding`; the union collapses to `key`. `bun run build`. **Mandatory. If this is not done, the plan is not done.**

### Phase 4 — Reconcile landed editor targets _(platform only; keymap untouched, `EditorKeymapController` still on)_

Audit every Editor mount against `apps/web/src/lib/focus/state/service.ts` and its existing
`useFocusTarget` registration: document editors, read-only search results, settings JSON, and every
diff side must retain exact IDs plus `{ dispatch, writable }`. Add `data-editor-surface` to the
owned frame only for DOM containment in the takeover listener; it is not a second registry.
Eventless palette/menu commands continue through `CommandBus`, whose resolver uses FocusService's
captured origin/current owner. Extend `FocusEditorCapability` or the command snapshot only for a
new fact proven necessary by the native pack.

**Exit:** no key behaviour changes; keyboard, palette, and menu dispatch all resolve the same exact
editor target. FocusService identity-safety and deepest-target tests remain green.

### Phase 5 — Preset setting and the unmapped ledger

`keybindings.preset` registered and wired in the same pass (§5 — never an inert key). Preset selector and `unmapped` ledger in `keybinding-section.tsx`. Regenerate `docs/settings-reference.md`.

**Exit:** toggling the preset changes real bindings; every dropped binding is reported through `shadowedBy`; the ledger is non-empty and visible.

### Phase 6 — The takeover _(one commit; half of it is a broken editor until the last line)_

Delete `isAppKeyBinding` from `use-app-keymap.ts`. Add the `[data-editor-surface]` exemption to
`eventTargetsTextEntry` (H1). Preserve the landed prevent-if-claimed contract: CommandBus calls the
resolved Editor capability synchronously, `ticket.claimed` reflects its boolean result, and the app
listener suppresses only a claimed command (H2). Collapse all three `useEditor` sites onto one
`DISABLED_EDITOR_KEYMAP`; delete `diff-options.ts` if it remains byte-equivalent. Absorb the 35
orphans. Bind `goToDefinition` to F12 and delete its reservation. Bind `toggleTabFocusMode`. Replace
`readonlyEditorKeymapLayers` with `when: ['editorWritable']`; delete only the now-unused bridge code
in `editor-keymap.ts`. Delete the duplicate `editorKeymapLayers` prop chain wherever the drift check
finds it; do not delete `CommandProvider`'s one resolved binding table.

`components/app-runtime-content.tsx` · `components/app-workspace.tsx` · `features/chat-mode/components/{layout,surface-view,tool-pane}.tsx` · `features/editor/components/editor.tsx` · `features/search/components/{result-editor-surface,result-editor-virtual-window,result-file-editor-pool-slot,result-file-editor}.tsx` · `features/settings/components/{json-view,page}.tsx` · `features/workbench/components/{code-panel,editor-surface-layout-view,editor-surface-tab-body,file-editor-body,layout,sidebar-panel}.tsx` · `features/workspace/components/{search-pane,search-results,view}.tsx`

**Exit — verified in a real browser at the running dev server, not by `dom` tests:** ArrowDown / Backspace / Home / PageUp / Tab all still work inside the editor; Tab escapes the editor with tab-focus mode on and `Control+Shift+M` toggles it back; Escape closes a dialog opened over a focused editor; `Mod+[` outdents in the editor and navigates back outside it; `Mod+Z` in a diff pane does nothing rather than undoing in the file editor behind it; F12 opens Go to Definition; `Ctrl+K Ctrl+0` folds all. Phase 0's exception list is empty.

### Phase 7 — `when` predicate union

Extend `CommandWhen` and `utils/when.ts` with `editorTabMovesFocus` and any other proven Editor read
facts. `editorWritable` and the shared evaluator already exist. Keep evaluation in
`CommandBus.inspect()`; the chord trie may filter candidates by bus inspection but may not own a
second context model.

**Exit:** each key lands with the binding that needs it; `readonlySafeEditorCommandPacks` has no platform consumer left; 056's D16 is closed.

### Phase 8 — Editor read side _(the second cross-repo phase)_

`findWidgetVisible` and `inlineSuggestionVisible` via an optional `onKeymapContextChange?: (snapshot) => void` on **`EditorOptions`**, not a `packages/react` addition — `packages/solid/src/index.ts:55,70,227,248` forwards `keymap` as a first-class binding layer with its own test, and an option-callback survives both wrappers because Solid spreads `...constructorOptions`.

**Exit:** Escape becomes two `when`-gated candidates and `commandRouter.ts:45-49`'s fall-through becomes deletable.

## Test plan

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project node --project dom src/keymap
```

```bash
cd /Users/shaul/Desktop/D/Editor/packages/editor && bun run build && bun run test
```

**The three checks that actually matter are browser-project, because H1, H2 and H6 are all invisible in happy-dom:**

- ArrowDown, Backspace, Home, PageUp and Tab inside a mounted, focused editor after the filter removal.
- Tab escaping the editor with `tabMovesFocus` on, and `Control+Shift+M` restoring it.
- `Mod+Z` in a diff pane not undoing in the file editor behind it.

There is no trusted keyboard input in this repo today: `vitest.browser.config.ts:46-53` registers exactly four `browser.commands`, all mouse. **This plan must add a `proofKeyPress` command wired to `context.page.keyboard`** — deferred as follow-up in 056, but a hard prerequisite here, because Phase 6's exit criteria cannot otherwise be verified.

Editor-side: the nine `packages/editor/test/*` files asserting on `defaultEditorKeyBindings` become pack assertions; add one asserting the fold family is chorded and no pack row uses a bare `Alt+<letter>` on mac.

## Out of scope

| Deferred                                                 | Why                                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| vim / sublime / IntelliJ presets                         | A vim keymap is a modal input mode, not a key table. The picklist stays two members and the description says why.             |
| VS Code's `ContextKeyExpr` grammar, user-authored `when` | §6's closed union covers every default. Revisit when user-authored `when` is a real requirement.                              |
| `or` in `when`                                           | Two rows express it.                                                                                                          |
| Command arguments in the pack                            | `editor.foldLevel${n}`'s enumeration is the precedent. `cursorMove` / `editorScroll` / `insertSnippet` go to `unmapped`.      |
| Three-step chords                                        | VS Code ships no three-step default; `KeySpec` is a 1-or-2 tuple so the pack cannot express what the resolver will not run.   |
| Terminal key parity (`workbench.action.terminal.*`)      | ghostty owns raw input (H8). Fixing `Mod+P`-in-terminal needs `attachCustomKeyEventHandler`; that is `plans/055`'s territory. |
| Narrowing `findWidget.handleKeyDown`'s `stopPropagation` | Real (H13) and cross-repo. Getting it wrong means typing `d` in the find box deletes a line.                                  |
| Migrating existing `keybindings.overrides` documents     | Greenfield: delete the key, write no healing code.                                                                            |
| Distinguishing `editorTextFocus` from `editorFocus`      | Nothing distinguishes them today. One more boolean on the Phase 8 read side when needed.                                      |

## Drift check

| Location                                                        | Must still say                                                                 | Why it matters                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml:19`                                   | `EDITOR_REF: main`                                                             | If it becomes pinned, §3's three-step dance collapses to one atomic change. **Check this first — it changes the whole plan shape.** |
| `apps/web/vite.config.ts:74-99`                                 | `editorSourcePlugin`, `apply: 'serve'`, all-or-nothing per package             | The `./keymap` subpath needs its `exports` entry before dev resolution works.                                                       |
| `Editor/packages/editor/package.json`                           | `exports` has no `./keymap`; `files: ["README.md","dist"]`                     | Phase 1's first edit.                                                                                                               |
| platform `package.json` `workspaces.packages`                   | excludes `packages/editor-*`                                                   | Platform never typechecks Editor source; breakage is invisible until a rebuild.                                                     |
| `Editor/packages/editor/src/editor/keymap.ts:663-685`           | `foldingBindings` uses `Mod+Alt+<digit>`                                       | The collision this plan dissolves.                                                                                                  |
| `apps/web/src/keymap/workspace-commands.ts:127`, `:828`, `:838` | `Mod+Alt+${position}`, `Mod+Alt+]`, `Mod+Alt+[`                                | The other half of the collision.                                                                                                    |
| `apps/web/src/keymap/editor-commands.ts`                        | `grep -c fold` returns **0**                                                   | The folding-has-no-keys premise.                                                                                                    |
| `apps/web/src/keymap/active-bindings.ts:168`, `:257`            | the empty-override early return; strictly-greater tie-break                    | Why collision detection must move onto the merge path before a preset ships.                                                        |
| `apps/web/src/keymap/use-app-keymap.ts`                         | `isAppKeyBinding`; the text-entry gate; suppression only when `ticket.claimed` | Phase 6 removes the bridge while preserving the landed H1/H2 claim contract.                                                        |
| `Editor/.../virtualizedTextViewHelpers.ts:162-163`              | the focus target is a `<textarea>`                                             | H1's mechanism. Re-measure the 39/88 figure if the element changes.                                                                 |
| `Editor/.../inputSelectionController.ts:1004-1010`              | "Refusing the command rather than consuming it is the whole mechanism"         | H2's mechanism, stated by the Editor itself.                                                                                        |
| `Editor/packages/find/src/findWidget.ts:208-209`                | `stopPropagation()` as the first statement                                     | H13.                                                                                                                                |
| `apps/web/src/lib/focus/state/service.ts`                       | identity-safe tokens, exact editor target IDs, `{ dispatch, writable }`        | H4-H7 are landed prerequisites, not work to recreate.                                                                               |
| `packages/lsp-plugin/test/codeActions.test.ts:5`, `:233`        | imports `readonlySafeEditorCommandPacks`                                       | The consumer outside `packages/editor` that must move with it.                                                                      |
| `packages/solid/src/index.ts:55,70,227,248`                     | forwards `keymap` as a first-class layer                                       | Why Phase 8 is an `EditorOptions` field, not a React-package addition.                                                              |
| `apps/web/vitest.browser.config.ts`                             | `proofKeyPress` and the command/focus browser acceptance file                  | Extend the existing trusted-input infrastructure for Phase 6.                                                                       |
| `Editor/packages/editor/dist` freshness                         | `defaultEditorKeyBindings('mac')` from `dist` returns the same count as `src`  | A stale dist silently narrows the Phase 0 oracle.                                                                                   |
