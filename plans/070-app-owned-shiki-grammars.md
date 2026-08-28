# Plan 070: Move shiki grammar and theme resolution out of the worker

> **Executor instructions**: Read this plan completely, then read Platform `AGENTS.md`, root
> `PLAN.md`, and `/Users/shaul/.agents/skills/never-nester/SKILL.md`. Execute every gate in order.
>
> This plan changes one Editor package and one Platform feature together. The Editor change is not
> shippable on its own — the worker protocol gains a required field. Land both, or neither. Do not
> commit, push, create a branch, publish, or open a PR without explicit operator approval.

## Status

- **State**: Proposed — needs root scheduling
- **Priority**: P1 — shiki highlighting is entirely non-functional in any build that consumes
  `@singapor/core` from `dist/`
- **Effort**: M
- **Risk**: MEDIUM — touches the syntax hot path and the worker protocol, but the failure mode is
  loud (no tokens) rather than subtle
- **Platform baseline**: `e1228cffcd4516c245336101b04302c4e9a155c3`
- **Editor baseline**: `0f4f8f498954a701cbf8041a13586f227bd5d3ce`
- **Package pin**: `shiki@3.23.0`, `@shikijs/langs@3.23.0`, `@shikijs/engine-oniguruma@3.23.0`

Root `PLAN.md` is authoritative for ordering. This is an independent editor-syntax lane; stop and
ask the operator where to schedule it if it has not been added there when execution is requested.

## Why

`scripts/build-package.ts` in Editor rewrites every module worker into
`import W from './x.worker.ts?worker&inline'`, so the worker ships as a JS string started from a
blob URL. That is the right instinct for a published package — it removes any dependency on the
consumer's bundler for worker URLs — but it has a hard precondition: **a blob module has no base
URL, so the worker's graph must compile to a single chunk.**

`src/shiki/shiki.worker.ts` violates that. It calls `createHighlighter` from `shiki`, the full
bundle, whose entire design is to lazy-`import()` grammars, themes and the oniguruma wasm. The
built worker therefore contains 303 relative specifiers into `dist/assets/`, and not one of them
can resolve:

```
editor.syntax.highlight_request_failed
  Failed to resolve module specifier './wasm-DGQoIx-J.js'
→ editor.syntax.highlight_cleared_after_error
```

Measured on the `0f4f8f49` build:

|                                     |                            |
| ----------------------------------- | -------------------------- |
| worker blob                         | 324 KB                     |
| unreachable sibling chunks it needs | **11 MB across 301 files** |
| of which the oniguruma wasm engine  | 612 KB                     |
| languages `apps/web` actually maps  | **45**                     |

This was invisible for two reasons, both now fixed on Platform: dev resolves `@singapor/*` to
TypeScript source, where Vite gives the worker real URLs and everything works; and the config that
did that resolution had silently stopped finding the packages, so the app fell back to `dist/` and
the latent bug surfaced. Restoring source resolution hid it again. It will return the moment
anything consumes the built package — a production build, or another consumer.

Two cheaper fixes were considered and rejected:

- `worker.rollupOptions.output.inlineDynamicImports` makes the graph one chunk, and produces an
  ~11 MB worker blob that is parsed twice, once as a string and once as JS.
- Emitting the worker as a real file (`?worker&url`) keeps lazy grammars but ends the package's
  self-containment: the emitted URL is relative to `dist/`, which breaks for any consumer that
  re-bundles.

The structural answer is that the worker should not be resolving grammars at all. It runs on the
wrong side of the boundary: **the app owns the language set** (`EDITOR_SHIKI_LANGUAGE_MAP`,
45 entries), it is bundled by Vite where code splitting works correctly, and the protocol already
carries themes as data (`ShikiWorkerThemeRegistration`). Languages are the only thing still passed
by name and resolved inside the worker.

## Design

Extend the existing precedent rather than inventing a channel. `ShikiWorkerDocumentOptions` already
takes `themeRegistration` as a resolved object beside `theme: string`; grammars gain the same
treatment. The request/response protocol stays one-way — no back-channel from worker to host — and
the caller already supplies every language it will need (`lang`, `langs`, `theme`, `themes`).

The worker's remaining static imports are its own modules plus the regex engine. It keeps
`@shikijs/engine-oniguruma/wasm-inlined` as a **static** import, which is one chunk and therefore
legal inside a blob. That moves the worker from 324 KB to roughly 940 KB — acceptable, and the
alternative (`@shikijs/engine-javascript`, no wasm) is recorded in Open Questions.

Grammar modules already resolve their own embedded-language closure, so the app never computes one:

```js
// @shikijs/langs/html
import javascript from './javascript.mjs'
import css from './css.mjs'
export default [...javascript, ...css, lang]
```

## Gate 1 — Editor: the worker stops resolving names

`/work/repos/Editor/packages/editor/src/shiki/`

1. `workerTypes.ts` — add resolved grammar payloads to the protocol:
   - `ShikiWorkerLanguageRegistration`: the structural shape of one entry of a
     `@shikijs/langs/*` default export. Declare it structurally, as
     `ShikiWorkerThemeRegistration` already is; do not re-export shiki's own type across the
     worker boundary.
   - `ShikiWorkerDocumentOptions` gains `languageRegistrations: readonly ShikiWorkerLanguageRegistration[]`
     — the closure for `lang` plus every entry of `langs`. Required, not optional: an optional
     field would let a caller silently fall back to the broken path.
   - `ShikiWorkerThemeRequest` gains the matching required `themeRegistrations` for `themes`.
2. `shiki.worker.ts`:
   - Replace `createHighlighter` from `shiki` with `createHighlighterCore` from `shiki/core`.
   - Add `engine: createOnigurumaEngine(wasm)` from a static
     `import wasm from '@shikijs/engine-oniguruma/wasm-inlined'`.
   - `ensureHighlighterFor` takes registration objects instead of names.
   - `ensureLanguages` and `scheduleBackgroundLanguages` load from the supplied registrations
     rather than calling `highlighter.loadLanguage(name)`. Keep the deliberate `setTimeout(…, 1_000)`
     in `scheduleBackgroundLanguages` and its comment: the measured 526 ms → 1 187 ms regression it
     documents is a property of the single worker thread, not of how grammars arrive.
   - `highlighterKey` must key on the registration identity set, not on names.
3. Assert the outcome, not just the behaviour: after this gate,
   `grep -c "import(" dist/shiki/shiki.worker.js` must be 0 for grammar/theme/wasm specifiers.

## Gate 2 — Editor: make the class of bug impossible to reintroduce

`/work/repos/Editor/scripts/build-package.ts`

The build inlined a worker that needed 301 sibling chunks and said nothing. Add a post-build
assertion: for every `?worker&inline` entry, fail the build if its bundle emitted any sibling chunk,
naming the chunks. This is the guard that turns a silent 11 MB orphan into a build error, and it is
worth landing even if the rest of this plan slips.

## Gate 3 — Platform: the app resolves grammars

`apps/web/src/features/editor/`

1. `utils/shiki-languages.ts` — add a resolver mapping an editor language id to a lazy
   `import('@shikijs/langs/<id>')`. Vite code-splits these correctly, so each grammar stays a
   separate chunk fetched on demand. Keep the existing `SHIKI_NATIVE_LANGUAGE_IDS` list as the one
   source of truth for which ids exist; do not introduce a second list that can drift from it.
2. `state/syntax-highlighting.ts` — `createShikiHighlighterProvider` is already given `languages`,
   `preloadLanguages` and `preloadThemes`. Extend that options object with the resolver so
   `plugin.ts` can await grammars before it posts `open`/`edit`/`theme`.
3. `shiki/plugin.ts` (Editor) — `preloadLanguages` and `preloadThemes` currently return names.
   They must resolve to registrations through the supplied resolver, awaited before the request is
   posted. First paint must not wait on the full preload set; only on the document's own language.
4. Delete the now-dead name-based paths in the same pass. No compatibility shim, per Platform's
   greenfield rule.

## Gate 4 — Verification

Per-workspace baseline deltas only; never gate on an absolute test count or a bare root
`bun run verify`.

1. `packages/editor`: `vitest run` in the Editor workspace, plus `tsgo --noEmit`.
2. Build the package and assert the worker is self-contained:
   ```bash
   cd /work/repos/Editor/packages/editor && bun run build
   test "$(ls dist/assets/*.js 2>/dev/null | wc -l)" -eq 0
   ```
3. Prove the real failure is gone, from `dist` rather than from source. This is the check that
   would have caught the original bug, and the only one that exercises the blob worker:
   - temporarily neutralise `editorSourcePlugin` in `apps/web/vite.config.ts` so `@singapor/*`
     resolve to `dist/`;
   - open a TypeScript file in the running app;
   - require `editor.syntax.highlight_applied` in `logs/<today>.jsonl` and zero
     `editor.syntax.highlight_request_failed`.
4. Confirm the payload claim: the grammars fetched for a session are only those the document and
   preload set need, not 301.

## Risks and rejected alternatives

- **Protocol churn.** Two required fields are added to a worker protocol with one consumer. Both
  repos land together; there is no published consumer to break.
- **First-paint regression.** Awaiting a grammar before posting `open` adds a round trip. Mitigate
  by resolving the document's own language only, and leaving the preload set to the existing
  background timer.
- **Rejected — keep names, bundle the 45 mapped languages statically into the worker.** Legal for
  the blob and much smaller than 11 MB, but it freezes the language set inside a library whose
  consumer owns that list. This is option C from the investigation; D exists because the list
  belongs to the app.
- **Rejected — a worker→host back-channel that fetches grammars on demand.** More flexible, but it
  turns a request/response protocol into a bidirectional one for no gain: the caller already knows
  every language a request needs.

## Out of scope

- The `WebGPU requestAdapter returned null` failure in the CEF terminal. Unrelated; separate lane.
- `editor.syntax` not retrying after a highlight failure. Today a transient worker error clears
  tokens and leaves them cleared until the session reloads, which is what turned this bug into
  "syntax highlighting is permanently off". Worth its own plan; it is a resilience change, not a
  correctness one, and fixing it would have masked this bug rather than surfaced it.

## Open questions for the operator

1. Keep the oniguruma wasm (+~600 KB inlined into the worker blob, exact grammar compatibility) or
   move to `@shikijs/engine-javascript` (no wasm, smaller, but a different regex engine with known
   grammar caveats)?
2. Should Gate 2's build assertion land immediately as a standalone change, ahead of scheduling the
   rest? It is small, independent, and prevents recurrence.
