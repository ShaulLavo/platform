import path from 'node:path'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const alias = {
  '@workspace/tree': path.resolve(__dirname, './src'),
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
          exclude: ['src/**/*.browser.tsx'],
        },
      },
      {
        resolve: { alias, dedupe: ['react', 'react-dom'] },
        test: {
          name: 'browser',
          include: ['src/**/*.browser.tsx'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            screenshotFailures: false,
            instances: [{ browser: 'chromium', viewport: { height: 600, width: 560 } }],
          },
        },
      },
    ],
  },
})
