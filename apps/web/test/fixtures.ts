import { test as base } from 'vitest'

import { getClient, setClient } from '@/lib/client'

import { createControlledInProcessClient, createInProcessClient } from './client'
import { makeTestServer, type TestServer } from './server'

type TestClient = ReturnType<typeof createInProcessClient>
type ControlledTestClient = ReturnType<typeof createControlledInProcessClient>

type Fixtures = {
  /** Real in-process server bound to an isolated temp workspace. */
  server: TestServer
  /** Eden client wired to `server` — typed, real routes, zero network. */
  client: TestClient
  /** Opt-in real client whose settings SSE response can be ended deterministically. */
  controlledClient: ControlledTestClient
}

// The project's own test entry point. Tests import { test, expect } from here,
// never from 'vitest' directly, so shared setup/teardown stays in one place.
export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Vitest fixture callbacks must destructure the context object.
  server: async ({}, provide) => {
    const server = await makeTestServer()
    await provide(server)
    await server.cleanup()
  },
  client: async ({ server }, provide) => {
    // Point the app's RPC singleton at this test's server so code that calls
    // `getClient()` (api.ts, hooks, components) hits the real server, not a
    // mock. Restore whatever was there before rather than resetting to the
    // production client: the dom project installs a file-wide in-process
    // client, and resetting would hand every later test in the file a socket.
    const previous = getClient()
    const client = createInProcessClient(server)
    setClient(client)
    await provide(client)
    setClient(previous)
  },
  controlledClient: async ({ server }, provide) => {
    const previous = getClient()
    const controlled = createControlledInProcessClient(server)
    setClient(controlled.client)
    await provide(controlled)
    setClient(previous)
  },
})

export { expect } from 'vitest'
