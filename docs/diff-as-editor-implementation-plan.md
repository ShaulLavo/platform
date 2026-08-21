> [!IMPORTANT]
> **STATUS: 🟢 SHIPPED — [platform#13](https://github.com/ShaulLavo/platform/pull/13), on top of
> [singapor@693c106](https://github.com/ShaulLavo/singapor/commit/693c106) which is already on that
> repo's `main` (CI clones it). 2026-08-21. Typecheck, lint, format clean; 1,824 tests in `apps/web`
> and 90 in `packages/diff`; driven in the running app in split and stacked, light and dark.**
> Platform half of a two-document pair. The editor half is
> [`/Users/shaul/Desktop/D/Editor/docs/plan-diff-as-editor.md`](../../Editor/docs/plan-diff-as-editor.md),
> whose **§ The contract** is normative and cited here as `§C1`–`§C11`. That document's header is now
> stale in two places: it says this half "has not started", and it says platform deliberately
> resolves `@singapor/diff` to the main checkout. The editor branch was merged into Editor `main`
> (PR #6, `e7dd0df`) before this half began, so the `bun link` repoint of §8.2 was never needed and
> was never made.
>
> **The migration did not land inside platform alone.** Four defects were found that live in
> `packages/diff`, three of them only observable once a real host mounted the plugin the way React
> mounts things. They are fixed there, with tests, in `singapor@0274f6d` and `@693c106`:
>
> - **The plugin went permanently deaf to expansion after a remount.** `activate()` registered a
>   disposable tearing down the region subscription the _constructor_ created, so the first
>   deactivation was terminal. React StrictMode makes mount → unmount → mount the normal
>   development path, so in the real app **every gutter click did nothing** while the same code
>   passed every test — the package's own suite and platform's, because neither mounts under
>   StrictMode. Both new platform component tests now do.
> - **A caret could rest on a `Show N unmodified lines` separator**, and a collapsed caret copies its
>   own line — so Cmd+C put that sentence on the clipboard. `handleMouseDown` now refuses every
>   separator, not only the expandable ones, and at every click count — it had guarded on
>   `detail === 1`, and `InputSelectionController` branches on `detail` before anything else, so a
>   double-click still selected a word of the label. A drag that _crosses_ one still covers it and
>   always will while the label occupies buffer offsets.
> - **The diff had a blinking caret at all**, which is an insertion point in a view that has nothing
>   to insert. `.editor-diff-view .editor-virtualized-caret-layer { display: none }` now ships with
>   the package, next to the rest of the block a host opts into by stamping the class.
> - **`pointerEvent` in the package's own tests built non-cancelable events**, so `preventDefault()`
>   was a no-op and no test could ever have observed caret suppression. Fixed; that is what let the
>   two above be asserted.
>
> **Seven things shipped differently from the plan.**
>
> 1. **§2 could not land as its own green commit, and not for want of trying.** It assumes platform
>    starts from a tree that still compiles against the old package. It does not: `DiffView` was
>    already gone, so `bun run typecheck` had four errors rather than two and there was no green
>    baseline to migrate _from_. The `expandedHunks` fix landed inside the migration; the mirror it
>    belonged to is deleted outright, which was §4's plan for it anyway.
> 2. **§3.1's `@singapor/panes` move did not happen.** Platform already ships
>    `@workspace/ui/components/resizable` over `react-resizable-panels`, and both other split
>    layouts use it. Adding a second pane library to render two panes would be the duplication §2.4
>    spends a section arguing against. Plain `ResizablePanelGroup`, not the persisted one — §5
>    forbids a new `localStorage` key.
> 3. **§4's drift check is not merely redundant now, it is wrong.** After the editor half narrowed
>    row decorations to rows that differ from the default, a **context row carries no
>    `editor-diff-row` class at all**, so `classList.contains(diffRowTypeClassName(row))` would
>    reject every context row. Deleting it was forced, not tidy-up.
> 4. **§C9 decided:** `selectionSyncMode` is left at its default, and copy is tested rather than
>    assumed. A selection over a deletion row yields the bare line; a collapsed caret copies its
>    whole line plus terminator.
> 5. **The React `document` prop is the wrong push path, and §3's sketch would have shipped a
>    regression.** `useEditor`'s document sync goes through `openDocument`, which takes no scroll
>    position and lands back at the top — so every expansion toggle, and every keystroke behind a
>    compare-saved diff, would have thrown the reader's place away. The pane calls `Editor.setText`
>    from a layout effect instead, which is what §C10 and the package README name.
> 6. **Scroll sync needed two things the plan does not mention, and I got the second one wrong
>    twice before a review pass settled it.** `useEditor` exposes no scroll signal, so a
>    view-contribution plugin supplies one. The offsets must come from `snapshot.viewport` in the
>    contribution's `update` hook — NOT from a `scroll` listener on the element, and not from
>    `Editor.getScrollPosition()`. The virtualizer redefines `scrollTop` on the element to return
>    its own logical offset and updates it in a `requestAnimationFrame` scheduled from the same
>    scroll event, so both of those read the offset from _before_ the scroll they are being told
>    about; a gesture whose whole delta arrives in one event — a scrollbar-track click — moves one
>    pane and never the other. My own browser verification could not see this, because driving
>    `element.scrollTop` from a probe goes through the virtualizer's _setter_, which folds
>    synchronously — a path no real wheel takes. The echo guard that stops the mirrored pane
>    mirroring back is matched on the position the write _landed_ at rather than being a one-shot
>    flag for that side: a write that lands where the pane already was emits no event at all, and a
>    bare flag then stays armed and swallows the reader's next scroll of that pane.
> 7. **§5 overstates one of its three braces.** `keymap/command-enablement.ts` gates on
>    `compare-saved:`, search-buffer and ref ids but **not** on `git-diff:`, so a git diff tab does
>    report as file-backed to the palette and the menus. The save path itself refuses both schemes,
>    which is what the new test pins. Pre-existing, left as found, spun off as its own task.
>
> **Verified in the running app** (a second web+server pair on the worktree, since the origin
> allowlist is exact): deletion rows carry syntax highlighting — the §C2 property the whole design
> exists for; gutter clicks expand and collapse, and a click on the _old_ pane's gutter moves both
> panes together (§C7); the light palette drives every `--editor-diff-*` token; no caret anywhere.
> **Not** verified by hand: a real wheel scroll. The automation pane became unusable partway through
> (0×0 viewport, dropped scroll events), so the scroll path rests on reading the virtualizer plus
> the automated coverage below.
>
> **What the review pass changed about the tests.** Every new test was mutation-checked — the
> behaviour it names was broken in the source and the test that claims it failed. That found two
> assertions that could never have failed: `defaultPrevented` cannot tell the plugin's refusal from
> the editor's own `preventDefault()`, and happy-dom's zero-sized rects make the caret land at the
> end of the document either way. The caret test asserts on FOCUS instead. Scroll and focus
> behaviour is driven against a doubled `Editor`, because clamping, echo suppression and
> `reveal: false` are about order and arguments, which happy-dom cannot produce.
>
> **CI is red on `main` already**, and this branch inherits it:
> `apps/server/src/settings/tests/store-watch.test.ts` is flaky and has failed every run since
> 2026-08-20, a different case each time. Nothing here touches `apps/server`.

# Diff as Editor — Platform Implementation Plan

Replacing `new DiffView(container, …)` with real `Editor`s, and re-hooking the git line-comment layer
onto the plugin instead of onto `DiffView`'s DOM.

---

## 1. What platform actually owns here

Only two components construct a `DiffView`, and they are structurally identical — construct on
`[editorTheme, ready]`, push `files` and `mode` through separate effects, keep `files` `useMemo`-stable
so a refetch does not reset scroll:

| Mount site                                                                                                                     | Document scheme  | Diff source                                            |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------ |
| [`features/git/components/diff-view.tsx:50-77`](../apps/web/src/features/git/components/diff-view.tsx)                         | `git-diff:`      | `editorDiffFiles(diffs)` from a snapshot or checkpoint |
| [`features/editor/components/compare-saved-view.tsx:45-70`](../apps/web/src/features/editor/components/compare-saved-view.tsx) | `compare-saved:` | `createTextDiff(buffer vs disk)`, re-run per revision  |

Both are routed by document id in
[`features/workbench/components/file-editor-body.tsx:41-50`](../apps/web/src/features/workbench/components/file-editor-body.tsx),
whose comment is the load-bearing fact for this whole plan: _"A diff document is never file-backed, so
it can never own a live editor."_ Still true after the migration — §5.

Everything else platform-side is the **line-comment layer**, which is where the risk is.

---

## 2. Fix the red baseline first — before anything else

`bun run typecheck` in `apps/web` **fails today**:

```
src/features/git/utils/diff-line-selection.ts(37,66): error TS2353: Object literal may only specify known
  properties, and 'expandedHunks' does not exist in type 'DiffProjectionOptions'.
src/features/git/utils/diff-line-selection.ts(39,52): error TS2353: …
```

Editor commit `e5c0a0a` re-keyed collapsed regions from hunk ordinals to identities — the option became
`expandedRegions: ReadonlySet<string>` keyed `"{oldStart}:{newStart}"` (`projection.ts:25-28,246-248`) —
and this consumer was never updated.

It is worse than a type error. `toggleExpandedHunk` keys off `row.hunkIndex`
([`diff-line-selection.ts:139`](../apps/web/src/features/git/utils/diff-line-selection.ts)), which is not
the identity the view toggles on (`row.expandKey`), and trailing-tail regions carry
`hunkIndex === undefined` (`projection.ts:294-310`) so they can **never** be mirrored. The line-comment
layer's view of which regions are expanded has been wrong for any diff with a trailing region since
`e5c0a0a`.

**Land the minimal fix as its own commit, first.** Until typecheck is green, no signal from any later
step means anything. Do not fold it into the migration — the point is to have a green baseline to
migrate _from_. The mirror is deleted entirely in §4; this commit only makes it compile and key
correctly.

---

## 3. The shared mount component

The two mount sites collapse into one component in `features/editor/components/`, which both features
already import from.

**Template to consult, not copy wholesale:**
[`features/search/components/result-file-editor.tsx:123-137`](../apps/web/src/features/search/components/result-file-editor.tsx)
is the existing narrow read-only `Editor` mount. **Two of its options are wrong for a diff** — see the
warnings below.

```tsx
useEditor({
  document, // synthetic: joinRenderLines(plugin.getRows())      §C3
  documentMode: 'static', //                                                   §C1
  editability: 'readonly',
  languageId: null, // NOT the file's language                           §C11
  tabSize: EXPLICIT_DIFF_TAB_SIZE, // never omit                                        §C10
  keymap: { defaultBindings: false, layers: [] }, // §C6 #2
  cursorLineHighlight: { gutterNumber: false, gutterBackground: false, rowBackground: false },
  storeSync: 'none',
  plugins: [diffPlugin], // ONLY the diff plugin
  theme: editorTheme,
})
```

**[Consequence] §C6 #4 — `cursorLineHighlight` must be explicit `false`s, not omitted.** The default is
`{ gutterNumber: false, gutterBackground: true, rowBackground: true }`
(`virtualizedTextView.ts:160-164`). Omitting the option paints a cursor-line row _and_ gutter background
on top of the diff row tint — something `DiffView` never had.

**[Consequence] §C10 — `tabSize` must be passed.** `adoptDocumentTabSize` guesses from the buffer on
every `setText` (`Editor.ts:1348`). Neither mount site passes one today, and the secondary view never
guessed — so tab width would flip per file _and per expansion toggle_ on a buffer full of placeholders
and `Show N unmodified lines` rows.

**[Consequence] §C11 — `languageId: null`.** The language lives inside the plugin's own syntax
documents. Give the editor a real one and it parses the interleaved diff buffer and feeds that into
folds, brackets and injections.

**[Consequence] §C9 — do NOT copy `selectionSyncMode: 'none'` without testing copy.** It short-circuits
before `domSelection.addRange` (`inputSelectionController.ts:1418-1421`), leaving copy dependent on the
hidden textarea. Decide deliberately; §6 has the test.

**[Consequence] §3.5 — do NOT copy `scrollMode` from the search precedent.** `scrollMode: 'static'`
removes the virtualizer's redefined `scrollTop`/`scrollHeight` (`fixedRowVirtualizer.ts:598-600`),
silently no-opping split scroll sync.

**Do not pass `createCriticalEditorCorePlugins`** — it brings line and fold gutters, find,
merge-conflict, shiki and LSP, none of which `DiffView` had. Fold gutters would additionally violate §C4.

**Two improvements fall out.** `Editor.setTheme` exists (`Editor.ts:1082`), so the `[editorTheme]`
rebuild dependency at `diff-view.tsx:69` goes away; and because rows are pushed rather than rebuilt, the
`useMemo`-stability comment at `diff-view.tsx:36-37` stops being load-bearing.

**One regression to actively prevent.** `Editor.setText` clears tokens (§C10). Call
`Editor.setTokens(cached)` immediately after every `setText`, or every expansion toggle flashes
uncoloured — `DiffView` did this at `:552`.

### 3.1 Layout

| Mode      | Platform renders                                                                            |
| --------- | ------------------------------------------------------------------------------------------- |
| `stacked` | one `<Editor>`, plugin `side: 'stacked'`                                                    |
| `split`   | two `<Editor>`s in a `ResizablePaneGroup`, plugin `side: 'old'` / `'new'`, plus scroll sync |

`@singapor/panes` moves from `packages/diff` to `apps/web`. Per §2.4 of the editor plan the entire
`splitPane` option surface is unused — build the pane group directly, do not port an options layer
nothing calls.

**[Consequence] §C7 — the resizable element is the pane host, not the scroll element.** `DiffView`
resizes `scrollElement.parentElement` (`DiffView.ts:252,258`), i.e. the `.editor-diff-pane` div, which is
also `position: relative` and the element the comment layer resolves with `closest`. Keep it one element.

**[Consequence] §3.5 — scroll sync is host code.** `setScrollTop` on a view contribution is
vertical-only (`plugins.ts:298`); there is no `setScrollLeft`. Sync both axes through
`Editor.getScrollPosition`/`setScrollPosition`.

**[Consequence] §C6 #1 — clear the other pane's selection on focus**, or split shows two independent
selections where `DiffView` allowed one.

---

## 4. The line-comment layer — the actual risk

[`diff-line-comment-action.tsx`](../apps/web/src/features/git/components/diff-line-comment-action.tsx)
reads three things off the DOM:

| What it reads                                       | Where       | After migration                                                                                                                                                                                                                                         |
| --------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[data-editor-virtual-row]`                         | `:152,156`  | **unchanged** — stamped for any editor (`virtualizedTextViewRows.ts:580`); §C4 keeps the index meaning the projection row                                                                                                                               |
| `closest('.editor-diff-pane')` — the **bare** class | `:153`      | **the host must keep stamping the bare class.** The `-old/-new/-stacked` suffixes are then read off `classList` (`:165-172`); both are stamped together at `DiffView.ts:292`. Dropping the bare class breaks side detection even if the suffixes remain |
| row-type class as a drift check                     | `:160`      | delete — redundant once rows come from one source                                                                                                                                                                                                       |
| private `expandedHunks` mirror                      | `:46,64-70` | **delete** — §C5 forbids mirroring                                                                                                                                                                                                                      |

So the layer survives largely intact. The work is subtraction:

- `diffPaneRows(file, side, expandedHunks)` ([`diff-line-selection.ts:32-41`](../apps/web/src/features/git/utils/diff-line-selection.ts)) → `plugin.getRows()` per §C3.
- `toggleExpandedHunk` (`:133-145`) → delete; the plugin toggles (§C5).
- `diffRowTypeClassName` (`:152-154`) → delete with the drift check.
- The capture-phase `click` handler for hunk expansion (`:64-70,85`) → delete; the plugin owns it, and
  per §3.4 of the editor plan it needs the Y-hit-test the plugin now carries.
- `DiffLineAddress`, `diffLineSelectionText`, fence escaping, `isCodeRow` → **untouched**.
- Capture-phase `mousedown` (`:86`) and document-level `mouseup` (`:87`) → **stay**.

`features/git/utils/editor-diff-files.ts` (`createTextDiff`, `parseGitPatch`) is untouched.

---

## 5. What must not regress

**A diff must not become saveable.** `parseDiffDocumentId` / `parseCompareSavedDocumentId` are what tell
the save path a document is not file-backed:
[`features/editor/utils/save.ts:70-79`](../apps/web/src/features/editor/utils/save.ts),
[`features/editor/utils/file-backed-document.ts:9-13`](../apps/web/src/features/editor/utils/file-backed-document.ts),
[`keymap/command-enablement.ts:29`](../apps/web/src/keymap/command-enablement.ts).
All three gate on the document **id**, not the renderer, so they hold by construction —
`editability: 'readonly'` plus `storeSync: 'none'` is the belt, these are the braces. Assert anyway.

**The CSS variable chain.** [`packages/ui/src/styles/globals.css:612-633`](../packages/ui/src/styles/globals.css)
overrides eleven `--editor-diff-*` variables with `!important` on exactly
`.editor-diff-view, .editor-diff-row, .editor-diff-gutter-row`. Drop `.editor-diff-view` as the wrapper,
or stop stamping `editor-diff-row` on rows, and every platform diff colour silently reverts to package
defaults (`#5ecc71` / `#ff6762` at a 22% mix). **Keep both.**

**[Consequence] §C10 — the `.editor` class is new.** `Editor` hardcodes `className: 'editor'`
(`Editor.ts:428`), which `EditorSecondaryTextView` never carried. It pulls in the whole `.editor` block
(`editor/style.css:20-60`): a full `--editor-*` set plus `font-family: monospace; font-size: 13px`. The
diff override at `diff/style.css:187-195` is `!important` at higher specificity so its four vars win, but
`--editor-caret-color`, `--editor-cursor-line-*` and every `--editor-syntax-*` are now declared from two
rules. Resolve deliberately, and do **not** additionally put `.app-editor-host` on the diff host — it has
its own `--editor-background` / `--editor-gutter-background` `!important` rules (`globals.css:576-605`).
Verify in both themes.

**Settings and commands are untouched.** `editor.diff.viewMode`
([`packages/contracts/src/settings/keys.ts:133-141`](../packages/contracts/src/settings/keys.ts),
default `'stacked'`, scope `window`) and `workspace.toggleDiffViewMode` / `Mod+Shift+D`
([`keymap/workspace-commands.ts:605-619`](../apps/web/src/keymap/workspace-commands.ts)) keep working —
the mode is now a React prop. **Improvement available:** today a mode switch rebuilds the panes and loses
scroll (`DiffView.ts:128-133`); it need not any more.

**One-file rendering stays one-file.** Both sites pass `showFileList: false` and `selectedFile()` falls
back to `files[0]` (`DiffView.ts:675-677`), so a `turn`/`thread` checkpoint diff touching N files shows
one — deliberately, per the comment at `diff-view.tsx:42-44`. Reproduce as-is; changing it belongs in a
separate, labelled change.

---

## 6. Tests

**Must keep passing:**

| Suite                                                                                                                                  | What it pins                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`features/git/components/tests/diff-line-comment.test.tsx`](../apps/web/src/features/git/components/tests/diff-line-comment.test.tsx) | drives raw `MouseEvent`s at `.editor-diff-pane-${side} [data-editor-virtual-row]` (`:122-136`), stubs `Highlight`/`CSS.highlights` (`:161-165`), runs **split** via a seeded cache (`:148-153`) |
| `features/git/components/tests/diff-view.test.tsx`                                                                                     | mostly model-level, plus the notice paths at `:105,120,137`                                                                                                                                     |
| `features/git/utils/tests/diff-line-selection.test.ts`                                                                                 | 9 tests; the expansion-mirror case at `:121-131` gets **rewritten**, not preserved                                                                                                              |
| `keymap/tests/command-dispatch.test.tsx:29-35`                                                                                         | the mode-toggle command                                                                                                                                                                         |

**[Consequence] §C4 — `diff-line-comment.test.tsx` is the real parity test.** It is the only thing
exercising the row-index-to-line-number identity end to end. If it passes against real `Editor`s, the
DOM contract survived.

**Environment risk is lower than it looks.** `Editor`-in-happy-dom is already proven: the diff package's
own `test/editorDiffPlugin.test.ts:20` constructs a real `Editor` and asserts rendered rows and gutter
text; `vitest run` there is 5 files / 41 tests green. No spike needed. The remaining unknown is only what
_platform's_ provider stack adds on top.

**Two new tests this migration owes:**

- **Clipboard (§C9).** Assert the plain-text payload of a selection across a deletion row, and decide-then-pin
  the collapsed-caret behaviour — `Editor` copies the caret's whole line where `DiffView` copied nothing.
- **Save refusal (§5).** Assert both document schemes still report not-file-backed.

---

## 7. Sequence

0. **§2 — fix the red typecheck. Own commit. Nothing else in it.**
1. Wait for editor-half M4 + a `packages/diff` rebuild (§C8). Restart the dev server.

**[Consequence] §C8 — the Editor half runs in a worktree; platform does not.** The operator authorised a
worktree for the Editor repo only (editor plan §8). Platform stays on `main` — no branch, no worktree,
per `plans/README.md`.

Platform does not see that worktree by default. Resolution runs through the `link:@singapor/*` overrides
in [`package.json:44-60`](../package.json) → the **global** bun link registry, whose entries are absolute
symlinks into `/Users/shaul/Desktop/D/Editor/packages/*`. (`packages/editor-*` are convenience symlinks
only — not workspace members, and `knip.json:3` ignores them.) Until someone runs `bun link` from the
worktree's `packages/diff`, platform keeps compiling the old `DiffView` — which is the _desired_ default
while the Editor half is mid-flight. Editor plan §8.2 has the repoint-and-restore commands; the repoint
is machine-global, so restore it when done. 2. Build the shared mount component (§3) behind the existing `FileEditorBody` routing; keep both old
components until it renders. 3. Re-hook the line-comment layer (§4) — deletions only, no new mirrors. 4. Delete `diff-view.tsx` / `compare-saved-view.tsx` internals, point both schemes at the shared component. 5. Verify: `bun run typecheck`, the four suites in §6 plus the two new ones, then the real app at `:5173`
in split and stacked, light and dark, with a checkpoint diff _and_ a compare-saved diff. 6. Docs: `docs/git-feature-comparison.md:61,154`. Mark both plan documents SUPERSEDED.

**Git workflow:** all work happens on `main` — no branches, worktrees, commits, pushes or PRs unless
explicitly asked, per the operator rule in `plans/README.md`.

---

## 8. Done criteria

Properties, not counts — absolute counts drift and make a plan unfalsifiable.

- `bun run typecheck` in `apps/web` exits 0, and did so **before** step 2 as well as after.
- The four existing suites pass; the rewritten expansion case asserts against
  `plugin.getExpandedRegions()`, not a platform mirror.
- `rg 'DiffView' apps/web/src` returns nothing.
- A `git-diff:` and a `compare-saved:` document both render in split and stacked, light and dark, with
  syntax highlighting on **deletion** rows — the §C2 property that motivated the design.
- Clicking a collapsed region's **gutter** expands it (§3.4 of the editor plan), and the pointer cursor
  shows over the gutter half of an expandable separator.
- Selecting and copying from a deletion row yields the line text with no `+`/`-` marker; the
  collapsed-caret behaviour matches whatever §C9 decided.
- Line comments can still be placed on both sides in split mode and on a trailing-tail expanded region —
  the case that is broken today.
- Tab width does not change when a region is expanded (§C10).
- Saving is still refused for both document schemes (§5).
- No new `localStorage` key, env var, or hardcoded constant; `editor.diff.viewMode` remains the only knob.
