import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  closeApp,
  createApp,
  createMetadataDatabase,
  MockProviderAdapter,
  NerdFontService,
  ProviderAdapterRegistry,
  testSettingsOptions,
  type MetadataDatabaseHandle,
} from 'server/testing'

// Origin the in-process client presents; the app's auth guard requires a
// trusted origin, so the test client and the app must agree on this value.
export const TEST_ORIGIN = 'http://localhost:5173'

export type TestServer = {
  /** The real Elysia app — drive it with `app.handle(new Request(...))`. */
  app: ReturnType<typeof createApp>
  database: MetadataDatabaseHandle
  /** Isolated temp workspace root backing this app's filesystem. */
  root: string
  origin: string
  cleanup: () => Promise<void>
}

// Boots a real server against a throwaway workspace. No network, no mocks: the
// app routes, valibot contracts, and filesystem are the genuine article.
export async function makeTestServer(): Promise<TestServer> {
  const root = await mkdtemp(path.join(tmpdir(), 'web-itest-'))
  const database = createMetadataDatabase({ databasePath: ':memory:' })
  const app = createApp({
    auth: { allowedOrigins: [TEST_ORIGIN] },
    // Keep the real parser/cache/route path, but pin its cache inside this
    // fixture. MSW supplies the external downloads page.
    fonts: new NerdFontService({ cacheRoot: path.join(root, '.platform-test', 'fonts') }),
    metadataDatabase: database,
    orchestration: {
      database: database.db,
      // Never the default registry: its Codex and Claude adapters shell out to
      // real CLIs, so any route that touches a provider would spawn a binary,
      // read the developer's own machine, and answer differently per checkout.
      providerAdapterRegistry: new ProviderAdapterRegistry([new MockProviderAdapter()]),
    },
    settings: testSettingsOptions(root),
    watch: false,
    workspaceRoot: root,
  })

  return {
    app,
    cleanup: () => cleanupTestServer(app, root, database),
    database,
    origin: TEST_ORIGIN,
    root,
  }
}

async function cleanupTestServer(
  app: ReturnType<typeof createApp>,
  root: string,
  database: MetadataDatabaseHandle,
) {
  try {
    await closeApp(app)
  } finally {
    database.close()
    await rm(root, { force: true, recursive: true })
  }
}
