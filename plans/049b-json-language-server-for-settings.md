# Plan 049b: Add JSON Language-Server Support to the Settings Editor

> **Executor:** Read this plan in full before editing. Then read `/Users/shaul/Desktop/D/platform/AGENTS.md`, `/Users/shaul/.agents/skills/never-nester/SKILL.md`, and `/Users/shaul/Desktop/D/platform/.agents/skills/improve/SKILL.md`. Keep nesting at three levels or less. Work only in the files listed under **Implementation scope**. Do not create a branch, worktree, commit, push, or PR unless the user explicitly asks.

## Status

- **State:** Blocked on plan 050
- **Priority:** P2
- **Effort:** M
- **Risk:** Medium
- **Category:** Feature
- **Depends on:** [Plan 050 — multi-server LSP composition](./050-multi-server-lsp.md), the shipped settings JSON editor, and the shipped settings diagnostics pipeline
- **Planned against:** platform `a33a0abb`, Editor `42f07a7`, 2026-08-22

## Ordering decision

Implement [plan 050](./050-multi-server-lsp.md) first, then this plan.

The existing process and browser pools can already maintain independent JSON and Biome connections for the same document. They do not decide which server owns completion, formatting, diagnostics, semantic tokens, or visible editor surfaces; the current registry, match route, web hook, plugin, and status source still select one server. JSON first would either displace Biome for ordinary `.json`/`.jsonc` files or introduce JSON-only routing, feature suppression, ready-time configuration, and diagnostics behavior.

Plan 050 owns those generic mechanisms. This plan is deliberately the narrow proving consumer:

- register the JSON server and its feature ranks;
- generate one authoritative settings JSON Schema;
- send the JSON server's schema-association notification for synthetic settings documents;
- exclude LSP diagnostics for settings documents because settings validation already owns them; and
- verify schema-aware completion and hover without changing pool, routing, or aggregate presentation architecture.

Do not begin this plan until plan 050's done criteria are met and its public contracts are reflected here.

## Problem statement

The settings JSON view now uses the live shared editor and stable synthetic document IDs:

- `settings-json:user`
- `settings-json:workspace`

Those IDs preserve drafts and intentionally do not resemble filesystem paths. The settings diagnostics plugin already supplies syntax and value diagnostics from the settings validation route. What is missing is schema-aware JSON completion and hover.

The server registry has no JSON language server. Biome currently matches `.json` and `.jsonc`, but it is not the settings-schema completion provider and must not be displaced as a formatter/linter for ordinary JSON. The settings registry is the source of truth for keys, descriptions, defaults, scopes, enums, and validation constraints, but it has no generated JSON Schema artifact.

## Architecture boundary

| Concern                                                                                       | Sole owner after this plan                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Settings keys, scopes, defaults, descriptions, and Valibot validation                         | `packages/contracts/src/settings/keys.ts` and its registry helpers    |
| Deterministic JSON Schema generation                                                          | The new settings-schema generator under `scripts/`                    |
| Generated schema artifact and typed import                                                    | `packages/contracts/src/settings/schema.json` and `schema.ts`         |
| JSON server command, extensions, and feature ranks                                            | Platform server LSP registry using plan 050's descriptor              |
| Multi-match routing, feature arbitration, connection acquisition, lifecycle, aggregate status | Plan 050 architecture; unchanged by this plan                         |
| Settings document match path, feature exclusions, and JSON notification payload               | Settings feature code using plan 050's `LanguageServerDocumentTarget` |
| Settings diagnostics                                                                          | Existing settings diagnostics plugin and server validation route      |
| Ordinary JSON formatting/linting                                                              | Biome according to plan 050's ranks and runtime capabilities          |

This plan must not add a connection owner, queue, URI router, reconnect hook, capability table, diagnostic presenter, status store, or special match endpoint. It may only populate the extension points delivered by plan 050.

## Target design

### 1. Generate the settings JSON Schema from the registry

Add `@valibot/to-json-schema@1.7.1`; its `valibot: ^1.4.0` peer range covers the locked Valibot `1.4.2`. Its `toJsonSchema` output is draft-07, which the Microsoft JSON language service supports without relying on its limited newer-draft behavior.

The generator reads the exported setting descriptors and emits one stable object schema:

- `$schema` is `http://json-schema.org/draft-07/schema#`;
- the root type is `object`;
- `additionalProperties` is `false`;
- no setting key is required;
- each property is derived from that descriptor's Valibot schema;
- each property carries the registry description and default;
- a descriptor with `deprecationReason` emits `deprecated: true` and includes that reason in `markdownDescription`; and
- object keys and generated arrays are deterministically ordered.

Add root scripts:

```text
settings:schema        regenerate the artifact
settings:schema:check  regenerate to a temporary output and fail on drift
```

Do not hand-maintain a second key list or encode schema facts in the web feature. The checked-in artifact is generated output; `schema.ts` imports it and exposes a typed readonly value through the contracts package entry point.

Focused contract tests must prove:

- schema property names equal `SETTING_IDS` exactly;
- defaults and descriptions equal their descriptors;
- enum and numeric/string constraints survive conversion;
- no properties are required;
- unknown keys are rejected; and
- `settings:schema:check` detects drift.

### 2. Register the Microsoft JSON language server

Add `vscode-langservers-extracted@4.10.0` as a test-only server-workspace dependency so the focused real-server conformance test is deterministic and offline. That release exposes `vscode-json-language-server` as a package binary. Runtime registration continues to use the existing on-demand installer primitive:

```ts
spawnNodePackageBin('vscode-langservers-extracted', 'vscode-json-language-server', ['--stdio'], {
  cwd: root,
})
```

Register a `json-ls` definition for `.json` and `.jsonc`. Declare only its intended plan-050 feature ranks; do not alter the pool or invent a JSON-specific priority branch. JSON should rank first for schema-aware completion and hover. Biome should remain eligible and rank first for formatting. Diagnostics for ordinary JSON may participate through the composite diagnostics lane according to the shared policy and runtime capability.

Set the JSON server's initialization options to `{ provideFormatter: false }`. It must not advertise or dynamically register a second formatter when Biome owns that feature.

Do not pass schema associations through `initializationOptions`. The Microsoft server accepts workspace schema associations through the `json/schemaAssociations` notification. Use an inline schema so no content-provider request or absolute filesystem path is required.

### 3. Associate the schema with synthetic settings documents

Create settings-owned target data using plan 050's generic `LanguageServerDocumentTarget`:

```ts
{
  matchPath: ".platform/settings.json",
  disabledFeatures: ["diagnostics"],
  sharedNotificationsByServer: {
    "json-ls": [{
      method: "json/schemaAssociations",
      params: [{
        uri: "platform://schemas/settings",
        fileMatch: ["settings-json:user", "settings-json:workspace"],
        schema: SETTINGS_JSON_SCHEMA,
      }],
    }],
  },
}
```

The exact relative `matchPath` may follow the final plan-050 naming contract, but it must remain inside the workspace boundary and end in `.json`. It is server-selection and root-resolution input for both the match request and the explicit JSON-server websocket; it does not need to exist. The synchronized document URI remains the stable `settings-json:user` or `settings-json:workspace` ID; `DocumentSync` already preserves non-file URI schemes.

Send the notification only to `json-ls`, after that lane initializes and before it serves settings document requests. `json/schemaAssociations` replaces backend-wide association state, and the backend is pooled, so every settings lease must send the same complete association containing both stable settings IDs. Re-sending that idempotent payload after a new pooled connection acquisition is plan 050 lifecycle behavior, not a new settings reconnect loop.

Disable LSP diagnostics for settings documents before lane construction. The existing settings diagnostics plugin remains the only diagnostic owner because it validates settings-specific scopes, values, and server semantics. Do not remove or weaken it, and do not merge its messages into an LSP-specific store.

### 4. Preserve ordinary JSON behavior

Ordinary `.json` and `.jsonc` files use the default file-backed document target:

- both JSON LS and Biome remain matched;
- JSON LS provides schema-aware completion and hover when a schema is available;
- Biome remains the preferred formatting lane;
- no platform settings schema is associated with ordinary files; and
- connection, status, diagnostics, and disposal behavior are exactly plan 050's generic behavior.

Do not add filename exceptions for `package.json`, `tsconfig.json`, or settings buffers to the registry. Settings specialization belongs only in the settings target data.

## Upstream constraints

Implementation must follow the primary upstream APIs rather than inferred configuration shapes:

- Microsoft JSON language server: [`json/schemaAssociations` accepts inline schema associations and replaces the server's association configuration](https://github.com/microsoft/vscode/blob/main/extensions/json-language-features/server/README.md#schema-associations-notification).
- Valibot: [`@valibot/to-json-schema` is the official converter](https://valibot.dev/guides/json-schema/) and emits draft-07 output.

Recheck the installed package declarations before implementation. If the notification or converter API differs at the selected version, update this plan and its tests before changing production code.

## Current-source evidence

Before implementation, verify these invariants after plan 050 lands:

- `packages/contracts/src/settings/keys.ts` remains the sole setting descriptor registry.
- `apps/web/src/features/settings/utils/json-document.ts` still creates stable `settings-json:<scope>` IDs.
- `apps/web/src/features/editor/utils/file-path.ts` still recognizes those IDs as JSON syntax without treating them as filesystem paths.
- `apps/web/src/features/settings/state/diagnostics-plugin.ts` still owns settings diagnostics.
- `apps/server/src/fs/path.ts` still rejects absolute and escaping workspace paths.
- `apps/server/src/lsp/registry.ts` exposes plan 050's feature-ranked collection matcher and still includes Biome for `.json`/`.jsonc`.
- the web editor accepts plan 050's generic document target and named ready-time notifications.
- both shipped connection pools remain unchanged and are still keyed by root and server ID.

If any invariant is false, stop and reconcile this plan with the actual completed 050 architecture. Do not revive the old single-winner ordering or add a JSON-only substitute.

## Implementation scope

### Files allowed

- `package.json`
- `bun.lock`
- `scripts/package.json`
- `scripts/generate-settings-schema.ts` (new)
- `packages/contracts/src/settings/schema.json` (new, generated)
- `packages/contracts/src/settings/schema.ts` (new)
- `packages/contracts/src/index.ts`
- `packages/contracts/src/tests/settings-schema.test.ts` (new)
- `apps/server/package.json`
- `apps/server/src/lsp/registry.ts`
- `apps/server/src/lsp/tests/registry.test.ts`
- `apps/server/src/lsp/tests/json-language-server.test.ts` (new)
- `apps/web/src/features/settings/components/json-view.tsx`
- `apps/web/src/features/settings/utils/language-server.ts` (new)
- `apps/web/src/features/settings/tests/language-server.test.ts` (new)
- `apps/web/src/features/settings/tests/diagnostics-plugin.test.ts`

### Explicitly out of scope

- `apps/server/src/lsp/proxy-session.ts`
- generic plan-050 match or route contracts
- `apps/web/src/features/editor/state/language-server-connection-pool.ts`
- generic plan-050 hooks, plugin construction, status source, or diagnostics aggregation
- `../Editor/packages/lsp-plugin/`
- the existing settings diagnostics implementation
- absolute-path relaxation or synthetic-ID-to-file-URI conversion
- custom JSON content-provider requests
- a second schema registry, hand-authored settings schema, or web-only key metadata

If the JSON implementation needs an out-of-scope generic change, stop and amend plan 050 instead of placing that responsibility here.

## Git and drift checks

The platform worktree was dirty when this plan was written. Preserve all unrelated user changes. Before editing:

```bash
git status --short
git rev-parse --short HEAD
git -C ../Editor status --short
git -C ../Editor rev-parse --short HEAD
```

This plan was authored at platform `a33a0abb` and Editor `42f07a7`, before plan 050 implementation. Its executable baseline is the revision recorded when plan 050 completes. Update the planned revision, current-source evidence, and exact API names before beginning. Never reset or discard existing work.

## Implementation steps and gates

### Step 1: Add deterministic schema generation

Add the converter, generator, generated artifact, typed export, scripts, and focused tests. Keep the registry as the only source of settings metadata.

**Gate:** In `/Users/shaul/Desktop/D/platform`, run:

```bash
bun run settings:schema
bun run settings:schema:check
bun --filter @workspace/contracts test -- settings-schema.test.ts
bun --filter @workspace/contracts typecheck
```

Inspect the generated diff. It must be deterministic, contain every and only registered key, and contain no machine-specific paths or timestamps.

### Step 2: Register and characterize JSON LS

Add the test dependency, server definition, feature ranks, and registry tests. Assert that collection matching for `.json` and `.jsonc` includes both `json-ls` and Biome and that their feature owners follow plan 050's rank policy.

**Gate:** Run:

```bash
bun --filter server test -- src/lsp/tests/registry.test.ts
bun --filter server typecheck
```

Review the diff and confirm that no pool, route, queue, or installer lifecycle code changed.

### Step 3: Prove the upstream JSON server contract

Add a focused real-process test using the test dependency. Initialize the stdio server, send the complete inline `json/schemaAssociations` notification before `didOpen`, open both synthetic settings URIs in turn, and assert:

- registered keys appear in completion;
- hover exposes the registry description for a known key;
- enum or constrained values produce schema-aware completion; and
- an ordinary JSON URI without the association does not receive platform settings keys.

Use explicit promises and protocol messages. Do not use sleeps or startup-delay workarounds. Always shut down and exit the child process in test cleanup.

**Gate:** Run:

```bash
bun --filter server test -- src/lsp/tests/json-language-server.test.ts
```

### Step 4: Configure the settings document target

Build the settings-specific target from the generated schema and current synthetic document ID. Pass it through the live settings JSON editor. Add focused tests that prove:

- the match path is relative and does not replace the document ID;
- only `json-ls` receives the association notification;
- the inline schema is the generated artifact;
- LSP diagnostics are excluded for settings;
- user and workspace documents send the same complete association for both exact IDs; and
- ordinary editor documents receive no settings association.

Re-run the existing settings diagnostics test to prove it remains the sole settings diagnostic owner.

**Gate:** Run:

```bash
bun --filter web test -- language-server.test.ts diagnostics-plugin.test.ts
bun --filter web typecheck
```

### Step 5: Final scoped verification

Run:

```bash
bun run settings:schema:check
bun --filter @workspace/contracts typecheck
bun --filter server typecheck
bun --filter web typecheck
git diff --check
```

Use the already-running development server for a manual settings JSON smoke check. Confirm schema completion and hover for both settings scopes, settings diagnostics still come from the settings validator, and an ordinary JSON file still uses Biome formatting without platform settings suggestions. Do not start another dev server.

## Done criteria

- The generated draft-07 schema contains every and only registered setting keys and passes its drift check.
- `json-ls` is installed through the existing runtime installer and is available deterministically to focused tests.
- `.json` and `.jsonc` match JSON LS and Biome under plan 050's shared feature ranks.
- Settings completion and hover use the generated inline schema.
- Settings document IDs remain `settings-json:user` and `settings-json:workspace` and never become absolute paths.
- Settings LSP diagnostics are disabled; the existing settings diagnostics pipeline remains the only owner.
- Ordinary JSON receives no settings association and retains Biome formatting.
- No pool, queue, routing implementation, status store, diagnostics presenter, or lifecycle workaround is added.

## Stop conditions

Stop and update the plan before continuing if:

- plan 050 is incomplete or its contracts no longer match this plan;
- JSON requires generic feature routing, status, diagnostics, reconnection, or match behavior not supplied by plan 050;
- the schema cannot be generated from the setting descriptors without a parallel metadata registry;
- the JSON server requires absolute file access or a content-provider protocol for the inline schema;
- settings diagnostics would have more than one owner;
- ordinary JSON would lose Biome eligibility or formatting ownership; or
- any implementation step requires changing an out-of-scope pool or Editor package file.

## Plan maintenance

When implementation completes, mark this plan complete and record the actual revision plus focused commands. If settings keys change later, `settings:schema:check` must fail until the generated artifact is refreshed; no separate manual plan maintenance should be needed for schema content.
