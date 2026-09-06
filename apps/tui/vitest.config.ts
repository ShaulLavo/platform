import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  // Keep OpenTUI's class identities consistent with React's native Bun imports.
  ssr: { resolve: { conditions: ['bun', 'node', 'development|production'] } },
  oxc: { jsx: { runtime: 'automatic', importSource: '@opentui/react' } },
  test: {
    name: 'node',
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 15_000,
  },
})
