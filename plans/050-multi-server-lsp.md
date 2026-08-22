# Plan 050: Let more than one language server serve a file

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 969ae117..HEAD -- apps/server/src/lsp apps/web/src/features/editor`
> and, in the sibling editor repo, `git -C ../Editor log --oneline -5`.
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MEDIUM — touches the editor package and the LSP proxy
- **Depends on**: none (049 is easier with it but does not require it)
- **Category**: feature
- **Planned at**: commit `969ae117`, 2026-08-21

## Why this matters

A file gets exactly one language server. That is wrong for the common case:
biome knows how to format and lint JSON, `vscode-json-languageserver` knows the
schema; eslint and typescript have the same split for `.ts`. Today you pick one
and lose the other.

## The decisive fact: the editor was already designed for this

`EditorLanguageFeatureRegistry` (`../Editor/packages/editor/src/plugins.ts:741-793`)
is a multi-provider channel — `register(token, selector, provider)` appends, and
`ordered(token)` returns every provider — and its own doc comment names **a
second language server** as the case it exists for. It contrasts "language
features" (many sources answer, merged) with "capabilities" (one owner).

**But only completion is wired to it.** An exhaustive grep for
`createEditorLanguageFeatureToken` outside tests and `dist` yields exactly two
tokens, one of which is `EDITOR_COMPLETION_SOURCE`. Hover, definition,
diagnostics, semantic tokens, signature help, document highlights, code actions
and formatting are plain fields on a per-view `LanguageServerContribution`
(`../Editor/packages/lsp-plugin/src/plugin.ts:382-484`) talking straight to that
contribution's own `LspConnection` — no token, no registry, no merge.

So the registry change on our side is the easy 5%. **The work is upstream.**

## What breaks today if you just install two LSP plugins

Plugins are stored by object identity (`Map<EditorPlugin, ...>`,
`plugins.ts:866-868`), so two instances are mechanically legal. Two
_default-configured_ instances then hit two hard throws:

- `registerFeature` throws `Editor feature already registered: ${token.id}`
  (`Editor.ts:2688-2691`)
- `registerCommandHandler` throws on a duplicate command id
  (`commandRouter.ts:98`)

Both are swallowed by `createContributionSafely` (`Editor.ts:1847-1867`), so
**server #2 silently loses all 12 of its commands** (format, rename,
goToDefinition, autoFix, marker navigation) and its edit feature, with only a log
line. Four highlight-name families also collide, because `highlightPrefix` is
minted once per Editor (`Editor.ts:420`) and one of the four has no option to
change it. Semantic tokens cannot simply be painted by two servers either:
`SEMANTIC_TOKEN_Z_INDEX` is a declared band and a tie in it is documented as a
defect (`semanticTokenLayer.ts:28-34`).

## Order of work — upstream first

1. **Editor package: make one plugin instance-safe.** Namespace the feature
   token id, the 12 command ids and the highlight prefix per contribution.
   Nothing else can land until two instances can coexist without silently
   losing half of one.
2. **Editor package: move the merge-worthy capabilities onto tokens.**
   Diagnostics (union, namespaced by server so one server clearing does not
   clear the other's) and hover (concatenate) are the two that clearly want
   many providers. Definition/references are first-to-answer, which the
   registry already supports as an idiom. Formatting and semantic tokens should
   stay single-owner — pick a winner rather than merge.
3. **Platform: `matchLspServer` returns a list.** Only after 1–2. Keep
   `LspServerMatch` as the element type so the ~4 dependants keep compiling, and
   have the route open one session per match.

## Rejected approaches, and why

Three designs were written and each was adversarially verified against the code.
All three were refuted **as specified**; the reasons are worth keeping.

- **Server-side multiplexer** (one socket, N backends, merged responses).
  Refuted by probe: it must answer `initialize` only after every lane has, and
  the browser gives `initialize` a hard 15s (`DEFAULT_TIMEOUT_MS = 15000`), so
  **adding a secondary server can cost the user their primary one**. Also
  crashes on the settings lane: `WorkspacePaths.toRelative` calls `assertInside`
  and throws for a root outside the workspace (`fs/path.ts:43-46, 105-109`).
- **Role-split** (each server declares which roles it may serve). The frame is
  good — roles really are the plural thing, and the repo already has two
  per-server capability tables — but as specified the role contest hands
  `format` to typescript rather than biome, and the capability mask deletes
  `textDocumentSync`, silencing the only role a secondary gets.
- **Client fan-out** without step 1 above: dies on the two swallowed throws.

## STOP conditions

- If step 1 cannot be done without changing the editor package's public plugin
  API, stop and report — that is a bigger decision than this plan.
- If a secondary server's failure can delay or fail the primary's `initialize`,
  stop. That regression is worse than the feature.

## Git workflow

All work happens on `main`. No branches, worktrees, commits, pushes or PRs
unless the operator explicitly asks.
