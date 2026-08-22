# Plan 056: Multi-Step Chord Support in the Platform Keymap

> **Executor:** Read this plan in full before editing. Then read `/Users/shaul/Desktop/D/platform/AGENTS.md`, `/Users/shaul/Desktop/D/platform/CLAUDE.md`, and `/Users/shaul/.agents/skills/never-nester/SKILL.md`. Keep nesting at three levels or less. Work only in the files listed under **File-by-file scope**. Run the drift check in §11 before writing code — uncommitted LSP work is shifting line numbers in `packages/contracts`, so locate contracts symbols by name, not by number. Do not create a branch, worktree, commit, push, or PR unless the user explicitly asks.

## Status

- **State:** Ready
- **Priority:** P2
- **Effort:** L
- **Risk:** Medium
- **Category:** Feature
- **Depends on:** nothing. The Editor repo changes by zero lines (§6).
- **Blocks:** the editor-native VS Code keymap (§6, "Companion plan"), and three `cmd+k` defaults already listed as blocked in `docs/vscode-keymap-development.md`
- **Planned against:** platform `546a4c84`, Editor `899b3f3`, `@tanstack/react-hotkeys@0.10.0`, `@tanstack/hotkeys@0.8.0`, 2026-08-22

## Problem statement

`PlatformKeyBinding` holds exactly one keystroke, and the type is a hard wall. `keys: string` plus `hotkey: RegisterableHotkey` (`apps/web/src/keymap/types.ts:33-43`), where `RegisterableHotkey = Hotkey | RawHotkey` and `Hotkey` is a closed template-literal union. `const k: Hotkey = 'Mod+K Mod+S'` is `TS2322`.

The runtime is worse than the type. Measured against the installed libraries:

| input           | `parseHotkey(_, 'mac')`  | `normalizeRegisterableHotkey` | `validateHotkey`                               |
| --------------- | ------------------------ | ----------------------------- | ---------------------------------------------- |
| `'Mod+K Mod+S'` | `{key:'S', meta:true}`   | **`'Mod+S'`**                 | `valid:false`, `["Unknown modifier: 'K Mod'"]` |
| `'Ctrl+W V'`    | `{key:'W V', ctrl:true}` | `'Control+W V'`               | `valid:true`, warn `Unknown key: 'W V'`        |

`parseHotkey` splits on `'+'` only and silently drops an unrecognised middle part. **A chord string does not throw — it collapses to its last stroke and steals that key.** `validateHotkey`'s verdict flips on where the space falls, so it is unusable as a chord check in either direction.

Four things the current model cannot express or survive:

1. **No prefix relation exists in the data.** `collidesWith` (`active-bindings.ts:228-232`) is string equality plus a pane compare. `'Mod+K'` vs `'Mod+K Mod+S'` reports _no conflict_ — the one conflict that matters.
2. **The per-pane arbiter is also exact-keys.** `selectActiveBinding` (`active-bindings.ts:247-259`) keys a `Map<string, SelectedBinding>` on `binding.keys`; a prefix and its chord land in different slots and both survive.
3. **One event, one decision.** `platformKeyBindingForKeyboardEvent` (`active-bindings.ts:90-108`) returns `ParsedPlatformKeyBinding | null`. There is no third answer for "prefix armed".
4. **No pending state anywhere.** `runAppKeymap` (`use-app-keymap.ts:72-89`) is stateless, and the keymap reads neither `event.repeat` nor `event.isComposing` (verified: `grep -rn '\.repeat\b|isComposing' apps/web/src/keymap/` returns only `'b'.repeat(40)` in a test).

This work is already written down as required. `docs/vscode-keymap-development.md:117-118` lists "Add first-class multi-chord support for app and editor bindings, including VS Code-style chords such as `cmd+k cmd+s`" under Remaining Work, with `:131-132` and `:161-162` blocked on it and the open question at `:126` unanswered. That doc is stamped `STATUS: 🟡 NEEDS UPDATE`.

### Measured headroom

Probed over `defaultPlatformKeyBindings(platform)` for mac/linux/windows:

- **`Mod+K` is bound to nothing** on any platform. All three editor mounts pass `defaultBindings: false`, so `@singapor/core` has nothing on it either.
- **Zero of 124 default bindings contain a space in `keys`.** A space is therefore an unambiguous step separator.
- Totals: mac 124, linux 107, windows 105. Mac pane distribution: `any` 34, `editor` 89, `file-tree` 1.

## Why not the library's `SequenceManager`

Both installed packages ship multi-step sequence support that neither repo uses: `@tanstack/hotkeys@0.8.0` exports `SequenceManager`, `HotkeySequence = Array<Hotkey>`, `createSequenceMatcher`, `formatHotkeySequence`, `HotkeySequenceRecorder`; `@tanstack/react-hotkeys@0.10.0` exports `useHotkeySequence`, `useHotkeySequences`, `useHotkeySequenceRecorder`.

**We adopt two pieces of it and reject the dispatcher.** Two disqualifiers, read in the source:

1. **The arming stroke is not swallowed.** `preventDefault`/`stopPropagation` are guarded behind `currentIndex >= parsedSequence.length` (`sequence-manager.ts:505-512`), so they fire only on the final step. A `Mod+K` prefix would reach the browser and every downstream handler.
2. **The timeout is a lazy comparison, not a timer.** `now - lastKeyTime > timeout` is evaluated only on the _next_ keystroke (`sequence-manager.ts:481-487`). Nothing fires when the window elapses, so a pending indicator driven off `matchedStepCount` stays lit indefinitely after the user walks away.

**Adopted:**

- `matchesKeyboardEvent` as the per-stroke primitive. It is a strict superset of our hand-rolled matcher: same Latin-letter guard against the AZERTY failure (`match.js:43` — `isSingleLetterKey(eventKey) && (/^[A-Za-z]$/.test(eventKey) || !event.altKey)` returns `false` rather than falling through to `event.code`), plus dead-key and macOS Option+letter handling ours lacks.
- `formatHotkeySequence(['Mod+K','Mod+S']) === 'Mod+K Mod+S'` — verified. The library's own canonical sequence display _is_ the space-joined string, which is why §5 keeps the stored value a string.
- `isModifierKey` for the modifier-only guard (probe-confirmed: `isModifierKey(normalizeKeyName('Meta')) === true`).

## Prior art, and where it disagrees

Both references are vendored locally and were read, not recalled.

|                        | VS Code                                                                                                      | Zed (gpui)                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Chords in the terminal | **yes, default on** — `terminal.integrated.allowChords` `default: true` (`terminalConfiguration.ts:437-440`) | **yes, unconditionally** — no setting                                                                                              |
| Terminal mechanism     | `isValidChord` + `inChordMode` short-circuit before xterm (`terminalInstance.ts:1150-1159`)                  | binding resolution precedes element listeners; pending sets `propagate_event = false` and returns (`window.rs:5308`, `:5367-5369`) |
| Unmatched / timed-out  | swallowed                                                                                                    | **replayed** (`to_replay` → `replay_pending_input`; `flush_dispatch` on timeout)                                                   |
| Timeout                | 5000 ms, polled at 500 ms with a focus check (`abstractKeybindingService.ts:175-191`)                        | 1 s, and only armed when `pending_has_binding \|\| text_input_requires_timeout` (`window.rs:5336-5338`)                            |
| Escape while armed     | carved out in the terminal — "important in terminals generally" (`terminalInstance.ts:1152-1155`)            | no carve-out                                                                                                                       |

Where they disagree, this plan's choice and reason are in the semantics table (rules 9, 16) and §10 (D2). VS Code is not unanimous prior art and the plan does not pretend otherwise.

## Architecture boundary

| Concern                                               | Sole owner after this plan                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Stroke grammar, prefix predicate, chord normalization | `apps/web/src/keymap/utils/chord.ts` (NEW)                                         |
| Prefix structure and per-keystroke matching           | `apps/web/src/keymap/utils/keymap-trie.ts` (NEW)                                   |
| Arm / complete / cancel decisions                     | `apps/web/src/keymap/utils/chord-machine.ts` (NEW), a pure transition function     |
| Listener phases, timers, DOM cancellations            | `apps/web/src/keymap/use-app-keymap.ts`                                            |
| Collision and shadowing policy                        | `active-bindings.ts` `liveKeyBindings`, unchanged except for one widened predicate |
| Per-stroke keyboard-event matching                    | `@tanstack/react-hotkeys` `matchesKeyboardEvent`                                   |
| Stored value shape and validation                     | `packages/contracts/src/settings.ts`                                               |
| Glyph rendering of one or many strokes                | `apps/web/src/keymap/utils/format-keys.ts` (NEW, moved)                            |
| Editor command dispatch from a chord                  | existing `dispatchEditorCommand`, plus a new capability field                      |

This plan must not add a second keymap owner, a keybinding store, a context-expression evaluator, or a `when`-clause model. It must not change the listener phase for the unarmed path.

## Current architecture

### Table construction

```
platformCommands (table.ts)
  → defaultPlatformKeyBindings(platform)            default-bindings.ts:25-32
  → AppRuntimeContent
      ├─ AppCommandSurface (bindings prop)          app-command-surface.tsx:21
      └─ editorKeymapLayers (resolves overrides AGAIN)  app-runtime-content.tsx:31-40
```

On mac `hotkey === keys` for all 124 bindings; on linux 11 differ (`hotkey: 'Control+Y'` vs `keys: 'Mod+Y'`). Both render identically through `hotkeyTokenLabel`, so `commandShortcut`'s `typeof binding.hotkey === 'string'` branch (`shortcut.ts:14`) is output-equivalent to reading `keys`. Deleting `hotkey` is display-safe — but the before/after table dump in Phase 1 must be run **per platform**, because the two representations legitimately diverge off mac.

### Override resolution — and the early return that decides the design

`app-command-surface.tsx:52-66` is the documented single reader, feeding the keymap, palette and menus store. Inside:

```ts
const entries = appliedOverrides(overrides)
if (entries.length === 0) return { bindings: defaults, shadowedBy: NO_SHADOWED_COMMANDS } // :168
```

**This early return is load-bearing.** With no user overrides — the default state for every user — `liveKeyBindings`, `bindingClaimingKey`, `collidesWith` and `recordShadowedCommand` never execute. Any prefix invariant hung solely off `collidesWith` is inert out of the box. That is why the trie arbitrates independently (rule 4) and a build-time test forbids the situation entirely (rule 3).

### Per-pane selection — order is load-bearing

```ts
// use-app-keymap.ts:53-58 — arbitrate FIRST, filter SECOND
return activePlatformKeyBindings(bindings, focusedPane).filter(isAppKeyBinding)
```

Measured: reversing to filter-then-arbitrate resurrects `Mod+[ → workspace.navigateBack` and `Mod+] → workspace.navigateForward` in the editor pane (33→35 mac, 32→34 linux/windows). Neither declares `preventDefault`, so `runAppKeymap:82-83` would swallow them and break indent/outdent. **Do not reorder.**

`bindingPriority`'s `return 0` (`:272`) is unreachable — `selectActiveBinding:252` calls `bindingMatchesFocusedPane` first. The ladder is effectively two-valued.

### Other keyboard owners in the descent

| owner                             | node                    | phase       | behaviour                                                                                                                                                |
| --------------------------------- | ----------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use-prompt-stash.ts:42`          | **`window`**            | **capture** | `Mod+S`; `preventDefault()`, no `stopPropagation()`. Beats document capture in every phase. Pre-existing double dispatch with `workspace.saveFile` (D9). |
| `useFileTreeContextMenu.ts:374`   | `document`              | capture     | Escape closes the menu                                                                                                                                   |
| ghostty `handleKeyDown`           | terminal container      | bubble      | swallows Ctrl/Meta before document bubble — see D2                                                                                                       |
| `useAppKeymap`                    | `document`              | bubble      | today's app keymap                                                                                                                                       |
| editor `EditorKeymapController`   | `scrollElement`         | bubble      | inner node → runs **before** document bubble                                                                                                             |
| `inputSelectionController.ts:261` | `scrollElement`         | capture     | `stopPropagation` while composing                                                                                                                        |
| `inputSelectionController.ts:262` | `scrollElement`         | bubble      | inserts printable fallback text                                                                                                                          |
| `completionController.ts:182-184` | `scrollElement`         | capture     | `stopImmediatePropagation` while the list is open                                                                                                        |
| `findWidget.ts:195`               | widget root             | bubble      | unconditional `stopPropagation`                                                                                                                          |
| React 19 delegation               | `#root` (`main.tsx:66`) | both        | strictly after any `document` capture listener                                                                                                           |

Exactly **two** React `onKeyDown` handlers in `apps/web/src` + `packages/tree/src` call `stopPropagation`: `chord-recorder.tsx:46-47` and `FileTreeView.tsx`. The rest call only `preventDefault`, which the app keymap never reads.

### Display

`features/menus/utils/shortcut.ts` is the app's only glyph formatter and its only `split('+')` outside the keymap:

```ts
export function formatHotkey(hotkey: string) {
  // :19-27
  return hotkey
    .split('+')
    .map((t) => hotkeyTokenLabel(t, isMac))
    .join(isMac ? '' : '+')
}
```

`formatHotkey('Mod+K Mod+S')` → `['Mod','K Mod','S']` → **`⌘K ModS`**. Silent corruption that typechecks. Four consumers outside `features/menus/`, so the module moves (§7).

## Target design

**Thesis.** A binding's keys become an ordered non-empty tuple of strokes. `keys` stays the canonical space-joined string and remains the collision key, the stored value, the search haystack and the display source. Prefix arbitration moves into a per-pane trie built _after_ the existing arbitration and filter stages, so today's behaviour is preserved byte-for-byte. The listener stays bubble-phase; arming installs a capture listener that lives for exactly one keystroke.

### Types

```ts
// apps/web/src/keymap/types.ts  (CHANGED)

/** One binding's strokes in press order. A plain hotkey is a chord of one — no union to branch on. */
export type KeyChord = readonly [RegisterableHotkey, ...RegisterableHotkey[]]

export type PlatformKeyBinding = {
  /** Canonical strokes joined by one space: 'Mod+S', or 'Mod+K Mod+S'. */
  readonly keys: string
  readonly chord: KeyChord
  readonly command: PlatformCommandId | null
  readonly pane?: FocusArea | 'any'
  readonly source: KeyBindingSource
  readonly vscodeCommandId?: string
  readonly preventDefault?: boolean
  readonly stopPropagation?: boolean
  readonly meta?: HotkeyMeta
}
// DELETED: `hotkey: RegisterableHotkey`. Two readers: `editorKeyBindingFromPlatform`
// (rewritten, §6) and `shortcut.ts:14` (output-equivalent to `keys`, verified per platform).

export type KeyBindingKeyboardEvent = {
  readonly altKey: boolean
  readonly code?: string
  readonly ctrlKey: boolean
  readonly key: string
  readonly metaKey: boolean
  readonly shiftKey: boolean
  /** An IME owns the keystroke; nothing in the keymap may act on it. */
  readonly isComposing?: boolean
  /** OS auto-repeat. A held prefix must not re-arm or reset the timer. */
  readonly repeat?: boolean
}

export type ParsedPlatformKeyBinding = {
  readonly binding: PlatformKeyBinding
  readonly steps: readonly [ParsedHotkey, ...ParsedHotkey[]]
  /** Decided by stroke 1 alone: once armed, the user has visibly taken the keyboard. */
  readonly firesWhileTyping: boolean
}
```

```ts
// apps/web/src/keymap/define-command.ts  (CHANGED, :35-42)
export type CommandKeyDefault = {
  readonly chord: KeyChord // was: hotkey: RegisterableHotkey
  readonly pane?: FocusArea | 'any'
  readonly platforms?: readonly CommandPlatformName[]
  readonly preventDefault?: boolean
  readonly stopPropagation?: boolean
  readonly vscodeCommandId?: string
}
```

```ts
// apps/web/src/keymap/utils/chord.ts  (NEW — pure, React-free, no stores)
export const MAX_CHORD_STROKES = 2
export const CHORD_TIMEOUT_MS = 5_000
/** Thin space: one visual token under `whitespace-nowrap`, unlike a plain space. */
export const CHORD_DISPLAY_SEPARATOR = ' '

export function chordStrokes(keys: string): readonly string[]
export function chordKeys(chord: KeyChord, platform: PlatformName): string
/** Every stroke parses clean, 1..MAX strokes, and a multi-stroke chord's first stroke carries Ctrl/Meta. */
export function isBindableChord(keys: string): boolean
export function normalizedChord(keys: string, platform: PlatformName): string
/** Equal, or one is a proper space-prefix of the other. Allocation-free; no split. */
export function keysConflict(a: string, b: string): boolean
export function isChordPrefix(keys: string, table: readonly PlatformKeyBinding[]): boolean
```

```ts
// apps/web/src/keymap/utils/keymap-trie.ts  (NEW — pure)
type StrokeEdge = {
  readonly mods: number // 4-bit mask: one integer compare instead of four booleans
  readonly firesWhileTyping: boolean // consulted only on edges leaving the ROOT
  readonly node: KeymapNode
}

export type KeymapNode = {
  readonly next: ReadonlyMap<string, readonly StrokeEdge[]>
  /** The binding completing here. INVARIANT: `binding !== null` XOR `next.size > 0`. */
  readonly binding: ParsedPlatformKeyBinding | null
  /** Bindings reachable below. Feeds the indicator's continuation count with no walk. */
  readonly continuations: number
}

export type KeymapTrie = {
  readonly root: KeymapNode
  /** Bindings dropped to keep the XOR invariant. A table bug; surfaced by log + test. */
  readonly dropped: readonly PlatformKeyBinding[]
}

export type TrieStep =
  | { readonly kind: 'miss' }
  | { readonly kind: 'arm'; readonly node: KeymapNode; readonly firesWhileTyping: boolean }
  | {
      readonly kind: 'run'
      readonly binding: ParsedPlatformKeyBinding
      readonly firesWhileTyping: boolean
    }

export function buildKeymapTrie(
  bindings: readonly PlatformKeyBinding[], // already arbitrated + app-filtered
  platform: PlatformName,
): KeymapTrie

export function trieStep(node: KeymapNode, event: KeyBindingKeyboardEvent): TrieStep
```

```ts
// apps/web/src/keymap/utils/chord-machine.ts  (NEW — pure, node-testable)
export type ChordOutcome =
  'completed' | 'unmatched' | 'timeout' | 'blur' | 'hidden' | 'pointer' | 'superseded'

export type PendingChord = {
  readonly matched: readonly [string, ...string[]]
  readonly node: KeymapNode
  readonly armedAt: number
}

export type ChordAction =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'swallow' }
  | { readonly kind: 'arm'; readonly pending: PendingChord }
  | {
      readonly kind: 'run'
      readonly binding: ParsedPlatformKeyBinding
      readonly fromChord: boolean
    }
  | { readonly kind: 'cancel'; readonly outcome: ChordOutcome }

export function chordTransition(
  trie: KeymapTrie,
  pending: PendingChord | null,
  event: KeyBindingKeyboardEvent,
  targetsTextEntry: boolean,
  now: number,
): ChordAction
```

```ts
// apps/web/src/features/workspace/providers/focus-state.ts  (CHANGED)
export type EditorSurfaceCapability = 'editable' | 'readonly'

export type ActiveEditorSurface = {
  readonly capability: EditorSurfaceCapability
  readonly dispatch: (command: EditorCommandId, context?: EditorCommandContext) => boolean
}
// Replaces `activeEditorCommandDispatch` (:20) and `setActiveEditorCommandDispatch` (:29, :73).
// The capability restores the gate `readonlyEditorKeymapLayers` applies to the layer path,
// which a chord routed through the app listener would otherwise bypass.
```

### Match algorithm

```
trieStep(node, event):
  mods = (altKey?1:0) | (ctrlKey?2:0) | (metaKey?4:0) | (shiftKey?8:0)

  printed = normalizeKeyName(event.key)
  step = resolve(node, printed, mods);  if step: return step

  # A layout printing a Latin letter already speaks the bindings' language, so its letters
  # are final: falling through would let Mod+W answer AZERTY's Mod+Z.
  # active-bindings.ts:97-102, now applied PER STROKE.
  if LATIN_LETTER_PATTERN.test(printed): return { kind: 'miss' }
  physical = physicalKeyName(event.code);  if not physical: return { kind: 'miss' }
  return resolve(node, physical, mods) ?? { kind: 'miss' }

resolve(node, key, mods):
  edges = node.next.get(key);  if not edges: return null
  for edge of edges:                            # ≤4, one integer compare each
      if edge.mods !== mods: continue
      if edge.node.binding: return { kind:'run', binding: edge.node.binding, firesWhileTyping: edge.firesWhileTyping }
      return                 { kind:'arm', node: edge.node,                  firesWhileTyping: edge.firesWhileTyping }
  return null
```

`run` vs `arm` needs no tie-break: the build enforces `binding XOR next`.

### Transition function

```
chordTransition(trie, pending, event, targetsTextEntry, now):

  if event.isComposing:            return { kind: 'ignore' }
  if isModifierKey(normalizeKeyName(event.key)):
      # Neither advances nor cancels: Cmd may be released and re-pressed between strokes.
      return pending ? { kind: 'swallow' } : { kind: 'ignore' }

  if not pending:
      step = trieStep(trie.root, event)
      if step.kind === 'miss': return { kind: 'ignore' }
      if not step.firesWhileTyping and targetsTextEntry: return { kind: 'ignore' }
      if step.kind === 'run':  return { kind: 'run', binding: step.binding, fromChord: false }
      if event.repeat:         return { kind: 'ignore' }     # unarmed repeat: today's behaviour
      return { kind: 'arm', pending: { matched: [strokeLabel], node: step.node, armedAt: now } }

  # ARMED. The app owns the keyboard for exactly this keystroke.
  if event.repeat:  return { kind: 'swallow' }               # held prefix: stay armed, no re-arm
  if now - pending.armedAt > CHORD_TIMEOUT_MS: return { kind: 'cancel', outcome: 'timeout' }

  step = trieStep(pending.node, event)
  if step.kind === 'miss':  return { kind: 'cancel', outcome: 'unmatched' }
  if step.kind === 'arm':   return { kind: 'arm', pending: { matched: [...pending.matched, strokeLabel], node: step.node, armedAt: now } }
  return { kind: 'run', binding: step.binding, fromChord: true }
```

The real `setTimeout` is the primary expiry; the `now - armedAt` check makes the timeout provable in the `node` project with no timers.

### Listener adapter

```ts
const trie = useMemo(
  () => buildKeymapTrie(appKeyBindingsForPane(bindings, focusedPane), platform),
  [bindings, focusedPane, platform],
)
const pendingRef = useRef<PendingChord | null>(null)
const [pendingLabel, setPendingLabel] = useState<PendingChordLabel | null>(null) // render only
```

**Listener A — `document`, BUBBLE, always mounted. Deps `[trie, dispatch]`.** Today's listener with one branch added; the phase does not change, so no precedence anywhere in the app moves.

```
onKeyDown(event):
  if pendingRef.current: return                       # listener B already took it
  action = chordTransition(trie, null, event, eventTargetsTextEntry(event), Date.now())
  if action.kind === 'ignore': return
  if action.kind === 'run':  return runBinding(action.binding, event, false)
  event.preventDefault(); event.stopPropagation()     # unconditional: the prefix ran nothing
  pendingRef.current = action.pending
  setPendingLabel(labelFor(action.pending, trie))
```

**Listener B — `document`, CAPTURE, installed only while armed. Deps `[pendingLabel, trie, dispatch]`.**

```
onArmedCapture(event):
  p = pendingRef.current;  if !p: return
  action = chordTransition(trie, p, event, false, Date.now())
  if action.kind === 'ignore': return                 # isComposing only
  event.preventDefault()
  event.stopImmediatePropagation()                    # nothing below sees the completer
  if action.kind === 'swallow': return
  if action.kind === 'arm':  { pendingRef.current = action.pending; setPendingLabel(...); return }
  if action.kind === 'cancel': return disarm(action.outcome, null)
  disarm('completed', action.binding.binding.command)
  runBinding(action.binding, event, true)
```

Capture is required and confined to the armed window: four handlers sit between `document` and the key (the editor's own keymap on `scrollElement`, the IME hold at `inputSelectionController.ts:261`, `completionController.ts:182-184`'s `stopImmediatePropagation`, and the printable-fallback insertion at `inputSelectionController.ts:262`). Bubble cannot beat any of them. **Rule: widgets own capture, the keymap owns bubble — except for one keystroke while a chord is armed.**

The same effect registers and tears down: `window` `blur` → `disarm('blur')`; `document` `visibilitychange` to hidden → `disarm('hidden')`; `document` `pointerdown` capture → `disarm('pointer')`; `setTimeout(CHORD_TIMEOUT_MS)` → `disarm('timeout')`. Cleanup of listener A's effect calls `disarm('superseded')`, covering both a table change and a pane change in one line — `trie` is memoised on `focusedPane`, so a focus move between strokes re-runs the effect and cancels.

```ts
function runBinding(parsed, event, fromChord) {
  const b = parsed.binding
  // A completing stroke ALWAYS swallows: `preventDefault: false` means "let the browser have
  // this key", which cannot be true of a key the user committed to by arming.
  if (fromChord || b.preventDefault !== false) event.preventDefault()
  if (fromChord || b.stopPropagation !== false) event.stopPropagation()
  if (!b.command) return // reserved no-op, unchanged
  if (isEditorPlatformCommandId(b.command) && !editorCommandAllowedForActiveSurface(b.command))
    return
  dispatch(b.command, event)
}
```

**Cost.** Today's matcher is two linear scans over 32–35 entries. `trieStep` is one `Map.get` on a ~15-entry map plus a ≤4-element integer scan, zero allocations, and the only per-keystroke string work is `normalizeKeyName`, which the current code already calls. Benchmark before/after with the same harness; the target is "not slower". The trie is adopted for the invariant it makes unforgettable, not for nanoseconds — the flat scan was never a bottleneck.

### Logging

One wide event per chord lifecycle, via `createWideEventScope` (`apps/web/src/lib/wide-event-scope.ts:45`). Note `area: 'keymap'` does not exist in this codebase; `area: 'command'` does (`commands.ts:141`).

```ts
const scope = createWideEventScope({ action: 'keymap.chord', area: 'command' })
scope.set({
  pane: focusedPane,
  prefix: pending.matched[0],
  candidateCount: pending.node.continuations,
})
// on disarm:
scope.end({
  outcome,
  command,
  keys,
  strokeCount: pending.matched.length,
  elapsedMs: Date.now() - pending.armedAt,
})
```

Nothing is logged on arm — one enriched event per operation, per the evlog convention. `createWideEventScope` returns a no-op when `clientLoggingEnabled()` is false, so no call-site guard is needed.

## Semantics

| #   | Case                                             | Rule                                                                                                                                                                                                                                                 | Why                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Prefix vs complete, same pane, override involved | `collidesWith` widens from `keys !==` to `keysConflict`. `liveKeyBindings` drops the loser and records `shadowedBy`. Winner order unchanged.                                                                                                         | The existing fold already produces the report every downstream surface reads. `commandsShadowedBy` becomes prefix-aware with **zero UI change**.                                                                                                                                                                                                                                                                       |
| 2   | Prefix vs complete, no overrides at all          | Stage 1 never runs (`active-bindings.ts:168`). The trie arbitrates (rule 4) and a build-time test forbids the situation (rule 3).                                                                                                                    | The default state for every user. Hanging the invariant on `collidesWith` alone would leave it inert out of the box.                                                                                                                                                                                                                                                                                                   |
| 3   | **Chord prefix hygiene (hard invariant)**        | A chord's first stroke must (a) carry Ctrl or Meta, and (b) not equal the `keys` of any binding in the default table — any pane — on any of mac/windows/linux. Enforced by `isBindableChord` and a test over `defaultPlatformKeyBindings(platform)`. | (a) The editor's hidden input is a real `<textarea>` and ghostty's host is `contenteditable`, so `eventTargetsTextEntry` is true wherever a bare-key prefix would be used — it could never arm. (b) A prefix colliding with a live `editor.*` binding is eaten by the editor's `scrollElement` bubble listener first. Global uniqueness costs nothing: `Mod+K` is verified free in both tables on all three platforms. |
| 4   | Prefix vs complete surviving into one trie       | **The complete (shorter) binding wins**; the chord goes to `trie.dropped` and is `log.warn`ed.                                                                                                                                                       | A key that works beats a key that swallows. Cross-pane conflicts are legitimately different slots today (`Mod+F` global vs `Mod+F` editor), so this cannot be a hard error.                                                                                                                                                                                                                                            |
| 5   | Two chords sharing a prefix                      | Not a conflict. Both live under one trie node; `continuations` counts them.                                                                                                                                                                          | Neither string is a space-prefix of the other.                                                                                                                                                                                                                                                                                                                                                                         |
| 6   | Build order                                      | `appKeyBindingsForPane` keeps arbitrate-then-filter. The trie is built from its output, never from a pre-filtered list.                                                                                                                              | **Measured.** Reversing resurrects `Mod+[`/`Mod+]` in the editor pane and breaks indent/outdent.                                                                                                                                                                                                                                                                                                                       |
| 7   | Arming stroke                                    | Unconditional `preventDefault()` + `stopPropagation()`, regardless of `binding.preventDefault`.                                                                                                                                                      | Those flags describe the completing action; the prefix has run nothing.                                                                                                                                                                                                                                                                                                                                                |
| 8   | Completing stroke                                | `preventDefault()` + `stopImmediatePropagation()` in capture, before the lookup.                                                                                                                                                                     | The completing character must never land in the focused text field.                                                                                                                                                                                                                                                                                                                                                    |
| 9   | Unmatched stroke while armed                     | Swallowed, chord cancelled, **never replayed**. No toast.                                                                                                                                                                                            | Zed replays here; we do not. Replaying after a delay reorders input into a live shell, which is worse than dropping it. VS Code swallows and pins it with a test. No toast because the indicator disappearing is the feedback and a toast would double-announce against its live region.                                                                                                                               |
| 10  | Escape while armed                               | No special case. It matches no edge → rule 9 → cancel.                                                                                                                                                                                               | Falls out for free and keeps `<prefix> Escape` bindable. Zero code. VS Code's Escape carve-out is terminal-specific and is handled by D2 instead.                                                                                                                                                                                                                                                                      |
| 11  | Modifier-only keydown while armed                | Neither advances nor cancels; swallowed. Gated by `isModifierKey`.                                                                                                                                                                                   | Without it, releasing and re-pressing Cmd between strokes kills the chord. Universal across VS Code, CodeMirror and the TanStack engine.                                                                                                                                                                                                                                                                               |
| 12  | `event.repeat`                                   | Unarmed: ignored. Armed: swallowed, chord stays armed, timer **not** reset.                                                                                                                                                                          | Nothing in `apps/web/src` reads `event.repeat` today. Without this, holding a prefix a fraction too long cancels the chord.                                                                                                                                                                                                                                                                                            |
| 13  | `event.isComposing`                              | Both listeners return immediately.                                                                                                                                                                                                                   | An IME owns the keystroke. A small deliberate change for single hotkeys too, and a bug fix. The capture listener runs above the editor's IME guard, so it must check for itself.                                                                                                                                                                                                                                       |
| 14  | Typing gate                                      | First stroke only, unchanged from `hotkeyFiresWhileTyping`. Once armed, every subsequent stroke fires regardless of caret position.                                                                                                                  | Rule 3(a) makes stroke 1 always Ctrl/Meta, so `firesWhileTyping` is always true for a prefix — no editor bypass needed.                                                                                                                                                                                                                                                                                                |
| 15  | Pane pinning                                     | The trie is memoised on `[bindings, focusedPane, platform]`; listener A's cleanup calls `disarm('superseded')`.                                                                                                                                      | Roughly ten call sites write `setFocusArea`. Completing against a different pane's table would run a command the user could not have predicted.                                                                                                                                                                                                                                                                        |
| 16  | Timeout                                          | 5000 ms, real `setTimeout`, restarted at every stroke. Armed only when the pending node has at least one reachable binding. Not a settings key.                                                                                                      | VS Code's value (`abstractKeybindingService.ts:185`), reached there by a 500 ms poll; a single timer is strictly better. The conditional arming is Zed's idea (`window.rs:5336-5338`) and is worth taking. Not a key because CLAUDE.md forbids inert knobs.                                                                                                                                                            |
| 17  | Other cancellations                              | `window` blur, `document` `visibilitychange` to hidden, `document` `pointerdown` capture.                                                                                                                                                            | VS Code checks document focus on every poll; an explicit blur listener is the same guarantee without polling. Pointerdown keeps an armed chord from stealing a key after the user clicks into a dialog or the recorder.                                                                                                                                                                                                |
| 18  | Chords in the terminal                           | **Intended: yes.** Not reachable until the ghostty host is replaced. See D2 — this plan states the seam; the knob ships with the host swap.                                                                                                          | The old `ghostty-web` swallows every Ctrl/Meta key before document bubble, so the app keymap is already dead there today. Not a regression, and not a designed limitation either.                                                                                                                                                                                                                                      |
| 19  | Chord-bound `editor.*` commands                  | Allowed. Never handed to `@singapor/core` (§6); dispatched through `dispatchEditorCommand`, gated by the active surface's `capability`. Dead on the diff pane.                                                                                       | `usePlatformCommandDispatch` already routes them (`commands.ts:76-77`). Dead-on-diff is consistent: `DIFF_KEYMAP` gives the diff **zero** bindings on purpose.                                                                                                                                                                                                                                                         |
| 20  | Depth cap                                        | 2 strokes, enforced in the contract regex, `isBindableChord`, and the recorder. The trie itself is N-capable.                                                                                                                                        | VS Code caps its own recorder at two. A deeper prefix tree is a keymap no settings column can render. Product policy, not architecture.                                                                                                                                                                                                                                                                                |
| 21  | Grammar validation                               | Per stroke, never on the whole string.                                                                                                                                                                                                               | Measured: the whole-string verdict is unusable in both directions. The existing warning-is-fatal rule is kept.                                                                                                                                                                                                                                                                                                         |
| 22  | Exactly one dispatch per completed chord         | Listener B clears `pendingRef` and calls `stopImmediatePropagation` before dispatching; listener A returns early whenever `pendingRef.current` is set.                                                                                               | Guards against both listeners firing on the completing event.                                                                                                                                                                                                                                                                                                                                                          |
| 23  | Accepted limitation                              | While the LSP completion list is open or the find widget has focus, a chord cannot **arm**. Once armed, the capture listener wins.                                                                                                                   | Both are correct local behaviours on inner nodes. Rule 3(b) keeps prefixes off keys those widgets claim.                                                                                                                                                                                                                                                                                                               |

## Contract change

**Decision: keep `Record<commandId, string | null>`. Add a shape guard, not a new shape.**

Three findings, not a preference:

1. `formatHotkeySequence(['Mod+K','Mod+S']) === 'Mod+K Mod+S'` — measured. The library's own canonical sequence display _is_ the space-joined string.
2. `binding.keys` is already the collision key, the settings haystack and the row identity. An array forces `join(' ')` at each of those.
3. `ValueWidget` (`registry.ts:82`) constrains `widget: 'keybindings'` to `Readonly<Record<string, string | null>>`. An array shape is a compile error until that union is widened, and it breaks `withKeybindingOverride`/`withoutKeybindingOverride`'s `keys: string | null` signature (`patch.ts:48-54`, `:61-65`) plus three contract test files. It buys nothing — a stroke cannot contain a space (Space is spelled `Space`; 0/124 defaults contain one).

```ts
/** Two, not N: the recorder commits on the second stroke, and a deeper prefix tree is
 *  a keymap no settings column can render. */
export const MAX_KEYBINDING_CHORD_STROKES = 2

/** Shape only. The keymap owns the grammar — duplicating the modifier alias table here would drift. */
const KEYBINDING_CHORD_PATTERN = /^\S+(?: \S+)?$/

export const keybindingChordSchema = v.pipe(
  trimmedNonEmptyStringSchema,
  v.maxLength(64),
  v.regex(KEYBINDING_CHORD_PATTERN, 'a binding is one hotkey, or two separated by a single space'),
)

export const keybindingOverridesSchema = v.record(
  keybindingCommandIdSchema,
  v.nullable(keybindingChordSchema),
)
```

**Why `v.regex` and not `v.check`:** plan 049b will run `@valibot/to-json-schema` over these descriptors. A `v.regex` survives as draft-07 `"pattern"` and gives the JSON language server a real squiggle on a malformed chord; a `v.check` converts to nothing.

**Why deliberately loose.** It rejects only 3+ space-separated tokens and empty/whitespace-only values. Every value that has ever been _applied_ passed `isBindableHotkey`, so no previously-working override becomes invalid.

**Scope stays `application`** and the case is strictly stronger: CLAUDE.md names "binds a key" as execution-reaching, and a _prefix_ is itself execution-reaching because it swallows one keystroke and re-routes the next.

**No new settings key here.** `CHORD_TIMEOUT_MS` ships as a constant.

**Failure behaviour:** a keyed write of a 3-stroke string fails `safeParse` → typed `settings.WRITE_INVALID`, nothing on disk. A hand-edited file drops the **whole key** to `{}` with one `invalid-value` diagnostic naming the offending command. Per the greenfield rule there is no healing code; the answer is "delete the bad line".

## Editor boundary

**`/Users/shaul/Desktop/D/Editor` changes by zero lines in this plan.** That is a verified conclusion, not a convenience — and it is not a statement that the Editor never gets chords. See "Companion plan" below.

### What makes it possible

Platform already authors **100%** of the editor's bindings. All three mounts pass `defaultBindings: false` (`editor.tsx:123`, `diff-options.ts:33`, `result-file-editor.tsx:112`), and `resolveEditorKeymap` drops core layers entirely when it is false (`Editor/packages/editor/src/editor/keymap.ts:132-135`). The 111 `editor.*` bindings come from `apps/web/src/keymap/editor-commands.ts`. Dispatch already exists: `commands.ts:76-77` routes any `editor.*` id through `dispatchEditorCommand`.

### What platform changes

**1. `editorKeyBindingFromPlatform` gains one guard and stops reading the deleted field.**

```ts
export function editorKeyBindingFromPlatform(binding: PlatformKeyBinding): EditorKeyBinding | null {
  const command = editorCommandIdFromPlatform(binding.command)
  if (!command) return null
  // A chord is not expressible as `RegisterableHotkey`. It does not throw there — it
  // normalizes to its last stroke and wins the layer dedupe against the real binding
  // for that key. Measured: 'Mod+K Mod+S' -> 'Mod+S'.
  if (binding.chord.length !== 1) return null

  return {
    command,
    hotkey: binding.chord[0],
    preventDefault: binding.preventDefault,
    stopPropagation: binding.stopPropagation,
  }
}
```

**2. `isAppKeyBinding` inverts for multi-stroke editor commands.**

```ts
// `editor.*` single strokes are handed to @singapor/core as a keymap layer; its bindings are
// one stroke by type. A chord-bound editor command stays here and reaches the editor through
// `dispatchEditorCommand` instead.
function isAppKeyBinding(binding: PlatformKeyBinding) {
  if (binding.chord.length > 1) return true

  return !isEditorPlatformCommandId(binding.command)
}
```

**3. The focus store's registration grows a capability.** `readonlyEditorKeymapLayers` filters the _layer_ path for the read-only search surface. A chord routed through the app listener bypasses that filter, and pane scoping cannot distinguish the search surface from a real editor — `result-editor-surface.tsx:176,178` sets `setFocusArea('editor')` too. So `activeEditorCommandDispatch` becomes `activeEditorSurface`, registered at `editor.tsx:201-203` (`'editable'`) and `result-file-editor.tsx:153-154` (`'readonly'`), cleared at `result-editor-surface.tsx:151`. A new `editorCommandAllowedForCapability` in `editor-keymap.ts` relocates `readonlyEditorKeymapLayers`' rule from layer-build time to dispatch time.

### The negative instruction that must survive into the code

**Never let a chord string reach `EditorKeyBinding.hotkey`.** Nothing in `packages/editor` calls `validateHotkey`. `normalizeRegisterableHotkey('Mod+K Mod+S')` yields `'Mod+S'`, and `editorKeyBindingsFromLayers` dedupes last-write-wins on that key — so the chord would win and plain `Mod+S` would run the chord's command. A test asserts no binding in any generated editor layer has a space in its normalised hotkey.

### Explicitly not done here

`editorKeymapLayersFromPlatform` stays. The second override resolution at `app-runtime-content.tsx:31-40` stays. The `editorKeymapLayers` prop — verified to touch **21 files across 6 features** — stays. Collapsing matching onto one owner is the correct end state and answers `docs/vscode-keymap-development.md:126`, but it bundles a repo-wide refactor with unresolved chord correctness. See D7.

### Companion plan

The Editor's own default keymap is bent out of shape by not having chords. `foldingBindings` (`Editor/packages/editor/src/editor/keymap.ts:663-685`) transliterates VS Code's entire `Ctrl+K` folding family into single strokes by inventing a modifier-depth scheme — `Mod+Alt+0` for fold-all, `Mod+Alt+Shift+0` for unfold-all, `Mod+Alt+1..9` for fold levels — and its own doc comment says the third modifier "asks for the variant of the chord it extends". It burns `Mod+Alt+Shift` on six bindings and still needs a mac-only bracket special case.

Fixing that means `EditorKeyBinding` grows a sequence form so standalone embedders get a VS Code-faithful keymap, which is a cross-repo change (platform compiles against `../Editor/*/dist`, so a pull needs a rebuild). **That is a separate plan, sequenced after this one**, because the chord _mechanism_ needs no Editor change and the chord _fidelity_ goal does. Do not start it inside this plan.

## File-by-file scope

| Path                                                                        | Change                                                                                                                                                                                                                                                                                                                                                          | Why                                                                                                                                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/keymap/utils/chord.ts`                                        | **NEW**                                                                                                                                                                                                                                                                                                                                                         | Pure, React-free. `keysConflict` is the one predicate the whole prefix model rests on.                                                                |
| `apps/web/src/keymap/utils/keymap-trie.ts`                                  | **NEW**                                                                                                                                                                                                                                                                                                                                                         | A flat array of strings cannot represent a prefix relation. Makes `binding XOR children` structural.                                                  |
| `apps/web/src/keymap/utils/chord-machine.ts`                                | **NEW**                                                                                                                                                                                                                                                                                                                                                         | Pure transition function, so arm/complete/cancel/timeout/repeat/isComposing are provable with no DOM.                                                 |
| `apps/web/src/keymap/utils/format-keys.ts`                                  | **NEW** (moved from `features/menus/utils/shortcut.ts`)                                                                                                                                                                                                                                                                                                         | 4 consumers outside `features/menus/`. Belongs in `keymap/` not `lib/` because `commandShortcut` is keymap policy. Fixes the `split('+')` corruption. |
| `apps/web/src/keymap/components/pending-chord-indicator.tsx`                | **NEW**                                                                                                                                                                                                                                                                                                                                                         | First `components/` folder under `keymap/`.                                                                                                           |
| `apps/web/src/keymap/types.ts`                                              | `chord: KeyChord` replaces `hotkey`; `ParsedPlatformKeyBinding.steps`; event gains `isComposing?`/`repeat?`                                                                                                                                                                                                                                                     | The type is the wall.                                                                                                                                 |
| `apps/web/src/keymap/active-bindings.ts`                                    | `collidesWith` → `keysConflict`; `isBindableHotkey` → `isBindableChord`; `normalizedHotkey` → `normalizedChord`; `userKeyBinding` builds `chord`; delete `parsedPlatformKeyBindings` + `platformKeyBindingForKeyboardEvent`; export `physicalKeyName`, `LATIN_LETTER_PATTERN`                                                                                   | One predicate widening converts the entire existing shadow pipeline.                                                                                  |
| `apps/web/src/keymap/use-app-keymap.ts`                                     | Trie memo; listener A bubble + listener B armed-only capture; timeout/blur/visibilitychange/pointerdown; `runBinding` with the capability gate; `isAppKeyBinding` inverted; returns the pending label; **`appKeyBindingsForPane` order unchanged**                                                                                                              | The state machine's home.                                                                                                                             |
| `apps/web/src/keymap/define-command.ts`                                     | `CommandKeyDefault.hotkey` → `chord`                                                                                                                                                                                                                                                                                                                            | Authoring surface for 143 key literals.                                                                                                               |
| `apps/web/src/keymap/default-bindings.ts`                                   | Emit `chord` + joined `keys`; `ReservedChord` → `ReservedHotkey`                                                                                                                                                                                                                                                                                                | "Chord" now means a sequence; `:18` and `:96` currently use it for one keystroke.                                                                     |
| `apps/web/src/keymap/workspace-commands.ts`                                 | 18 literals; `workspace.showSettings` gains a **second** default `{ chord: ['Mod+K','Mod+S'], vscodeCommandId: 'workbench.action.openGlobalKeybindings' }` **after** `Mod+,`                                                                                                                                                                                    | Ships the mechanism with a real user. Order matters: `commandShortcut`'s `.find` returns the first, so the printed hint stays `⌘,`.                   |
| `apps/web/src/keymap/editor-commands.ts`                                    | 112 literals (mechanical)                                                                                                                                                                                                                                                                                                                                       | Own commit; verify with a before/after table dump.                                                                                                    |
| `apps/web/src/keymap/editor-keymap.ts`                                      | Multi-stroke guard + `chord[0]`; new `editorCommandAllowedForCapability`                                                                                                                                                                                                                                                                                        | Keeps a chord string out of `RegisterableHotkey`; restores the read-only gate.                                                                        |
| `apps/web/src/app-keymap-controller.tsx`                                    | Renders `<PendingChordIndicator>`                                                                                                                                                                                                                                                                                                                               | Already mounted app-wide. No new mount point, no store, no prop drilling.                                                                             |
| `apps/web/src/features/workspace/providers/focus-state.ts`                  | `activeEditorSurface: ActiveEditorSurface \| null`                                                                                                                                                                                                                                                                                                              | Carries the capability the chord dispatch path needs.                                                                                                 |
| `apps/web/src/features/editor/components/editor.tsx`                        | `:201-203` registers `{ capability: 'editable', dispatch }`                                                                                                                                                                                                                                                                                                     | Call site 1 of 3.                                                                                                                                     |
| `apps/web/src/features/search/components/result-file-editor.tsx`            | `:153-154` registers `{ capability: 'readonly', dispatch }`                                                                                                                                                                                                                                                                                                     | Call site 2 of 3.                                                                                                                                     |
| `apps/web/src/features/search/components/result-editor-surface.tsx`         | `:151` clears the new shape                                                                                                                                                                                                                                                                                                                                     | Call site 3 of 3.                                                                                                                                     |
| `apps/web/src/features/menus/utils/shortcut.ts`                             | **DELETED**                                                                                                                                                                                                                                                                                                                                                     | Moved.                                                                                                                                                |
| `apps/web/src/features/menus/utils/resolve.ts`                              | `:155` import moves                                                                                                                                                                                                                                                                                                                                             | `trailing: string \| null` unchanged.                                                                                                                 |
| `apps/web/src/features/command-palette/command-palette-utils.ts`            | `:7` import moves                                                                                                                                                                                                                                                                                                                                               | Unchanged otherwise.                                                                                                                                  |
| `apps/web/src/features/terminal/utils/menu.ts`                              | `:41,:88` import moves                                                                                                                                                                                                                                                                                                                                          | Unchanged otherwise.                                                                                                                                  |
| `apps/web/src/features/terminal/utils/clipboard.ts`                         | `:42` import moves                                                                                                                                                                                                                                                                                                                                              | Unchanged otherwise.                                                                                                                                  |
| `apps/web/src/features/settings/components/widgets/chord-recorder.tsx`      | Multi-stroke capture; commit at `MAX_CHORD_STROKES`; commit a single stroke immediately **unless it is a live chord prefix**; `Enter` commits a pending single; `Backspace` pops; `Escape` cancels (unchanged); partial label; `w-40` → `w-52`; `whitespace-nowrap`; `isModifierKey` instead of the hand-rolled array at `:84`; render glyphs via `formatChord` | The prefix check keeps today's one-keystroke path for every non-prefix key.                                                                           |
| `apps/web/src/features/settings/components/keybinding-row.tsx`              | New `chordPrefixes` prop forwarded to the recorder                                                                                                                                                                                                                                                                                                              | The recorder needs to know which strokes are live prefixes.                                                                                           |
| `apps/web/src/features/settings/components/keybinding-section.tsx`          | Computes `chordPrefixes(rows)` once; `w-96` → `w-[28rem]`                                                                                                                                                                                                                                                                                                       | `⌘K ⌘S` plus the badge and two buttons do not fit in 24rem.                                                                                           |
| `apps/web/src/features/settings/utils/keybinding-rows.ts`                   | `rowHaystack` adds `formatChord(row.keys ?? '')`                                                                                                                                                                                                                                                                                                                | Searching what you _see_ (`⌘K`) currently never matches. Prefix search is already free. `commandsShadowedBy` needs **no change**.                     |
| `packages/ui/src/components/command.tsx`                                    | `whitespace-nowrap` on `CommandShortcut`                                                                                                                                                                                                                                                                                                                        | A chord's separator is a legal break point and would read as two unrelated accelerators.                                                              |
| `packages/ui/src/components/context-menu.tsx`                               | `whitespace-nowrap` on `ContextMenuShortcut`                                                                                                                                                                                                                                                                                                                    | Same.                                                                                                                                                 |
| `packages/ui/src/components/dropdown-menu.tsx`                              | `whitespace-nowrap` on `DropdownMenuShortcut`                                                                                                                                                                                                                                                                                                                   | Same.                                                                                                                                                 |
| `packages/contracts/src/settings.ts`                                        | `MAX_KEYBINDING_CHORD_STROKES`, `keybindingChordSchema`, wired in                                                                                                                                                                                                                                                                                               | §5. Value type unchanged.                                                                                                                             |
| `packages/contracts/src/settings/keys.ts`                                   | `keybindings.overrides` description + `'chord'` keyword                                                                                                                                                                                                                                                                                                         | Only diff visible in the generated doc.                                                                                                               |
| `packages/contracts/src/index.ts`                                           | Re-export `MAX_KEYBINDING_CHORD_STROKES`                                                                                                                                                                                                                                                                                                                        | The keymap imports the cap rather than re-declaring it.                                                                                               |
| `docs/settings-reference.md`                                                | Regenerate with `bun run settings:reference`                                                                                                                                                                                                                                                                                                                    | Description changed.                                                                                                                                  |
| `docs/settings-registry-inventory.md`                                       | Strike two now-false claims in the `keybindings.overrides` row (`:36`)                                                                                                                                                                                                                                                                                          | "The shape is deliberately DEFERRED" and "the document key on disk is `keybindings`" are both false — the registry is flat-keyed by dotted id.        |
| `docs/vscode-keymap-development.md`                                         | Move `:117-118` to Implemented; unblock `:131-132` and `:161-162`; answer `:126`; refresh the status stamp                                                                                                                                                                                                                                                      | This doc's Remaining Work section **is** this feature.                                                                                                |
| `plans/055-ghostty-webgpu-dom-input.md`                                     | Add one checklist line recording the chord seam (D2)                                                                                                                                                                                                                                                                                                            | The contract is recorded on both sides.                                                                                                               |
| `plans/README.md`                                                           | Add this plan to the tackle-order table                                                                                                                                                                                                                                                                                                                         | Index.                                                                                                                                                |
| `apps/web/test/factories/key-binding.ts`                                    | **NEW** — shared chord-aware `binding()` factory                                                                                                                                                                                                                                                                                                                | Replaces three duplicated per-file builders, two of which are typed to the literal union `'Mod+S' \| 'Mod+W'` and cannot accept a chord fixture.      |
| `apps/web/src/keymap/tests/chord.test.ts`                                   | **NEW** (node)                                                                                                                                                                                                                                                                                                                                                  | §9.                                                                                                                                                   |
| `apps/web/src/keymap/tests/keymap-trie.test.ts`                             | **NEW** (node)                                                                                                                                                                                                                                                                                                                                                  | §9.                                                                                                                                                   |
| `apps/web/src/keymap/tests/chord-machine.test.ts`                           | **NEW** (node)                                                                                                                                                                                                                                                                                                                                                  | §9.                                                                                                                                                   |
| `apps/web/src/keymap/tests/keymap.test.ts`                                  | Rewrite `binding()`, `keysFor`, `matchFor`/`matchedCommand`, `duplicateBindingSlots` → prefix-aware `conflictingBindingSlots`; add hygiene test; **delete** `describe('command palette command availability')` at `:661-682`                                                                                                                                    | That block is a verbatim subset of `command-enablement.test.ts:27-41`.                                                                                |
| `apps/web/src/keymap/tests/use-app-keymap.test.tsx`                         | `pressSequence` helper; arm/complete/unmatched/Escape/timeout/blur/pane-change/repeat cases                                                                                                                                                                                                                                                                     | The five existing single-key cases stay as regressions.                                                                                               |
| `apps/web/src/keymap/tests/command-table.test.ts`                           | `RESERVED_CHORDS` → `RESERVED_HOTKEYS`                                                                                                                                                                                                                                                                                                                          | Vocabulary.                                                                                                                                           |
| `apps/web/src/keymap/tests/session-commands.test.ts`                        | `boundCommands()` becomes `Map<command, string[]>`                                                                                                                                                                                                                                                                                                              | Today a second binding per command is silently overwritten.                                                                                           |
| `apps/web/src/features/settings/tests/chord-recorder.test.tsx`              | Add two-stroke capture, Backspace-pop, Enter-commit, partial label. **Keep** `:12-23` and `:36-45`                                                                                                                                                                                                                                                              | The prefix-conditional commit rule preserves both.                                                                                                    |
| `apps/web/src/features/settings/tests/keybinding-section.test.tsx`          | Keep `:53-76`; add the chord twin through the real server                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                     |
| `apps/web/src/features/settings/tests/api.test.ts`                          | Chord override round-trips through the real server                                                                                                                                                                                                                                                                                                              | —                                                                                                                                                     |
| `apps/web/src/features/settings/utils/tests/keybinding-rows.test.ts`        | Rename the "matches on the chord" case; add prefix and glyph search                                                                                                                                                                                                                                                                                             | "Chord" now means something else.                                                                                                                     |
| `apps/web/src/features/menus/utils/tests/shortcut.test.ts`                  | Move to `apps/web/src/keymap/tests/format-keys.test.ts`                                                                                                                                                                                                                                                                                                         | Follows the module.                                                                                                                                   |
| `apps/web/src/features/menus/utils/tests/resolve.test.ts`                   | Use the shared factory                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                     |
| `apps/web/src/features/command-palette/tests/command-palette-utils.test.ts` | Add a chord `shortcut` assertion                                                                                                                                                                                                                                                                                                                                | `:16-27` pins `stringMatching(/P$/u)`.                                                                                                                |
| `packages/contracts/src/tests/settings-registry.test.ts`                    | Accept 1 and 2 strokes, reject 3, empty, double space; pin arity to `MAX_KEYBINDING_CHORD_STROKES`                                                                                                                                                                                                                                                              | The cap is encoded twice; only a test joins them.                                                                                                     |

## Phases

Each phase leaves `bun run verify` green and is independently shippable.

### Phase 1 — Vocabulary and the strokes model

`chord: KeyChord` replaces `hotkey`; every default becomes a one-element tuple. `keys` derivation unchanged. No chord exists in the table yet; no runtime behaviour changes.

**Exit criterion:** the full resolved table is byte-identical before and after. Prove it mechanically — dump `defaultPlatformKeyBindings(p).map(b => \`${b.pane}:${b.keys}:${b.command}\`).sort()` for mac/linux/windows and diff against a pre-change capture. Expected: 124/107/105 entries, zero diff. Delete the probe after (no scratch files in the repo).

### Phase 2 — Trie matcher, still single-stroke

Matcher rewrite with zero user-visible change. The listener is still bubble-only and still stateless.

**Exit criterion:** every existing case in `keymap.test.ts:184-228` (printed key, Cyrillic/Hebrew `event.code` fallback, punctuation fallback, AZERTY guard, override honoured) and `use-app-keymap.test.tsx` passes unmodified in substance. Per-pane counts re-measured and unchanged: editor 33 mac / 32 linux+windows, file-tree 35/34, every other pane 34/33.

### Phase 3 — Prefix-aware collision and hygiene

A chord override now survives resolution and shadows correctly. Nothing arms yet — a chord binding is built, collides correctly, and is simply unreachable at runtime.

**Exit criterion:** `resolvedPlatformKeyBindings(defaults, { 'workspace.showSettings': 'Mod+K Mod+S' })` produces a binding with `keys === 'Mod+K Mod+S'` and `chord.length === 2`; the hygiene test passes on all three platforms; `bun run settings:reference` produces no further diff.

### Phase 4 — Pending state machine and the completion listener

Chords arm and complete. Still no default chord in the table — driven by test fixtures and a hand-written override.

**Exit criterion:** with `{'workspace.showSettings': 'Mod+K Mod+S'}`, pressing `Mod+K` arms (indicator visible, nothing dispatched, event swallowed) and `Mod+S` dispatches exactly once. All `dom` cases in §9 pass. The five pre-existing single-key cases still pass.

### Phase 5 — Display, recorder, and the shipped default

**Exit criterion:** `formatChord('Mod+K Mod+S')` renders `⌘K ⌘S` on mac and `Ctrl+K Ctrl+S` elsewhere; the recorder captures a two-stroke chord and writes it through the real server; `Mod+K Mod+S` opens settings in the running app; searching `⌘K` and `Mod+K` both find the row.

## Test plan

Always `cd apps/web` first — running vitest from the repo root picks up the wrong config. Vitest 4 has no `--repeat`; loop in bash for flake hunting.

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project node --project dom src/keymap
```

```bash
cd /Users/shaul/Desktop/D/platform/apps/web && bun --bun vitest run --project dom src/features/settings/tests
```

```bash
cd /Users/shaul/Desktop/D/platform/packages/contracts && vitest run src/tests/settings-registry.test.ts
```

### `node` — `chord.test.ts` (NEW)

- `keysConflict('Mod+K', 'Mod+K Mod+S')` is `true`; `keysConflict('Mod+K2', 'Mod+K Mod+S')` is `false`.
- `keysConflict('Mod+K Mod+S', 'Mod+K Mod+B')` is `false`.
- `isBindableChord('Mod+K Mod+S')` is `true`; `'Mod+K Mod+Nonsense'` is `false`.
- `isBindableChord('Ctrl+W V')` is `false` — the second token is a dead key `'W V'` no event can match.
- `isBindableChord('Mod+K Mod+S Mod+X')` is `false` (3 > `MAX_CHORD_STROKES`).
- `isBindableChord('K Mod+S')` is `false` — a bare-key first stroke can never arm in a text field.
- **Regression guard:** parsing `'Mod+K Mod+S'` through the chord path yields two `ParsedHotkey`s, never the single `{key:'S',meta:true}` raw `parseHotkey` returns.
- `normalizedChord('mod+k mod+s', 'mac') === 'Mod+K Mod+S'`.

### `node` — `keymap-trie.test.ts` (NEW)

- A one-stroke and a two-stroke binding on the same prefix: the one-stroke wins, the chord lands in `dropped`.
- The `binding XOR next.size > 0` invariant holds for every node built from `defaultPlatformKeyBindings(p)` on all three platforms.
- Two chords sharing a prefix both resolve; the shared node's `continuations === 2`.
- Per-stroke `event.code` fallback: `'и'`/`KeyB` completes `Mod+K Mod+B`.
- Per-stroke Latin-letter guard: AZERTY `'z'`/`KeyW` does **not** complete `Mod+K Mod+W`.
- Modifier mask: `Mod+Shift+S` does not match a `Mod+S` edge and vice versa.

### `node` — `chord-machine.test.ts` (NEW)

- Unarmed + prefix → `arm`. Armed + completer → `run` with `fromChord: true`.
- Armed + unbound key → `cancel`/`unmatched`. Armed + `Escape` → same (no special case).
- Armed + modifier-only → `swallow`, `pending` unchanged.
- Armed + `repeat: true` → `swallow`, `armedAt` unchanged. **Unarmed + `repeat: true` on a prefix → `ignore`.**
- `isComposing: true` → `ignore`, armed or not.
- Armed + `now - armedAt > CHORD_TIMEOUT_MS` → `cancel`/`timeout`.
- Unarmed, `targetsTextEntry: true`, Ctrl/Meta prefix → still arms. Bare `F1` → `ignore`.
- Armed + a second prefix stroke of a 3-deep chord → `arm` with `matched.length === 2` (the trie is N-capable even though the contract caps at 2).

### `node` — `keymap.test.ts` (rewritten)

- A chord override survives `resolvedPlatformKeyBindings`; keep `'Mod+K Mod+Nonsense'` as the still-invalid input.
- A user's bare `Mod+K` shadows a default `Mod+K Mod+S`, and vice versa, with `shadowedBy` recorded both ways.
- Two chord overrides with the same sequence: later wins, earlier gets `shadowedBy`.
- Two chords sharing a prefix in the same pane are **not** a collision.
- `conflictingBindingSlots(defaultPlatformKeyBindings(p))` is `[]` on all three platforms.
- **Hygiene invariant:** every `chord.length > 1` binding's first stroke matches no other binding's `keys` anywhere in the table, and carries Ctrl or Meta, on all three platforms.
- **Editor-layer guard:** no binding from `editorKeymapLayersFromPlatform(defaultPlatformKeyBindings(p))` has a space in its normalized hotkey.
- `editorKeyBindingFromPlatform` returns `null` for a multi-stroke binding.
- **Preserved:** `appKeyBindingsForPane(defaultPlatformKeyBindings('mac'), 'editor')` has length 33 and contains no `Mod+[`/`Mod+]`.

### `dom` — `use-app-keymap.test.tsx`

- A prefix dispatches nothing and calls `preventDefault()`.
- `pressSequence(body, prefix, completer)` dispatches the command exactly once.
- Prefix then an unbound key: nothing dispatched, and that key does **not** fall through to its own single-key binding.
- Prefix then Escape: nothing dispatched.
- Prefix, advance fake timers past `CHORD_TIMEOUT_MS`, then the completer: nothing dispatched.
- Prefix, `window` blur, then the completer: nothing dispatched.
- Prefix, re-render with a different `focusedPane`, then the completer: nothing dispatched.
- Prefix, then `pointerdown` on `document`: cancelled.
- Prefix, a held-key repeat of the prefix, then the completer: dispatched exactly once.
- With an `<input>` focused: prefix arms, the completer runs, and **the input's value does not change**.
- Unmounting while armed clears the pending state.
- **Preserved unchanged:** the five existing cases at `:12-63`.

### `dom` — settings

- `chord-recorder.test.tsx`: **keep** `:12-23` and `:36-45`. Add: two strokes on a prefix call `onChange` **once** with `'Mod+K Mod+S'`; the button shows the partial chord after stroke 1; `Backspace` pops; `Enter` after a prefix stroke commits it as a single hotkey.
- `keybinding-section.test.tsx`: keep `:53-76`; add the chord twin writing `'Mod+K Mod+S'` through the real in-process server; a chord row renders glyphs, not raw notation.

### `node` — consumers

- `matchingKeybindingRows(rows, 'Mod+K')` and `(rows, '⌘K')` both match a `Mod+K Mod+S` row.
- `formatChord('Mod+K Mod+S')` renders two glyph groups joined by `CHORD_DISPLAY_SEPARATOR`; `formatChord('Mod+S')` is unchanged from today's `formatHotkey('Mod+S')`.
- Palette item `shortcut` for a chord command contains both strokes.

### `packages/contracts`

- Accepts `'Mod+S'`, `'Mod+K Mod+S'`, `null`. Rejects `'Mod+K Mod+S Mod+X'`, `''`, `'  '`, `'Mod+K  Mod+S'`.
- `KEYBINDING_CHORD_PATTERN`'s maximum token count equals `MAX_KEYBINDING_CHORD_STROKES`.

### `browser`

**No new browser tests.** There is no trusted keyboard input in this repo: `vitest.browser.config.ts:46-53` registers exactly four `browser.commands`, all mouse. See D10.

## Risks and open decisions

Every item is resolved with a decision. D1, D2 and D3 are the ones a human should overrule if they disagree.

**D1 — Listener phase. DECIDED: bubble for the unarmed path; capture only while armed.**
Always-on document capture pre-empts every React `onKeyDown` (React 19 mounts at `#root`, `main.tsx:66`) — including `chord-recorder.tsx:40-47`, whose own comment says "while recording, the whole keyboard belongs to the recorder"; recording `Mod+S` would fire Save. Arming-only capture confines the precedence change to the ≤5s where "the app owns the keyboard" is the stated semantic, and the recorder can never be armed. **Cost accepted:** a prefix cannot arm inside the LSP completion popup or the find widget. Rule 3(b) keeps prefixes off keys those surfaces claim.

**D2 — Terminal chords. DECIDED: intended yes; deferred to the ghostty host swap; no knob in this plan.**
The old `ghostty-web` swallows every Ctrl/Meta key on a bubble listener on its container, ending `preventDefault(), stopPropagation()`, and makes the host `contenteditable`. So the app keymap is **already** dead there for exactly those keys — chords not arming in the terminal today is the status quo, not a regression.

`plans/055-ghostty-webgpu-dom-input.md:534` replaces that with a package-owned textarea host that "prevent[s] browser default only when the terminal consumes the event". At that point we own the policy and chords should arm, matching both references: VS Code ships `terminal.integrated.allowChords` at `default: true`, and Zed does it unconditionally.

**The knob does not ship here.** `terminal.integrated.allowChords` would write a value nothing reads until 055 Phase 4 swaps the host, and CLAUDE.md is explicit: "A key is never registered inert. Register it in the same pass that wires its consumer, or do not register it." So this plan states the seam and adds a reciprocal line to 055's checklist; the knob ships with the host.

When it does ship: scope is **`application`**, not `window` like its three `terminal.integrated.*` neighbours — those are font size, scrollback and cursor blink, all appearance; `allowChords` decides whether a keystroke is a command or reaches the shell, which is execution-reaching.

**Known collision to document at that time:** on Linux and Windows `Mod` is Ctrl, so a `Mod+K` prefix _is_ readline's `kill-line`. VS Code ships the same collision knowingly and their docs name it as the reason for the off switch, verbatim: "setting this to false is particularly useful when you want ctrl+k to go to your shell (not VS Code)." On mac `Mod` is Cmd and there is no conflict.

**D3 — Whole-record invalidation on a hand-typed bad chord. DECIDED: regex in the contract; accept the risk; document the recovery.**
Valibot's `record` fails `safeParse` for the entire value on one bad entry, so a hand-edited 3-stroke chord drops **every** keybinding override to `{}` with one diagnostic. Mitigations: the write API rejects before disk; the recorder cannot emit it; the diagnostic names the offending command; plan 049b will turn the regex into a draft-07 `pattern` and squiggle it pre-save. **Escape hatch if this bites:** move the grammar into `appliedOverrides`, which drops one entry — at the cost of the typed write error and the future squiggle.

**D4 — Recorder terminating gesture. DECIDED: commit immediately unless the stroke is a live chord prefix; otherwise `Enter` commits, `Backspace` pops, `Escape` cancels.**
An auto-commit window silently produces a single-key binding for a slow user. Unconditional `Enter` costs a keypress on every single-key rebind, the common case. The prefix-conditional rule costs nothing on the common path and keeps two existing tests passing verbatim.

**D5 — Chord-bound `editor.*` commands. DECIDED: allowed, capability-gated, dead on the diff pane.**
`diff-pane.tsx:90` deliberately never registers a dispatch and gets zero bindings via `DIFF_KEYMAP`. A chord-bound editor command being a no-op there is consistent with that design. **Accepted looseness:** the chord path is scoped by `pane: 'editor'` rather than DOM containment, which `getHotkeyManager`'s `target` gave the layer path for free.

**D6 — `keybindings.chordTimeout` setting. DECIDED: no. Ship 5000 ms as a constant.**
Nobody has asked, VS Code has none, and CLAUDE.md's rule is that an inert key is worse than no key.

**D7 — Matcher unification. DECIDED: out of scope; own plan.**
The end state is right and answers `docs/vscode-keymap-development.md:126`, but it deletes a prop across 21 files in 6 features, changes the focus store API, reimplements the editor's `preventDefault ?? handled` rule by hand, and must invent a third capability for the diff pane's deliberate zero-binding keymap.

**D8 — Pending indicator. DECIDED: `<output aria-live='polite'>` pill, bottom-left, `surface-vibrancy`, rendered by `AppKeymapController`.**
This app has no global status bar. The `<output aria-live='polite'>` shape follows the precedent at `tree-search-actions.tsx:51-56`. `surface-vibrancy` is the codebase's floating-surface material and is self-contained — no `bg-popover` alongside it. Copy: `⌘K pressed — waiting for the next key (3 available)`, count from `node.continuations`. **No toast on unmatched** — a toast plus a live region would double-announce.

**D9 — `use-prompt-stash.ts:42` outranks everything. DECIDED: leave it, note it.**
It registers on **`window`** in capture, so it beats `document` capture in any phase, and calls `preventDefault()` without `stopPropagation()` — so `Mod+S` in the chat composer currently both stashes the prompt **and** fires `workspace.saveFile`. A pre-existing double dispatch this plan surfaces but does not cause. **Spin off a separate task** to convert it into a real pane-scoped binding.

**D10 — Trusted keyboard input in tests. DECIDED: accept the gap.**
Everything is verified with synthetic events. Browser-level behaviour (Chrome consuming a prefix, dead-key composition mid-chord, real IME) is unproven. A `proofKeyPress` browser command wired to `context.page.keyboard` is the only route and is net-new infrastructure. **Follow-up, not a blocker** — the arming-only capture design keeps the untested surface small.

**D11 — Cross-pane prefix conflicts are arbitrated but not reported. ACCEPTED.**
`collidesWith` requires equal panes, so a user's `any`-pane `Mod+K` and an `editor`-pane `Mod+K Mod+S` produce no `shadowedBy` row; the trie drops one by rule 4 and logs a warn. Revisit if the warn ever fires in practice.

**D12 — `'problems'` is a `FocusArea` with no writer** (`focus-state.ts:13`). A pane-scoped chord targeting it can never resolve. Not caused by chords; do not ship a `problems`-scoped chord.

**D13 — `FocusArea` has no chat member.** The chat composer resolves to `'global'`, so per-pane chords are unexpressible there and a chord armed in the composer completes against the global table. Accepted for v1.

**D14 — 143 mechanical literals** (18 in `workspace-commands.ts`, 112 in `editor-commands.ts`, 13 in `default-bindings.ts`). Compiler-enumerated, but a careless `sed` silently rebinds a key rather than failing. **Mitigation is Phase 1's exit criterion.**

**D15 — `RegisterableHotkey` has two arms and `chord` inherits both.** `default-bindings.ts:52` produces the string arm; `userKeyBinding` produces the `RawHotkey` object arm. `chordKeys` must normalize both. On linux 11 defaults already have `hotkey !== keys`, so **the Phase 1 table diff must be run per platform, not once.**

## Drift check

Re-verify each before writing code.

**Uncommitted WIP will shift line numbers.** `packages/contracts/src/settings.ts`, `settings/keys.ts`, `index.ts` and `tests/settings-registry.test.ts` are modified by unrelated LSP work. **Re-locate every contracts line by symbol, not by number.**

| Location                                                              | Must still say                                                                                                                                                                                                                                                                                                                                                 | Why it matters                                                                                                                                 |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `keymap/active-bindings.ts:168`                                       | `if (entries.length === 0) return { bindings: defaults, ... }`                                                                                                                                                                                                                                                                                                 | If gone, `collidesWith` runs for every user and the trie's independent arbitration becomes belt-and-braces rather than load-bearing.           |
| `keymap/active-bindings.ts:228-232`                                   | `collidesWith` compares `candidate.keys !== binding.keys` then panes                                                                                                                                                                                                                                                                                           | The one-line widening point.                                                                                                                   |
| `keymap/use-app-keymap.ts:57`                                         | `activePlatformKeyBindings(...).filter(isAppKeyBinding)` — arbitrate then filter                                                                                                                                                                                                                                                                               | Reversing resurrects `Mod+[`/`Mod+]` (measured 33→35 mac).                                                                                     |
| `keymap/use-app-keymap.ts:47`                                         | `document.addEventListener('keydown', onKeyDown)` — no third argument                                                                                                                                                                                                                                                                                          | If already moved to capture, D1 is void and the precedence analysis must be redone.                                                            |
| `keymap/default-bindings.ts:96-107`                                   | 10 `reservedBrowserChords`, all `preventDefault`+`stopPropagation`                                                                                                                                                                                                                                                                                             | `recordShadowedCommand` returns early for `command: null`, so a reserved key becoming a prefix would drop the chord silently.                  |
| `features/editor/components/editor.tsx:123`                           | `defaultBindings: false`                                                                                                                                                                                                                                                                                                                                       | The whole "platform authors 100%" claim. Also check `diff-options.ts:33` and `result-file-editor.tsx:112`.                                     |
| `features/editor/utils/diff-options.ts:31-34`                         | `{ defaultBindings: false, layers: [] }`                                                                                                                                                                                                                                                                                                                       | The diff has zero bindings **on purpose**. D5 depends on it.                                                                                   |
| `features/settings/components/json-view.tsx:52`                       | `<Editor active ... />`                                                                                                                                                                                                                                                                                                                                        | This surface _does_ register a dispatch. If `active` is removed, D5 changes.                                                                   |
| `features/chat/hooks/use-prompt-stash.ts:42`                          | `window.addEventListener('keydown', handleKeyDown, true)`                                                                                                                                                                                                                                                                                                      | Window capture beats document capture in every phase (D9).                                                                                     |
| `main.tsx:66`                                                         | `createRoot(document.getElementById('root')!, ...)`                                                                                                                                                                                                                                                                                                            | React delegates at `#root` (D1).                                                                                                               |
| `node_modules/ghostty-web/dist/ghostty-web.js:819`                    | `this.container.addEventListener("keydown", ...)` — bubble                                                                                                                                                                                                                                                                                                     | D2. Also confirm the encoder path still ends `preventDefault(), stopPropagation()` and the host still gets `contenteditable="true"` (`:2353`). |
| `Editor/packages/editor/src/editor/keymap.ts:33-38`                   | `EditorKeyBinding.hotkey: RegisterableHotkey` (single)                                                                                                                                                                                                                                                                                                         | The multi-stroke guard's whole justification.                                                                                                  |
| `Editor/packages/editor/src/editor/keymap.ts:94-116`                  | `getHotkeyManager().register(...)` with `target`, no `capture`                                                                                                                                                                                                                                                                                                 | Bubble on `scrollElement` → runs before document bubble.                                                                                       |
| `Editor/packages/editor/src/editor/keymap.ts:120-130`                 | `shouldPreventDefault`/`shouldStopPropagation` mirror `handled`                                                                                                                                                                                                                                                                                                | A handled editor binding hides the key from document bubble.                                                                                   |
| `@tanstack/hotkeys@0.8.0` behaviour                                   | `parseHotkey('Mod+K Mod+S','mac')` → `{key:'S',meta:true}`; `normalizeRegisterableHotkey` → `'Mod+S'`; `validateHotkey('Mod+K Mod+S')` → `valid:false`; `validateHotkey('Ctrl+W V')` → `valid:true` + warning; `formatHotkeySequence(['Mod+K','Mod+S']) === 'Mod+K Mod+S'`; `SequenceManager` applies preventDefault only on the final step and expires lazily | Re-run the probe after any dependency bump.                                                                                                    |
| Probe over `defaultPlatformKeyBindings(p)`                            | mac 124 / linux 107 / windows 105; **0 bindings with a space in `keys`**; **`Mod+K` bound to nothing**                                                                                                                                                                                                                                                         | Space-as-separator and the `Mod+K` choice both depend on this.                                                                                 |
| Probe over `appKeyBindingsForPane(...)`                               | editor 33 mac / 32 linux+windows; file-tree 35/34; others 34/33                                                                                                                                                                                                                                                                                                | The Phase 2 exit criterion.                                                                                                                    |
| `keymap/workspace-commands.ts:602`, `:614`                            | `Mod+[` / `Mod+]`, no `pane`, no `preventDefault`                                                                                                                                                                                                                                                                                                              | Half of the build-order regression.                                                                                                            |
| `features/menus/utils/shortcut.ts:24`                                 | `hotkey.split('+')`                                                                                                                                                                                                                                                                                                                                            | The corruption being fixed. Confirm `commandShortcut:14`'s `typeof binding.hotkey === 'string'` branch is present before deleting it.          |
| `features/settings/utils/keybinding-rows.ts:29-34`                    | `commandsShadowedBy` reads only `row.shadowedBy`                                                                                                                                                                                                                                                                                                               | Needs **no change**; if it starts comparing keys directly, the free prefix reporting is lost.                                                  |
| `packages/contracts/.../registry.ts:82`                               | `\| (TValue extends Readonly<Record<string, string \| null>> ? 'record' \| 'keybindings' : never)`                                                                                                                                                                                                                                                             | The compile-time tripwire forcing the string shape.                                                                                            |
| `lib/wide-event-scope.ts`                                             | `createWideEventScope` exists and no-ops when logging is off. **`area: 'keymap'` does not exist — use `area: 'command'`**                                                                                                                                                                                                                                      | The chord lifecycle event's mechanism.                                                                                                         |
| `apps/web/vitest.browser.config.ts:46-53`                             | exactly four `browser.commands`, all mouse                                                                                                                                                                                                                                                                                                                     | D10.                                                                                                                                           |
| `docs/vscode-keymap-development.md:117-118, :126, :131-132, :161-162` | the multi-chord Remaining Work entries and the status stamp                                                                                                                                                                                                                                                                                                    | This doc's Remaining Work section is this feature.                                                                                             |
| `plans/055-ghostty-webgpu-dom-input.md:527`, `:534`                   | "Do not make the whole host contenteditable"; "Prevent browser default only when the terminal consumes the event"                                                                                                                                                                                                                                              | In flight. If it lands first, D2's deferral collapses and the knob ships sooner.                                                               |
