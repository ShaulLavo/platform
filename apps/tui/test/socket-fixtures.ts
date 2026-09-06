import { RecordingLspPool, recordingPtyFactory } from '@workspace/client-core/test/socket-processes'
import { test as base } from './fixtures'
import { makeTestServer, type TestServer } from './server'

type Fixtures = {
  pty: ReturnType<typeof recordingPtyFactory>
  lsp: RecordingLspPool
  socketServer: TestServer
}

export const test = base.extend<Fixtures>({
  // Vitest discovers fixture dependencies through the destructured parameter.
  // eslint-disable-next-line no-empty-pattern
  pty: async ({}, provide) => {
    await provide(recordingPtyFactory())
  },
  // eslint-disable-next-line no-empty-pattern
  lsp: async ({}, provide) => {
    await provide(new RecordingLspPool())
  },
  socketServer: async ({ pty, lsp }, provide) => {
    const server = await makeTestServer({
      terminal: { ptyFactory: pty.factory, env: { SHELL: '/bin/sh' } },
      lsp: { pool: lsp },
    })
    try {
      await provide(server)
    } finally {
      await server.cleanup()
    }
  },
})
export { expect } from './fixtures'
