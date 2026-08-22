# Plan 049: Serve `.json` with a schema-aware language server, and generate the settings schema from the registry

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat d2885013..HEAD -- apps/server/src/lsp packages/contracts/src/settings apps/web/src/features/settings`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: the settings JSON view (shipped — `d2885013` plus the
  single-tab restructure on top of it)
- **Category**: feature
- **Planned at**: commit `d2885013`, 2026-08-21

## Why this matters

The settings tab now has a JSON view that edits the real document, and the
registry already tells the GUI what every key means. The text view knows none of
it. You get syntax colouring and nothing else: no completion of key names, no
enum values, no type errors, no hover docs — the three things that make VS
Code's `settings.json` usable rather than a place you go to make typos.

We have something VS Code does not: the schema is already in-process.
`packages/contracts/src/settings/keys.ts` holds every key with its valibot
schema, default, allowed values, category and description. Generating a JSON
Schema from it costs one script and gives completions that are _exactly_ our
keys, always in step with the build, with no second source of truth to drift.

## Current state

**Only `biome` handles `.json`**, and it is a formatter/linter — no schema
support, no completion, no hover:

```
apps/server/src/lsp/registry.ts:316-332   id: 'biome', extensions: [...tsExtensions, '.json', '.jsonc', ...]
```

There is no `vscode-json-languageserver` anywhere:

```
grep -rn "vscode-json\|json-languageserver\|jsonls" apps/server/src/lsp/   # no matches
```

**One server wins per file.** `matchLspServer` sorts candidates by priority and
returns the first whose root resolves:

```
apps/server/src/lsp/registry.ts:493-513
```

So today this is **instead of biome for `.json`/`.jsonc`, not in addition to
it** — biome keeps every other extension it claims (`.ts`, `.tsx`, `.css`,
`.vue`, `.astro`, `.svelte`, `.graphql`, `.html`). See
[050](050-multi-server-lsp.md) for lifting that restriction; this plan is
written to work either way, because the schema generation is the valuable half
and it is independent.

> ### ⚠️ A new registry entry is UNREACHABLE without a priority entry
>
> This is the trap that would have made step 1 look done and do nothing.
> `serverPriority` is a six-item list — `['deno', 'typescript', 'vue', 'eslint',
'oxlint', 'biome']` (`registry.ts:75`) — and `serverPriorityIndex` returns
> `serverPriority.length` for **any id not in it** (`registry.ts:669-672`), which
> sorts _after_ biome. Biome's `root` uses `nearestRoot` without
> `fallback: false`, so it falls back to `workspaceRoot` and **always resolves**
> (`registry.ts:541-558`). A `json` entry added to `lspServers` alone therefore
> never wins a `.json` file — not deprioritized, unreachable. Adding the id to
> `serverPriority` ahead of `biome` is a required step, not a tuning knob.

**The settings buffer deliberately has no resolvable path.** Its id is
`settings-json:<user|workspace>` with no `.json` in it, precisely so
`matchLspServer` does not try to spawn a server against a document that is not
on disk. Highlighting is hardcoded for it:

```
apps/web/src/features/editor/utils/file-path.ts   languageIdForFilePath: SETTINGS_JSON_DOCUMENT_PREFIX -> 'json'
```

Giving it a language server therefore needs a real identity, and the settings
file's path is never exposed on the settings wire
(`packages/contracts/src/settings/wire.ts` has no path field), while
`apps/server/src/fs/path.ts:89` rejects every absolute client path. That is the
one genuinely fiddly part of this plan.

## The cheap 80% that needs no language server

Worth doing first and separately, because it is small and independent:
`settingsLayerFileSchema` already ships `parseErrors` with **`offset` and
`length`**, and the resolver already emits per-key diagnostics
(`unknown-key`, `scope-not-allowed`, `invalid-value`). Nothing renders them in
the text view. Squiggles for both need no LSP at all — only completion does.

## Scope

1. Register `vscode-json-languageserver` in `apps/server/src/lsp/registry.ts`
   with an installer in `installers.ts`, claiming `.json` and `.jsonc` — **and
   add its id to `serverPriority` ahead of `biome`**, or it is unreachable (see
   the warning above). Add a test that asserts `matchLspServer` returns it for a
   `.json` file inside a repo that also has a `package.json`.
2. Generate a JSON Schema from `SETTINGS_REGISTRY` (a `settings:schema` script
   beside the existing `settings:reference` one), covering key names,
   types, enums, defaults, `description` for hover, and `deprecated`.
3. Bind that schema to the settings documents only — by `schemas`
   initialization option keyed on the settings file's URI, not globally.
4. Give the settings buffer a resolvable identity so the client can open it as
   an LSP document, or decide explicitly that the JSON view runs schema
   validation client-side and only ordinary `.json` files get the server.
5. Render `parseErrors` and settings diagnostics as editor markers (can ship
   ahead of 1–4).

## Non-goals

- Removing biome. It stays for every other extension it claims.
- A settings **UI** for choosing a JSON server. `lsp.servers` already exists as
  an override map.

## STOP conditions

- If claiming `.json` for the new server measurably regresses `package.json` or
  `tsconfig.json` editing, stop and reconsider the priority rather than
  papering over it.
- If step 4 requires relaxing `apps/server/src/fs/path.ts`'s absolute-path
  refusal, stop. That guard is a security boundary; the settings document must
  get an identity some other way.

## Git workflow

All work happens on `main`. No branches, worktrees, commits, pushes or PRs
unless the operator explicitly asks.
