# Plan 049b: Serve settings JSON with a schema-aware language server

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 2b503172..HEAD -- apps/server/src/lsp packages/contracts/src/settings apps/web/src/features/settings apps/web/src/features/editor`
> Reconcile every in-scope change against the current-state statements below
> before implementation.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: shipped settings JSON diagnostics and the final multi-server
  ownership model in plan 050
- **Category**: feature
- **Split from**: plan 049 on 2026-08-22 after reconciling live code at `2b503172`

## Why this matters

The settings text view needs completion of key names and enum values plus hover
documentation. The registry already contains the key schemas, defaults,
categories, descriptions, and deprecation state, so a generated JSON Schema can
provide those features without a second source of truth.

Diagnostics are not part of this plan. Settings-owned syntax and value
diagnostics are already rendered from the settings document pipeline; the JSON
language server must not take ownership of them or duplicate their validation.

## Current state

- The settings JSON buffers have stable synthetic ids,
  `settings-json:<user|workspace>`, and deliberately are not filesystem paths.
- `apps/server/src/fs/path.ts` rejects absolute client paths. That security
  boundary remains unchanged.
- Biome claims `.json` and `.jsonc`. The LSP registry still selects one server
  per file, while plan 050 owns any move to multiple servers.
- The web editor already has connection-pool infrastructure. This plan consumes
  the ownership model that exists when execution starts; it does not redesign or
  extend pooling.
- No generated JSON Schema or `vscode-json-languageserver` registry entry exists.

## Scope

1. Generate JSON Schema from `SETTINGS_REGISTRY` with a `settings:schema` script
   beside `settings:reference`. Cover key names, types, enums, defaults,
   descriptions, and deprecation metadata.
2. Register and install `vscode-json-languageserver` for `.json` and `.jsonc`.
   Under the current single-winner registry, add its id ahead of Biome in server
   priority and prove the entry is reachable with a focused match test. If plan
   050 has changed matching by then, reconcile this step to its final ownership
   API rather than reintroducing a single-winner assumption.
3. Bind the generated schema only to settings documents through language-server
   initialization options. Do not apply it globally to ordinary JSON files.
4. Give each synthetic settings buffer an LSP-safe URI without exposing an
   absolute settings path or weakening filesystem path validation. Preserve the
   existing per-scope editor document id as the application identity.
5. Verify completion, enum values, hover documentation, ordinary JSON behavior,
   and teardown without changing settings-owned diagnostics.

## Non-goals

- Settings diagnostic rendering or validation.
- General multi-server support or connection-pool redesign; plan 050 owns both.
- Removing Biome from its other extensions.
- A settings UI for choosing a JSON server; `lsp.servers` already owns overrides.

## STOP conditions

- If claiming `.json` regresses `package.json` or `tsconfig.json` editing, stop
  and reconsider server ownership rather than masking the regression.
- If settings document identity requires relaxing the absolute-path refusal in
  `apps/server/src/fs/path.ts`, stop. The synthetic document needs an LSP URI by
  another route.
- If the implementation requires new multi-server or connection-pool behavior,
  stop and finish/reconcile plan 050 first.

## Git workflow

All work happens on `main`. No branches, worktrees, commits, pushes or PRs unless
the operator explicitly asks.
