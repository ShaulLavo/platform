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
