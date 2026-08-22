import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from '../msw/server'

// `error`, not `bypass`: our own server is reached in-process, so anything that
// makes it to a socket is a test talking to the outside world by accident. It
// fails the test that caused it instead of printing a bare ECONNREFUSED stack
// from deep in Bun's http client, attributable to nothing.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
