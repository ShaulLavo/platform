import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Shared resolution so every project reads the same `@/` paths as the app.
const alias = { '@': path.resolve(__dirname, './src') }
const reactPlugin = () => react({ babel: { plugins: ['babel-plugin-react-compiler'] } })
const browserTestPort = process.env.VITEST_BROWSER_PORT ?? '5179'
const browserFileServerPort = process.env.VITEST_BROWSER_FILE_SERVER_PORT ?? '33201'
const browserFileServerUrl = `http://127.0.0.1:${browserFileServerPort}`
const browserProxyOrigin = `http://127.0.0.1:${browserTestPort}`

process.env.VITEST_BROWSER_PORT = browserTestPort
process.env.VITEST_BROWSER_FILE_SERVER_PORT = browserFileServerPort
process.env.VITEST_BROWSER_FILE_SERVER_URL = browserFileServerUrl

// Three test worlds, in the project's preferred order: real browser > happy-dom > node.
// Phase 1 stands these up in parallel to the existing `bun test` suite; the bun
// files keep running under `bun test` until the codemod migrates their imports.
export default defineConfig({
  test: {
    projects: [
      {
        // Pure logic + anything that talks to the in-process server. No DOM.
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          setupFiles: ['./test/env/msw.ts'],
        },
      },
      {
        // Hooks + light component/render tests. happy-dom, not jsdom.
        plugins: [reactPlugin()],
        resolve: { alias, dedupe: ['react', 'react-dom'] },
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['src/**/*.test.tsx', 'test/**/*.test.tsx'],
          exclude: ['src/**/*.browser.tsx'],
          setupFiles: ['./test/env/msw.ts', './test/env/dom.ts'],
        },
      },
      {
        // Real-paint / layout / visual tests in a real browser via Playwright.
        plugins: [reactPlugin(), tailwindcss()],
        resolve: { alias, dedupe: ['react', 'react-dom'] },
        define: {
          'import.meta.env.VITE_SERVER_URL': 'globalThis.location.origin',
        },
        optimizeDeps: { include: ['@phosphor-icons/react'] },
        server: {
          host: '127.0.0.1',
          port: Number(browserTestPort),
          proxy: {
            '/_log': fileServerProxy(),
            '/fonts': fileServerProxy(),
            '/fs': fileServerProxy(),
            '/git': fileServerProxy(),
            '/health': fileServerProxy(),
            '/lsp': fileServerProxy(),
            '/orchestration': fileServerProxy(),
            '/provider': fileServerProxy(),
          },
          strictPort: true,
          watch: null,
        },
        test: {
          name: 'browser',
          globalSetup: ['./test/env/browser-file-server.ts'],
          include: ['src/**/*.browser.tsx'],
          setupFiles: ['./test/env/jest-dom.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: 'playwright',
            screenshotFailures: false,
            instances: [{ browser: 'chromium', viewport: { height: 700, width: 900 } }],
          },
        },
      },
    ],
  },
})

function fileServerProxy() {
  return {
    changeOrigin: true,
    headers: {
      origin: browserProxyOrigin,
    },
    target: browserFileServerUrl,
    ws: true,
  }
}
