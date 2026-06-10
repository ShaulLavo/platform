import { treaty } from '@elysia/eden'
import type { App } from 'server/testing'
import { test as base } from 'vitest'
import { resetClient, setClient } from '@/lib/client'
import { makeTestServer, TEST_ORIGIN, type TestServer } from './server'

export type TestClient = ReturnType<typeof createInProcessClient>

// Eden client that calls the real app directly — every request goes through
// `app.handle`, so there is no socket, no port, and nothing mocked.
export function createInProcessClient(server: TestServer): ReturnType<typeof treaty<App>> {
  return treaty<App>(TEST_ORIGIN, {
    fetcher: ((input, init) => server.app.handle(new Request(input, init))) as typeof fetch,
    headers: { origin: server.origin },
  })
}

type Fixtures = {
  /** Real in-process server bound to an isolated temp workspace. */
  server: TestServer
  /** Eden client wired to `server` — typed, real routes, zero network. */
  client: TestClient
}

// The project's own test entry point. Tests import { test, expect } from here,
// never from 'vitest' directly, so shared setup/teardown stays in one place.
export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Vitest fixture callbacks must destructure the context object.
  server: async ({}, use) => {
    const server = await makeTestServer()
    await use(server)
    await server.cleanup()
  },
  client: async ({ server }, use) => {
    const client = createInProcessClient(server)
    // Point the app's RPC singleton at the in-process server so code that calls
    // `getClient()` (api.ts, hooks, components) hits the real server, not a mock.
    setClient(client)
    await use(client)
    resetClient()
  },
})

export { expect } from 'vitest'
