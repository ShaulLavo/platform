# Plan 057: Standalone Editor chords and shared Platform keymap

> **Executor:** Read this plan and both repositories' `AGENTS.md` and `CLAUDE.md` before editing.
> Resolve the Editor checkout through the installed `@singapor/core` link. Read the installed
> `never-nester` skill. Reconcile current source before applying the file map below.
> This implementation spans Platform and Editor. Follow the cross-repository delivery section.
> Do not create a branch, commit, push, or PR without authorization in the session.

## Status

- **State:** In progress. Dependency pin and binding comparison prepared; see [baseline](057-baseline.md).
- **Priority:** P2
- **Effort:** XL
- **Risk:** High. Shortcut ownership changes can break navigation, text editing, or focus without a type error.
- **Category:** Implementation plan
- **Depends on:** [Plan 056](056-multi-step-chord-keymap.md), implemented at Platform `0f5b0618`,
  and the existing `CommandBus` and `FocusService`.
- **Source reconciliation:** Platform `0f5b0618`, Editor `d31e730`, and installed
  `@singapor/core` 0.1.2. Concurrent environment work can move Platform providers and command wiring.

## Required outcome

A standalone Editor consumer declares a chord through the normal keybinding API. The Editor
handles matching, prefix consumption, timeout, cancellation, and command execution automatically.
The consumer does not install Platform, register a document listener, create a command bus, or
disable the Editor keymap to use chords.

Platform uses the same reusable runtime with its combined app and editor binding table. Embedded
editors disable their separate shortcut runtime with the existing `keymap.enabled: false` option.
Platform selects the focused target and dispatches the command through its existing bus.

Deliver both modes. Chord-shaped types, preset data, or Platform-only browser tests do not prove
that the Editor package supports chords. The standalone execution gate must pass before the
Platform takeover begins.

## Current behavior and the gap

- Platform supplies single-stroke editor bindings through `keymap/editor-keymap.ts`.
  Editor mounts use `defaultBindings: false` plus the supplied layers.
- `defaultBindings: false` removes built-in bindings. It does not disable supplied layers.
  Editor's `enabled: false` option unregisters its shortcut bindings.
- Editor's `EditorKeyBinding.hotkey` accepts one `RegisterableHotkey`. Its controller registers
  those bindings individually with TanStack's `getHotkeyManager()`.
- Plan 056 introduced Platform's `chord: KeyChord`, canonical space-separated `keys`, trie,
  sequence machine, and DOM session. Editor chords bypass the single-stroke bridge and dispatch
  through `CommandBus`. Single-stroke editor bindings still run inside Editor.
- Platform's terminal host forwards keydown and keyup to the shared Platform session before
  Ghostty encodes input. This is implemented and browser tested.
- The earlier version of this plan changed Editor binding types and folding presets without
  specifying standalone sequence execution. This revision closes that gap.

The remaining split can hide an app chord prefix behind an editor single shortcut. Both integrations
using TanStack does not give them one pending sequence or a combined binding table.

## Package boundary

### Put the reusable runtime in the Editor package

Export `@singapor/core/keymap` through a new package entry point,
`packages/editor/src/public/keymap.ts`. Put the reusable implementation under
`packages/editor/src/keymap/`. Keep `EditorKeymapController` as the Editor-specific adapter.

The public entry point exposes chord types, static editor packs, and the runtime factory. The
generic runtime must not import `Editor.ts`, React, Platform commands, settings, `FocusService`,
or Platform logging. Type-only references in editor pack definitions may name `EditorCommandId`.
Importing the built entry point must work without a DOM. Runtime creation requires a supplied DOM root.

Move reusable behavior from Plan 056 into this implementation. After Platform adopts it, delete
Platform's duplicate matcher, sequence machine, and DOM lifecycle implementation. Keep Platform's
settings resolution, command metadata, focus policy, and logging adapter in Platform.

Use TanStack for stroke grammar and normalization. Preserve Plan 056's tested keyboard-layout
matching behavior. Its `SequenceManager` was rejected because prefixes were not consumed and
timeouts depended on another key event. Moving the code must preserve real timers, Hebrew and
Cyrillic physical-key fallback, and the AZERTY printed-letter guard.

### Make ordinary Editor use automatic

The following is the proposed binding shape, not an API already shipped:

```ts
const keymap: EditorKeymapOptions = {
  layers: [
    {
      id: 'custom',
      bindings: [{ chord: ['Mod+K', 'Mod+C'], command: 'editor.action.commentLine' }],
    },
  ],
}
```

Single strokes use the same field, such as `chord: ['Mod+/']`. Editor construction creates and
owns its runtime automatically. `setKeymap()` updates that runtime. Disposing the Editor disposes
the runtime. Two standalone editors have independent pending state and cannot complete each
other's chords.

`keymap.enabled: false` disables shortcut matching only. Native typing, composition, clipboard,
selection, and widget input handling remain active. Do not remove the Editor's input controller.
Disabling cancels pending state and stops matching new shortcuts. If a consumed key is still held,
retain only the ownership handlers needed to swallow its repeats and release. Re-enabling resumes
exactly one matcher with the current bindings. Final Editor disposal removes all handlers.

### Let Platform own its combined table

Platform creates one runtime for its existing command provider lifetime. It merges editor presets,
workspace bindings, and user overrides before matching. For example, an editor comment chord and
the Settings chord can share `Mod+K` and resolve from the same pending sequence.

Platform passes command availability and dispatch callbacks to the runtime. Those callbacks use
`CommandBus` and the exact `FocusService` target. Embedded editors use `enabled: false`; their
public command capability remains callable. The existing terminal hook forwards to this same
runtime's `claimKeybinding()` method.

The existing off switch is sufficient for this integration. Do not require every Editor consumer
to inject a runtime or introduce another mandatory provider. Runtime instances are caller-owned;
neither integration depends on a TanStack singleton coordinating another package instance.

## Binding and runtime contract

### Use one chord representation

Export `KeyChord` from the shared keymap entry point. Reuse Plan 056's non-empty readonly tuple
of `RegisterableHotkey` strokes. Migrate Editor's `hotkey` field to `chord` and update every
producer and consumer. Do not introduce the old proposal's competing `key: KeySpec` spelling.

Keep canonical `keys` strings where Platform settings and display require them. Normalize each
stroke separately. Preserve object-form `RawHotkey` values for modified punctuation.
Platform's settings contract retains its two-stroke cap and existing string representation.
The generic trie remains capable of deeper sequences; importing it does not import Platform's
settings limit or require expanding Platform's recorder.

Editor preset rows contain editor command IDs, chords, platform restrictions, and any explicit
editor conditions needed by the preset. Platform owns `workspace.*` rows and maps editor rows into
its command table. The shared engine treats the binding payload as generic data.

### Keep host policy outside the engine

Implement a factory with these responsibilities. Final symbol names may follow existing Editor
conventions, but the ownership and behavior are required:

| Input or operation       | Contract                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| DOM root                 | A supplied `HTMLElement` for a standalone editor or `Document` for Platform. Resolve listeners against its owner document.            |
| Bindings                 | Readonly, ordered binding candidates. A binding carries a `chord` and a generic payload.                                              |
| Capture context          | Capture the adapter's current context once per stroke. Every candidate for that stroke sees that snapshot.                            |
| Check availability       | A synchronous adapter callback evaluates a candidate against that context. The engine has no command-policy union of its own.         |
| Dispatch                 | A synchronous callback returns whether the command claimed the event. Async work may continue after that claim.                       |
| Pending notification     | Report the matched prefix and candidate count for optional UI. Ordinary Editor consumers do not need to subscribe.                    |
| Lifecycle notification   | Report one completed or cancelled sequence to an optional host callback. Platform adapts this to its wide event logging.              |
| `claimKeybinding(event)` | Process a keydown or keyup once by event identity, including events forwarded by a terminal host. Return whether the runtime owns it. |
| Binding update           | Replace the table and cancel pending state. Retain ownership of consumed keys until release where the current lifecycle permits it.   |
| Context cancellation     | Let the adapter cancel on target or context replacement without recreating the runtime.                                               |
| Enable or disable        | Stop matching new shortcuts when disabled. Retain consumed-key ownership through release; re-enable without duplicate matching.       |
| Disposal                 | Remove all listeners, timers, subscriptions, and pending state when the owning Editor or Platform provider is disposed.               |

The Editor adapter supplies editor context and calls the editor command dispatcher. Platform's
adapter supplies its bus snapshot and focus target. Framework wrappers forward Editor options;
React must not become a prerequisite for the core package.

### Preserve event ownership

Carry Plan 056's regression coverage into the shared implementation:

- A prefix arms only when at least one continuation is available in the current context.
  An unavailable prefix passes through untouched.
- A single shortcut consumes its event only when dispatch claims it, subject to the binding's
  explicit event-handling options. A declined Tab command must leave browser focus traversal intact.
- Once a prefix is consumed, the runtime owns its continuation. Consume an unmatched continuation
  and a completion whose command has become unavailable. Cancel without replaying text or shell input.
- Install continuation capture synchronously. Rendering a pending indicator must not control
  whether the next key reaches the sequence.
- Use a real five-second timer. Repeats do not re-arm a prefix or extend its timeout.
- A chord-owned held key cannot trigger a standalone shortcut or leak text after completion,
  mismatch, or timeout. Consume the corresponding keyup. Preserve ordinary single-key repeat behavior.
- Ignore IME composition and the `keyCode === 229` pre-composition signal.
- Cancel on blur, hidden document, pointer interaction, binding replacement, and target changes.
  A standalone editor also cancels when focus leaves its root. Platform subscribes to its exact
  focus owner so a move within one pane cancels synchronously.
- Scope idle matching to the supplied root. Independent standalone editors must not steal each
  other's events. Preserve local widget handling before idle shortcuts.

Keep the timer internal for this plan. No new application timeout setting is required.

### Preserve conditional alternatives until matching

Plan 056's trie keeps one terminal binding, and its active-binding selection deduplicates exact keys.
That representation cannot support ordered alternatives with different conditions.

Store ordered terminal candidates and retain the prefix branches needed by conditional alternatives.
Evaluate availability before choosing the first stroke and again on continuation. An eligible
single-stroke candidate wins over a longer sequence on the same prefix. An ineligible candidate
must not erase an otherwise available alternative during table construction.

Keep explicit user-override shadowing as configuration policy before runtime matching. Preserve the
reviewed behavior where a discarded override cannot shadow another surviving binding. Built-in
conditional alternatives must survive the merge, pane ordering, and trie construction until their
conditions can be evaluated. Do not pass them through an unconditional `Map<keys, binding>`.

Define and test stable precedence for preset, pane, and candidate order. If a candidate dispatches
but declines, follow the documented ordered fallback policy without executing a command twice.
After a claimed prefix, fallback failure still consumes the continuation.

## Editor presets and command context

Keep the editor-native default pack and VS Code parity work. Move folding onto its chord family,
correct the macOS find and replace bindings, and account for every editor command previously
missing from Platform. Generate the current difference instead of assuming the old count of 35.

Resolve the existing silent-drop cases while migrating the pack: verify the empty `clipboard`
command-pack member, `showHover` pack membership, and unused layer-source variants. Delete a
variant only after checking all Editor packages and Platform consumers.

The Editor package must execute its own pack conditions. Expose only the public editor context
needed by those conditions, such as writable state, selection, Tab focus mode, and visible widgets.
Keep editor condition names independent of Platform's `CommandWhen` type.

Platform maps those conditions into its existing evaluator. Preserve existing members such as
`workspaceEditUndoable`, `workspaceEditRedoable`, and `workspaceMutable`. Add facts to the resolved
editor capability or bus snapshot only when a concrete preset row needs them. Capture those facts
fresh for both strokes. Do not introduce another last-focused pointer, target registry, or
availability store.

Complete the required read-side API and condition mapping before disabling the embedded editor
matcher. Apply `editorWritable` to mutating commands. Navigation, selection, and other safe commands
must continue to work in read-only editors.

## Settings and diagnostics

Preserve application-scoped `keybindings.overrides`, its canonical strings, and the two-stroke
recorder. The shared runtime does not own settings persistence.

Keep the proposed `keybindings.preset` selector scoped to `application`. Register and wire it in
the same pass as its consumer. Offer `default` and `vscode` only when they select distinct,
implemented packs. Resolve the preset before user overrides. Regenerate the settings reference
and JSON Schema after registry changes. Vim remains outside this static-preset work.

Resolve preset collisions before matching, including configurations without user overrides.
Distinguish intentional conditional alternatives from accidental duplicates and unreachable prefixes.
Record binding identity and a reason for a discarded row.

The current `shadowedBy` field reports a command losing all its bindings to another command.
It does not describe partial alias loss, reservations, preset omissions, or every cross-pane drop.
Use `effectiveKeys` for surviving aliases and add an explicit resolution report for the remaining
cases. Show unsupported VS Code rows in an `unmapped` list. Do not label every omission as shadowing.

The existing contract checks string length and one- or two-stroke whitespace shape. Stroke grammar
is checked separately by `isBindableChord`. Preserve that distinction in diagnostics and tests;
do not claim that every invalid hotkey spelling is rejected by the JSON Schema.

## Cross-repository delivery

Recheck these facts before implementation:

- Platform uses linked `@singapor/*` packages from the sibling Editor checkout.
- Platform development can resolve Editor source, while typechecking and production consume its
  exported build artifacts. Rebuild Editor and compare source and built behavior explicitly.
- `@singapor/core` currently has no `./keymap` export. Its build derives entry points from package
  exports, so add `dist/public/keymap.js` and `dist/public/keymap.d.ts` through that mechanism.
- Platform CI currently sets `EDITOR_REF: main`. Its setup uses `git clone --branch`, which accepts
  branch or tag names and is not sufficient for checking out an arbitrary commit SHA.

Before publishing the incompatible Editor binding change, make Platform's Editor dependency
reproducible. Add commit-ref checkout support to the existing setup action and pin the current
known-good Editor commit. Verify that baseline pairing first. Then deliver the complete Editor
runtime and API change, and update Platform's pinned ref with its consumer migration.

Migrate Editor's own wrappers, plugins, tests, and examples with its binding API. Migrate every
Platform caller with the shared-runtime adoption. Do not add a permanent `hotkey` alias or an
optional `hotkey`/`chord` union. Local intermediate revisions may require the paired consumer
changes before Platform typechecks; the standalone Editor gate must already pass.

Keep the immutable dependency ref after delivery. A built package test must exercise the public
subpath, and the final Platform checks must use the exact Editor artifact named by that ref.
Do not merge only tuple-shaped folding data while the standalone controller still registers
single hotkeys. Do not disable embedded Editor shortcuts before Platform's replacement path works.

## Implementation phases

Each phase ends with a concrete proof. Required dependency checks are separate from feature tests;
avoid repository-wide test runs when a focused test proves the behavior.

### Phase 0: Reconcile the source and record the baseline

Resolve both checkouts and read their local instructions. Inspect all Editor mounts, command-pack
consumers, framework wrappers, and package exports. Prepare the reproducible CI pairing described above.

Create a repeatable comparison of Editor source, built exports, and Platform's resolved bindings
on macOS, Windows, and Linux. Compare normalized row contents, platform restrictions, command IDs,
and conditions, not just counts. Record missing editor commands separately from Platform-only
commands and intentional reservations. The comparison must detect a stale build with the same row count.

Reuse Plan 056's regression and browser fixtures as the Platform baseline. Record the current
matcher benchmark so extracting the engine cannot quietly restore a linear scan per key event.

**Exit:** a reproducible binding report, exact source revisions, and a working baseline dependency
pairing. No shortcut behavior changes yet.

### Phase 1: Ship working standalone Editor chords

Implement the generic runtime and public `./keymap` entry point. Migrate `EditorKeyBinding` to
`chord` across Editor packages. Replace the controller's single-hotkey registrations with an
automatically owned runtime. Wire binding updates, disable, re-enable, focus cancellation, and disposal.

Move the reusable Plan 056 behavior and its focused tests into the shared module. Adapt command
and focus callbacks without importing Platform. Add standalone trusted-input tests against real
Editor construction and the built package entry point.

**Exit:** a standalone editor executes a supplied chord through its ordinary options. Prefixes,
timeout, held keys, cancellation, and multiple editor instances pass the standalone checks below.
No Platform provider or manually installed keyboard listener is used by that consumer.

### Phase 2: Complete the Editor presets and conditions

Convert built-in bindings into exported static packs. Correct the macOS bindings and add the
folding and remaining VS Code chord families. Supply the editor context and conditional candidate
behavior needed to execute those presets. Update affected wrappers and examples.

**Exit:** a standalone editor executes an actual default folding chord and a custom chord.
Pack-content assertions and trusted execution tests both pass. The Editor package passes its
required build and typecheck, and the built public subpath exposes the same rows and runtime.

### Phase 3: Integrate Platform in one change

Prepare target policy before disabling Editor matching, but deliver the following steps together.
Update the pinned Editor ref and remove the old bridge in this same Platform change. There is no
intermediate release where the old `hotkey` bridge consumes Editor's new `chord` API, and no
temporary bridge migration to maintain between phases.

#### Complete resolution and target policy first

Consume editor pack definitions instead of re-authoring their keys. Keep Platform titles,
categories, icons, aliases, and palette policy in its command registry. Merge workspace rows,
presets, and user overrides with explicit collision reporting and ordered conditional alternatives.

Map Editor conditions into the existing bus evaluator. Audit document editors, settings JSON,
search results, and each diff side for exact focus identity and capabilities. Complete all required
read-side and Tab-mode facts now. Wire the preset selector and resolution report to real consumers.
Register the supported imported commands, including folding, Go to Definition, and Tab focus mode.
Remove F12's reservation with its executable replacement. The Tab-focus-mode binding must exist
before switching off the embedded matcher.

Verify the combined table, conditions, and target routing through focused policy tests before the
following replacement. This is preparation within one change, not a separately runnable app checkpoint.

#### Replace Platform's engine and disable the embedded matcher

Use `@singapor/core/keymap` for Platform's existing provider-owned session. Keep the hook as React
wiring and the bus, focus, and logging callbacks as Platform adapters. Point the terminal's existing
capture hook at that same runtime.

Remove the editor-single filter in `keymap/utils/app-bindings.ts`. Switch all embedded Editor
mounts to the shared `enabled: false` configuration. Remove the unused binding-layer prop chains
and bridge functions from `keymap/editor-keymap.ts`. Preserve any command-ID conversion still used
by dispatch. Keep the provider's one resolved binding table.

Update `keymap/utils/keyboard-event.ts` so bare editing keys work on the actual registered editor
text-input target. A blanket exemption for every descendant of `[data-editor-surface]` is unsafe:
find, rename, and other nested inputs must keep their own text-entry behavior. Use existing target
capabilities and precise containment, then verify it in a browser.

Delete Platform's superseded trie, machine, and session implementations. Move generic tests with
their implementation and retain Platform integration tests. Preserve `claimKeybinding`, pending UI,
and the one lifecycle log event through the host adapter.

**Exit:** Platform has one matching runtime for app and editor bindings. Shared-prefix commands
dispatch exactly once to the correct target, and terminal input retains Plan 056 behavior. The
complete trusted-input matrix below passes against the pinned Editor build.

### Phase 4: Close parity and document both consumers

Close the binding report against the delivered presets and command registrations. Account for every
remaining unsupported row in the resolution report. Required folding, Go to Definition, and Tab
focus mode bindings already exist before the takeover; do not defer them to this phase.

Document ordinary standalone binding configuration first in the Editor package. Then document
optional host ownership with `enabled: false`, the public runtime, and editor command dispatch.
Update Platform's keymap status, plan index, and generated settings artifacts where applicable.

**Exit:** the final report has no unexplained omissions, both usage modes have examples, and no
duplicate runtime, old binding field, or obsolete bridge remains.

## Verification

### Shared runtime

Use focused tests for ordered candidates, exact and prefix conflicts, and context changes between
strokes. Preserve the layout, IME, timer, repeated-key, event-identity, and release-ownership tests
from Plan 056. Include the discarded-override sibling case in Platform's policy tests.

Prove that the engine import needs neither React nor an import-time DOM. Exercise the built
`@singapor/core/keymap` export through package resolution. Compare source and built binding contents.
Run the before-and-after matcher benchmark on the same workload and verify equal match results.

### Standalone Editor, required before Platform takeover

Use trusted browser keyboard input and the real public Editor API:

| Scenario                                                      | Required observable                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Custom two-stroke binding in ordinary options                 | The editor command executes once without external keyboard wiring.                                           |
| Default folding chord                                         | A real fold changes the visible document through the shipped preset.                                         |
| Prefix and continuation                                       | The command runs only after completion, and neither stroke inserts text.                                     |
| Timeout, mismatch, blur, or pointer cancellation              | No stale command runs and no consumed input is replayed.                                                     |
| Held prefix, held completer, and held unmatched key           | No duplicate execution, standalone-shortcut collision, leaked text, or orphan release.                       |
| Two editor instances and a focus move                         | Pending state stays instance-local and is cancelled when leaving its owner.                                  |
| Binding replacement, disable, re-enable, and disposal         | Old bindings stop, pending state clears, and no duplicate listeners remain.                                  |
| Disable while a consumed key is held, release, then re-enable | Held repeats and release stay consumed; new shortcuts remain disabled until re-enable and then execute once. |
| `enabled: false`                                              | Shortcut matching stops while typing, IME, clipboard, and native selection handling still work.              |
| Read-only editing and Tab focus mode                          | Navigation survives, mutation is refused, and an unclaimed Tab moves focus.                                  |
| Local find or completion input                                | Local widget behavior survives idle shortcut matching.                                                       |

### Platform with the shared runtime

Extend the existing `keymap/tests/command-focus.browser.tsx` and
`features/terminal/tests/keybindings.browser.tsx`. Reuse `proofKeyPress`, `proofKeyDown`, and
`proofKeyUp` from `vitest.browser.config.ts`.

- Complete an editor chord and an app chord sharing a prefix. Verify exactly one dispatch,
  correct editor destination, and no duplicate match from an embedded Editor controller.
- Exercise ArrowDown, Backspace, Home, PageUp, selection, and Tab inside the real editor input.
  Verify that Tab can escape and the Tab-focus-mode command can restore editing behavior.
- Verify that a nested text input retains local editing and does not receive editor deletion commands.
- Exercise read-only diff sides and search-result editors. Undo and other mutations must not reach
  a writable editor behind them. Read-only navigation must still work.
- Exercise pane changes, same-pane editor changes, and unmount while a chord is pending.
- Verify conditional fallback on both strokes and consumption after an already claimed prefix.
- Exercise the Settings chord in the terminal, ordinary shell input, declined single commands,
  timeout, and Kitty key releases through the real Ghostty engine.
- Verify Settings recording, surviving-alias search, preset changes, and explicit conflict reporting.
- Recheck dialog Escape and editor-local widgets after the ownership change. Do not infer safety
  solely from `defaultPrevented` or synthetic DOM events.

Run app node and DOM tests with `bun --bun vitest`; run browser tests through the separate browser
config without `--bun`. Follow Editor's own test scripts for package tests. Reuse a running dev
server for manual smoke checks. Existing browser-test server fixtures are the automated path.
Complete required typechecks, package builds, scoped lint, and generated settings freshness checks.

## Remaining boundaries

- Full Vim or other modal keymaps, user-authored condition expressions, and Platform recording of
  more than two strokes are outside this plan.
- Do not replace the existing `CommandBus`, focus registry, terminal input engine, or native Editor
  input controller as part of moving shortcut ownership.
- The current find widget can stop bubbling keys before Platform sees them. Preserve local behavior,
  test the boundary, and document any remaining app-shortcut restriction. A broad capture listener
  or blanket editor-container exemption is not an acceptable shortcut around that restriction.
- Do not introduce a terminal-specific chord runtime or a setting to choose between two matchers.
- The previous audit's command counts and absolute macOS paths are historical. Use Phase 0's report
  and resolved checkout paths for implementation decisions.

## File map to reconcile before implementation

| Area                                   | Current or proposed location                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Shared public API, proposed            | `Editor/packages/editor/src/public/keymap.ts` and the package `./keymap` export                                       |
| Shared runtime and types, proposed     | `Editor/packages/editor/src/keymap/`                                                                                  |
| Automatic Editor adapter               | `Editor/packages/editor/src/editor/keymap.ts`, `EditorKeymapController`                                               |
| Editor input and read-side facts       | `Editor/packages/editor/src/editor/Editor.ts`, input controller, and the relevant widget packages                     |
| Editor framework consumers             | `Editor/packages/react/` and `Editor/packages/solid/`                                                                 |
| Platform engine being extracted        | `apps/web/src/keymap/utils/{chord,keymap-trie,chord-machine}.ts`, `state/chord-session.ts`                            |
| Platform React and command integration | `apps/web/src/keymap/use-app-keymap.ts`, `providers/command-provider.tsx`, existing bus and runtime modules           |
| Platform filtering and input policy    | `apps/web/src/keymap/utils/app-bindings.ts`, `utils/keyboard-event.ts`, `editor-keymap.ts`                            |
| Preset and override policy             | `apps/web/src/keymap/{default-bindings,active-bindings,editor-commands,workspace-commands}.ts`                        |
| Target and condition evaluation        | `apps/web/src/lib/focus/state/service.ts`, `keymap/define-command.ts`, `keymap/utils/when.ts`                         |
| Terminal handoff                       | `apps/web/src/features/terminal/hooks/use-keybindings.ts`                                                             |
| Settings                               | `apps/web/src/features/settings/`, `packages/contracts/src/settings/keys.ts`                                          |
| CI dependency pairing                  | `.github/workflows/ci.yml`, `.github/actions/setup/action.yml`                                                        |
| Existing browser proof                 | `apps/web/src/keymap/tests/command-focus.browser.tsx`, `apps/web/src/features/terminal/tests/keybindings.browser.tsx` |
