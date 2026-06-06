import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from '../msw/server'

// Phase 1 uses `bypass` so the empty handler set is a no-op. Once real outbound
// handlers land, this tightens to `error` so any unexpected hit on the outside
// world fails the test loudly — the guarantee that "use the real thing" relies on.
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
