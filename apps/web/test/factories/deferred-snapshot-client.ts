import { treaty } from '@elysia/eden'
import type { App } from 'server/client-contract'
import type { TestServer } from '../server'

export function deferredSnapshotClient(server: TestServer) {
  const started = Promise.withResolvers<void>()
  const responseGate = Promise.withResolvers<void>()
  const client = treaty<App>(server.origin, {
    headers: { origin: server.origin },
    fetcher: Object.assign(
      async (...[input, init]: Parameters<typeof fetch>) => {
        const request = new Request(input, init)
        const response = await server.app.handle(request)
        if (new URL(request.url).pathname !== '/orchestration/session-detail') return response
        started.resolve()
        await responseGate.promise
        return response
      },
      { preconnect: fetch.preconnect },
    ),
  })
  return { client, started: started.promise, release: () => responseGate.resolve() }
}
