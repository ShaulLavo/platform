# Repository Guidelines

## Code Organization

- Group by feature, then by kind:
  - `components/` — React render components only (`.tsx`)
  - `hooks/` — `use-*` hooks
  - `providers/` — context providers and `*-context.ts` modules
  - `utils/` — pure non-React code
  - `tests/` — feature tests
- Do not create empty folders.
- Import exact files through `@/`. Do not add barrel `index.ts` files.

## Control Flow

- The `never-nester` skill is part of every development task: `/Users/shaul/.agents/skills/never-nester/SKILL.md`.
- Keep nesting depth to 3 or less.
- Use guard clauses and early returns. Keep the happy path shallow.
- In loops, use inverted conditions with `continue` instead of wrapping the body in `if`.
- Extract inner logic into named functions when inversion is not enough.
- Do not use `else` after an early return.
- Never use nested ternaries. Split the logic into `if` statements or a named helper.

## React Code

- One component per file. Do not export multiple components from one component file.
- One hook per file. Keep hook files focused on the hook and its React wiring.
- Keep pure helpers out of component and hook files. Move formatters, transforms, constants, stores, models, and other reusable logic into `utils/`.
- Keep providers and context-object modules in `providers/`, not `components/`.
- Avoid manual React memoization. Do not add `memo`, `useMemo`, or `useCallback` for ordinary render values or callbacks. Use them only for measured performance issues, required stable identity, or correctness. Add a short reason when you do.

## Styling

- Style with Tailwind classes and the `@workspace/ui` primitives. Do not write raw CSS or inline `style` props except for values that must be computed at runtime (dynamic positions, measured sizes).
- Use theme tokens only. Color classes must resolve to a token: `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `bg-card`, `border-border`, etc.
- Never use raw Tailwind palette colors (`bg-blue-600`, `text-red-500`, `text-sky-300`, `amber-*`, `emerald-*`) or hex/`oklch()` literals in components. They bypass theming and dark mode.
- Status and diff colors have tokens — use them instead of picking a palette hue:
  - error / danger → `destructive`
  - info / primary action → `info`
  - success / passed → `success`
  - warning / degraded → `warning`
  - diff added / removed → `diff-added` / `diff-removed`
- These tokens flip automatically between light and dark. Do not hand-roll dark variants like `text-sky-700 dark:text-sky-300`; write `text-info` once.
- A token works with opacity and every utility: `bg-success/10`, `border-warning/30`, `ring-info`.
- Need a color with no token? Add it to `packages/ui/src/styles/globals.css` (light `:root`, `.dark`, and the `@theme inline` map) instead of inlining a palette class.
- Compose the shared primitives; do not restyle them ad-hoc or reach for a raw `<button>`/`<input>` when a primitive exists.

## Naming And Refactors

- Do not repeat the folder name in file or symbol names. In `workspace/`, prefer `sidebar.tsx`, not `workspace-sidebar.tsx`.
- Keep qualifiers only when they add meaning: domain types like `WorkspaceCommand`, domain terms like `workspacePath`, or root components like `WorkspaceView`.
- When removing a redundant prefix, rename the file, exports, and all call sites in one pass.
- No backward compatibility shims.
- No legacy aliases.
- Delete obsolete tests instead of preserving old behavior.
- Remove duplicate code aggressively.

## TypeScript Fixes

- Treat readonly/mutable mismatches as contract bugs first.
- Do not copy containers just to satisfy TypeScript.
- If a callee does not mutate a value, make its parameter or model type accept readonly data.
- Avoid fake fixes like `sizes: [...node.sizes]`. Copy only for a real ownership boundary or real mutation.

## Testing

- Tests run on Vitest.
- Apps run under Bun: `bun --bun vitest`.
- Runtime-neutral `packages/*` run plain `vitest`.
- Use these environments, in this order of preference: real browser, happy-dom, never jsdom.
- Test projects:
  - `node` — pure logic and in-process server tests. Runs under `--bun`.
  - `dom` — hook and component tests in happy-dom. Runs under `--bun`.
  - `browser` — real layout/paint `*.browser.tsx` tests via Playwright. Runs under plain Node because Vitest browser orchestration breaks under `--bun`.
- The `--bun` flag is required for app tests. Without it, `bun:sqlite`, `Bun.spawn`, and other Bun APIs do not resolve. Coverage is the only casualty; we do not use it.

### Use Real App Code

- Import `{ test, expect }` from `apps/web/test/fixtures.ts`, not from `vitest`, for app tests.
- Drive the real in-process Elysia server. The `server` fixture builds `createApp` over a temp workspace. The `client` fixture is a real `treaty` client wired to `app.handle`.
- Do not `mock.module` or `vi.mock` our server, client, or feature modules.
- Production code calls `getClient()` from `@/lib/client`. Tests inject the real client with `setClient` and reset it with `resetClient`.
- Build real state. For example, `git init` a temp repo and write real files, then assert through real routes.

### Mock Boundaries Only

- Mock only the outside world and unspawnable processes.
- Use MSW or injected `fetcher`s for third-party HTTP. Set `onUnhandledRequest: 'error'`.
- Use injectable factories for PTY and LSP child processes.
- Mock serialization edges a real server cannot reproduce, such as Eden `Date` normalization.
- `MockProviderAdapter` is a production adapter, not a test stub. Prefer it over the real Codex adapter, which spawns an external binary.
- Browser tests cannot import the Bun-native server into Node. Spawn the real server as a child `bun` process behind the Vite proxy in `apps/web/test/env/browser-file-server.ts`.
- Node and dom tests import the server in-process.

### Test Hygiene

- Shared test code lives under `test/`.
- Use `fixtures.ts` for `test.extend`.
- Use `render.tsx`; `renderWithProviders` mirrors the app's `main.tsx` provider stack.
- Put shared builders in `test/factories/`.
- Put environment and MSW setup in `test/env/` and `test/msw/`.
- Do not redefine per-file factories.
- Do not hand-roll provider trees.
- Avoid import-time nondeterminism, such as `Math.random()` at module scope. Use deterministic or seedable ids.

### Bun/Vitest Gotchas

- Under Vitest transforms, `import.meta.path` and `import.meta.dir` are `undefined`. `import.meta.dirname` works. Avoid Bun-only `import.meta` fields in code that tests must drive.
- Cold process-spawning tests can exceed Vitest's 5s default timeout. If CI flakes cold, raise `testTimeout` for that project.
- The node-pty bridge must spawn the real Node binary, not Bun's `--bun` node shim.
- Under `bun --bun`, Bun prepends a temp `node` symlink to `PATH`. `Bun.spawn(['node', ...])` then runs Bun, and `@lydell/node-pty` breaks with `this._socket.write is not a function`.
- Use `resolveNodeBinary()` in `terminal/service.ts`; it walks `PATH` and skips Bun-backed `node`. Production plain `bun` already resolves `node` correctly, but this protects tests.

`tabular-nums` should be the default for any number that updates ( timers, counters, prices, percentages, scores, live data etc ).

you can enable this tnum OpenType feature using the CSS property `font-variant-numeric`.

.tabular-nums {
font-variant-numeric: tabular-nums;
}
