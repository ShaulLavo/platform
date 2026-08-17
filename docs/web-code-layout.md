# Web code layout

The rule sheet for `apps/web/src/`. Plans 010–012 point here. Derived from
`AGENTS.md`; this file is the concrete decision procedure, not a restatement.

## Kind directories

A feature folder groups by feature first, then by kind:

- `components/` — React render components only (`.tsx`)
- `hooks/` — `use-*` hooks
- `providers/` — context providers and `*-context.ts` modules
- `state/` — stores and other stateful modules. Co-locating a store next to its
  provider is fine too
- `utils/` — pure, stateless, non-React code only. No stores, no module-level
  mutable state, no subscriptions, nothing that imports React
- `tests/` — feature tests (or a `tests/` dir beside the kind dir, which is what
  `features/chat/` already does)

Do not create empty folders.

## Classification: what goes where

Apply in order; the first match wins.

1. Filename starts with `use-` → `hooks/`
2. Exports a React component and is `.tsx` → `components/`
3. Is a context provider or a `*-context.ts` module → `providers/`
4. Holds a store, a pool, a subscription, or module-level mutable state →
   `state/`
5. Pure, stateless, imports no React → `utils/`
6. A test → `tests/`

Rule 2 outranks rule 4 on purpose: a small presentational component whose name
happens to end in `-state` is still a component. Check what the file _does_, not
what it is called.

Rule 4 outranks rule 5 for the same reason in reverse: a store is stateful, so
it never goes in `utils/`, however pure its helpers look.

## Naming

- The file name must not repeat its feature folder name. In `workspace/`, prefer
  `sidebar.tsx`, not `workspace-sidebar.tsx`.
- A file inside `utils/` must not be suffixed `-utils`. The folder already says
  it. `search-result-editor-utils.ts` becomes `utils/result-editor.ts`.
- Keep qualifiers that add meaning: domain types like `WorkspaceCommand`, domain
  terms like `workspacePath`, root components like `WorkspaceView`.
- When removing a redundant prefix, rename the file, its exports and all call
  sites in one pass.

## No barrels

Import exact files through `@/`. Do not add barrel `index.ts` files.

Barrel files are allowed only at package entry points such as
`packages/*/src/index.ts` that back the package's `"."` export. Never inside a
feature, folder, or utility directory.

## `lib/` is not a kind directory

`apps/web/src/lib/` is a real high-fan-in core (`client`, `file-system-types`),
not a home for feature code. Pure code belongs in the feature's own `utils/`.
Plan 043 states the membership rule for `lib/` itself.
