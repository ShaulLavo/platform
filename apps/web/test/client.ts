import { treaty } from '@elysia/eden'
import type { App } from 'server/testing'

import type { TestServer } from './server'

// Eden client that calls the real app directly — every request goes through
// `app.handle`, so there is no socket, no port, and nothing mocked.
export function createInProcessClient(server: TestServer): ReturnType<typeof treaty<App>> {
  return treaty<App>(server.origin, {
    fetcher: ((input, init) =>
      server.app.handle(withOrigin(new Request(input, init), server.origin))) as typeof fetch,
    headers: { origin: server.origin },
  })
}

// happy-dom's Request drops `origin` (a browser-forbidden header), which the
// app's auth guard requires. Re-attach it so dom tests reach the real routes.
function withOrigin(request: Request, origin: string) {
  if (request.headers.get('origin') === origin) return request

  const headers = new Headers(request.headers)
  headers.set('origin', origin)
  Object.defineProperty(request, 'headers', { value: headers })
  return request
}
