# Platform

Platform is a Bun monorepo for a local-first code editing workspace. It combines a Vite React client, an Elysia file/Git/LSP server, shared contract types, a reusable UI package, and the Singapor editor packages from npm.

## Workspace Layout

- `apps/web`: React application for the editor shell, workspace tree, Git views, file picker, and client-side state.
- `apps/server`: Elysia RPC server for filesystem access, Git operations, file watching, auth, and TypeScript LSP websocket sessions.
- `packages/contracts`: shared server/web DTOs and runtime schemas that define stable cross-package boundaries.
- `packages/ui`: shared React UI components, styles, and utility primitives consumed by apps.
- `docs` and `scripts`: operational notes and repository maintenance scripts.

## Ownership Boundaries

The server owns side effects and host integration: filesystem reads/writes, Git commands, watchers, auth checks, and LSP session lifecycle. Shared request and response shapes should live in `packages/contracts` when both server and web need to understand them.

The web app owns product workflows and UI state. It should talk to server APIs through the shared client helpers in `apps/web/src/lib` or feature-local API modules, not by duplicating server DTOs in component files.

The UI package should stay reusable and app-agnostic. React is provided by consuming apps as a peer dependency, while the package keeps React in dev dependencies for local typechecking and development.

## Editor Packages

The editor runtime resolves in one of two modes:

- **Default (standalone)**: the editor packages are consumed from public npm
  packages under the `@singapor/*` scope. A fresh clone plus `bun install` is
  intended to work without any sibling checkout.
- **Editor development (hybrid)**: the root `package.json` `overrides` map
  redirects every `@singapor/*` package to a sibling checkout of the separate
  `Editor` monorepo via bun's `link:` protocol (`"@singapor/core":
"link:@singapor/core"`, etc.), backed by `bun link` global links created from
  `../Editor/packages/*`. With the sibling present, local editor changes are
  picked up directly — by typecheck, tests, and the dev server alike — so both
  repos can be developed in tandem.

  The editor packages are deliberately **not** bun workspaces: turbo refuses to
  discover any workspace package whose realpath is outside the repository root,
  so a `"../Editor/packages/*"` workspace glob (or the `packages/editor-*`
  symlinks) breaks `bun run dev`. The `overrides` + `link:` approach links the
  live source without making the packages workspace members, keeping turbo
  happy. To enable it, run `bun link` inside each `../Editor/packages/*` once,
  then `bun install` here.

If you are not working on the editor itself, drop the `@singapor/*` entries from
`overrides` (standalone mode) — a fresh clone plus `bun install` then resolves
the published packages without any sibling checkout.

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

## Verify Your Setup

After `bun install`, confirm everything works:

```bash
cp .env.example .env   # bun run dev loads env from .env via --env-file
bun run typecheck && bun run lint && bun run format:check && bun run test
bun run dev
```

Open the local URL that `bun run dev` prints — you should see the workspace
shell with the file tree and editor.

Optionally install the git hooks (lefthook) so pre-commit checks run locally:

```bash
bun run hooks:install
```
