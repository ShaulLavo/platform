import { treaty } from '@elysia/eden'
import { healthDescriptorSchema } from '@workspace/contracts'
import type { App } from 'server/client-contract'
import * as v from 'valibot'
import type { TestServer } from '../server'

export function createIncompatibleProtocolClient(server: TestServer, protocolVersion: number) {
  return treaty<App>(server.origin, {
    fetcher: Object.assign(
      async (...[input, init]: Parameters<typeof fetch>) => {
        const request = new Request(input, init)
        const headers = new Headers(request.headers)
        headers.set('origin', server.origin)
        Object.defineProperty(request, 'headers', { value: headers })
        const response = await server.app.handle(request)
        if (new URL(request.url).pathname !== '/health') return response

        // A running server always reports the current version; change only the wire descriptor.
        const descriptor = v.parse(healthDescriptorSchema, await response.json())
        return Response.json({ ...descriptor, protocolVersion })
      },
      { preconnect: fetch.preconnect },
    ),
  })
}
