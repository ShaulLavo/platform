import { test as base } from 'vitest'

import { createInProcessClient, createInProcessFetcher } from './client'
import { makeTestServer, type TestServer } from './server'

type Fixtures = {
  server: TestServer
  client: ReturnType<typeof createInProcessClient>
  fetcher: ReturnType<typeof createInProcessFetcher>
}

export const test = base.extend<Fixtures>({
  // Vitest requires destructuring to discover fixture dependencies.
  // eslint-disable-next-line no-empty-pattern
  server: async ({}, provide) => {
    const server = await makeTestServer()
    try {
      await provide(server)
    } finally {
      await server.cleanup()
    }
  },
  client: async ({ server }, provide) => {
    await provide(createInProcessClient(server))
  },
  fetcher: async (
    { server }: Pick<Fixtures, 'server'>,
    provide: (fetcher: Fixtures['fetcher']) => Promise<void>,
  ) => {
    await provide(createInProcessFetcher(server))
  },
})

export { expect } from 'vitest'
