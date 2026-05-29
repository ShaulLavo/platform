# Platform

Platform is a Bun monorepo for a local-first code editing workspace. It combines a Vite React client, an Elysia file/Git/LSP server, shared contract types, a reusable UI package, and editor packages under `packages/editor-*`.

## Workspace Layout

- `apps/web`: React application for the editor shell, workspace tree, Git views, file picker, and client-side state.
- `apps/server`: Elysia RPC server for filesystem access, Git operations, file watching, auth, and TypeScript LSP websocket sessions.
- `packages/contracts`: shared server/web DTOs and runtime schemas that define stable cross-package boundaries.
- `packages/ui`: shared React UI components, styles, and utility primitives consumed by apps.
- `packages/editor-*`: editor primitives for rendering, panes, diff views, tree-sitter integration, LSP integration, minimap, gutters, find, and related editor features.
- `docs` and `scripts`: operational notes and repository maintenance scripts.

## Ownership Boundaries

The server owns side effects and host integration: filesystem reads/writes, Git commands, watchers, auth checks, and LSP session lifecycle. Shared request and response shapes should live in `packages/contracts` when both server and web need to understand them.

The web app owns product workflows and UI state. It should talk to server APIs through the shared client helpers in `apps/web/src/lib` or feature-local API modules, not by duplicating server DTOs in component files.

The UI package should stay reusable and app-agnostic. React is provided by consuming apps as a peer dependency, while the package keeps React in dev dependencies for local typechecking and development.

## Editor Packages Prerequisite

The `packages/editor-*` entries are **symlinks**, not vendored sources. Each one
points into a sibling checkout of the separate `Editor` monorepo using a stable
relative path:

```
packages/editor-core                  -> ../../Editor/packages/editor
packages/editor-diff                  -> ../../Editor/packages/diff
packages/editor-find                  -> ../../Editor/packages/find
packages/editor-gutters               -> ../../Editor/packages/gutters
packages/editor-lsp                   -> ../../Editor/packages/lsp
packages/editor-minimap               -> ../../Editor/packages/minimap
packages/editor-panes                 -> ../../Editor/packages/panes
packages/editor-react                 -> ../../Editor/packages/react
packages/editor-scope-lines           -> ../../Editor/packages/scope-lines
packages/editor-tree-sitter           -> ../../Editor/packages/tree-sitter
packages/editor-tree-sitter-languages -> ../../Editor/packages/tree-sitter-languages
packages/editor-typescript-lsp        -> ../../Editor/packages/typescript-lsp
```

Because the links are relative, the `Editor` repository must be checked out as a
sibling of this repository so the packages resolve at `../../Editor/packages/*`:

```
<parent>/
  platform/   # this repository
  Editor/     # required sibling checkout
```

Clone `Editor` next to `platform` **before** running `bun install`; otherwise the
editor workspace dependencies will fail to resolve.

## Common Commands

```bash
bun install
bun run dev
bun run build
bun run start
bun run prod
bun run typecheck
bun run test
bun run lint
bun run format
```

Use `bun --filter <workspace> <script>` to run a command for one package, for example `bun --filter web test` or `bun --filter server typecheck`.
