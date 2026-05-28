/// <reference types="@vitest/browser/providers/playwright" />

import { defineConfig, mergeConfig } from 'vitest/config'

import baseConfig from './vite.config'

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      browser: {
        enabled: true,
        headless: true,
        instances: [
          {
            browser: 'chromium',
            viewport: { height: 700, width: 900 },
          },
        ],
        provider: 'playwright',
        screenshotFailures: false,
      },
      include: ['src/**/*.browser.tsx'],
    },
  }),
)
