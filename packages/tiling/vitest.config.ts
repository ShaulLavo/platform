import path from 'node:path'
import { defineConfig } from 'vitest/config'

const alias = {
  '@workspace/tiling': path.resolve(__dirname, './src'),
}

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias, dedupe: ['react', 'react-dom'] },
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
  },
})
