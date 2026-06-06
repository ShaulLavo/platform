# Repository Guidelines

## React File Organization

- Put each React component in its own file. Do not define multiple exported components in a single component file.
- Put each React hook in its own file. Hook files should focus on the hook and its direct React-specific wiring.
- Do not keep general-purpose utilities inside React component or hook files. Move pure helpers, formatters, data transforms, constants, and other reusable non-React logic into dedicated utility files.
- Prefer colocated utility files when the helper is feature-specific, and shared utility modules when the helper is reused across features.
- Avoid manual React memoization by default. Do not add `memo`, `useMemo`, or `useCallback` just to stabilize render-time values or callbacks; let the React Compiler optimize ordinary component code.
- Use manual memoization only when there is a measured performance issue, a library API requires stable identity, or a hook dependency would otherwise cause incorrect behavior. Leave a short comment explaining the reason when adding it.

## Feature Folder Structure

- Group files by feature/concern, not by a single flat directory. When a folder accumulates many unrelated concerns, split it into per-feature subfolders.
- Within each feature folder, separate files by kind into these subfolders:
  - `components/` — React render components only (`.tsx`). Nothing else lives here.
  - `hooks/` — `use-*` hooks.
  - `providers/` — React context providers and their context-object modules (`*-provider.*`, `*-context.ts`). Keep these out of `components/`.
  - `utils/` — pure non-React code: models, types, helpers, constants, stores.
  - `tests/` — `*.test.ts(x)` files for that feature.
- Omit any subfolder a feature does not need; do not create empty ones.
- Cross-feature primitives shared by multiple features go in a `shared/` feature folder using the same subfolder split.
- Import modules by their exact path via the `@/` alias. Do not add barrel `index.ts` files.

## Naming

- Do not prefix file or symbol names with the name of the folder that already conveys it (e.g. inside a `workspace/` or `terminal/` folder, name files `sidebar.tsx` / `terminal-tab.tsx`, not `workspace-sidebar.tsx` / `workspace-terminal-tab.tsx`).
- Keep a qualifier only when it carries real meaning beyond the folder — domain types (`WorkspaceCache`, `WorkspaceLayout`, `WorkspaceCommand`), domain concepts (a `workspacePath` is a path within the workspace), or a top-level root component (`WorkspaceView`) — not when it is purely the redundant folder name.
- When dropping a redundant prefix, rename the file, its exported symbols, and all call sites together in one pass (see Refactoring Policy).

## Refactoring Policy

- No backward compatibility shims.
- No legacy aliases.
- Delete obsolete tests instead of preserving old behavior.
- Rename all affected symbols and call sites in one pass.
- Remove duplicate code aggressively.

## Testing

### Runner and environments

- Tests run on **Vitest under the Bun runtime** (`bun --bun vitest`). The `--bun` flag is required: `bun:sqlite`, `Bun.spawn`, and other Bun APIs do not resolve under Node. The only casualty is coverage, which we do not use.
- Three Vitest projects (test worlds), in environment-preference order **real browser > happy-dom > jsdom — never jsdom**:
  - `node` — pure logic and anything that drives the in-process server. Runs under `--bun`.
  - `dom` — hooks and component/render tests in **happy-dom**. Runs under `--bun`.
  - `browser` — real-paint/layout/visual `*.browser.tsx` tests via Playwright. Runs under **plain Node** (Vitest browser mode's orchestration breaks under `--bun`).
- `apps/*` run `bun --bun vitest`; runtime-neutral `packages/*` run plain `vitest` (Node).

### Use the real thing — do not mock our own code

- Drive the **real in-process Elysia server** in tests. Import `{ test, expect }` from the shared test API (`apps/web/test/fixtures.ts`), not from `vitest` directly; the `server` fixture builds a real `createApp` over a temp workspace and the `client` fixture is a real `treaty` client wired to `app.handle` (no socket, no port).
- **Never `mock.module`/`vi.mock` our own server, client, or feature modules.** The RPC client is injectable: production code calls `getClient()` from `@/lib/client` (there is no bare `client` export); the `client` fixture points it at the real server via `setClient`/`resetClient`.
- Build **real state** rather than stubbing responses — e.g. `git init` a real repo and write real files into the temp workspace, then assert through the real routes.

### Mock only the genuine boundary

- The only legitimate fakes are the **outside world** and **unspawnable processes**: third-party HTTP (font downloads, GitHub, provider APIs) via MSW or an injected `fetcher` (use `onUnhandledRequest: 'error'`); PTY and LSP child processes via their injectable factories; and serialization edges a real server cannot reproduce (e.g. Eden `Date` normalization). `MockProviderAdapter` is a production adapter, not a test stub — prefer it over the real Codex adapter, which spawns an external binary.
- Browser tests cannot import the Bun-native server into Node, so they spawn the real server as a child `bun` process behind a Vite proxy (see `apps/web/test/env/browser-file-server.ts`). Node/dom tests import it in-process instead.

### Structure and hygiene

- Shared test code lives under `test/`: `fixtures.ts` (the `test.extend` entry point), `render.tsx` (`renderWithProviders` mirrors the app's `main.tsx` provider stack), `factories/` (shared builders), `env/` and `msw/`. Do not redefine per-file factories or hand-roll provider trees.
- Avoid module-level non-determinism (e.g. `Math.random()` evaluated at import) — it produces order-dependent failures under Vitest's module graph. Use deterministic or seedable ids.

### Bun-under-Vitest gotchas

- Some Bun-native `import.meta` properties are not populated under Vitest's transform: `import.meta.path` and `import.meta.dir` come back `undefined` (`import.meta.dirname` works). Production code that relies on them keeps working under real `bun`, but a test exercising that path will fail — prefer not to depend on Bun-only `import.meta` fields in code that tests must drive.
- A cold first run of process-spawning integration tests (TypeScript language server, git, PTY) can exceed Vitest's 5s default timeout; warm runs fit comfortably. If a cold CI run flakes on these, raise `testTimeout` for that project.
- **node-pty cannot allocate a PTY from inside a Vitest worker** (it works under `bun test`, the main process, but Vitest has no in-process pool — threads and forks both fail). The single real-bridge terminal test is skipped under Vitest with a `TODO(pty-in-tests)`; `FakePty` covers the rest of the terminal logic. This is unresolved — see the TODO.
