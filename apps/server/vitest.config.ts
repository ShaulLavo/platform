import { defineConfig } from 'vitest/config'

// Bun-native server: must run under the Bun runtime (`bun --bun vitest`) so
// bun:sqlite and Bun.spawn resolve. Tests drive the real app via `app.handle`
// and spawn real processes, so they run in the Node environment with no DOM.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The suite spawns real processes (git, PTYs, LSP servers); cold spawns
    // under parallel load blow Vitest's 5s default. Server project only —
    // web and packages keep the default.
    testTimeout: 15_000,
  },
})
