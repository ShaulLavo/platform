import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { closeApp, createApp } from 'server/testing'

// Origin the in-process client presents; the app's auth guard requires a
// trusted origin, so the test client and the app must agree on this value.
export const TEST_ORIGIN = 'http://localhost:5173'

export type TestServer = {
  /** The real Elysia app — drive it with `app.handle(new Request(...))`. */
  app: ReturnType<typeof createApp>
  /** Isolated temp workspace root backing this app's filesystem. */
  root: string
  origin: string
  cleanup: () => Promise<void>
}

// Boots a real server against a throwaway workspace. No network, no mocks: the
// app routes, valibot contracts, and filesystem are the genuine article.
export async function makeTestServer(): Promise<TestServer> {
  const root = await mkdtemp(path.join(tmpdir(), 'web-itest-'))
  const app = createApp({
    auth: { allowedOrigins: [TEST_ORIGIN] },
    watch: false,
    workspaceRoot: root,
  })

  return {
    app,
    cleanup: () => cleanupTestServer(app, root),
    origin: TEST_ORIGIN,
    root,
  }
}

async function cleanupTestServer(app: ReturnType<typeof createApp>, root: string) {
  await closeApp(app)
  await rm(root, { force: true, recursive: true })
}
