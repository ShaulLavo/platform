import type { RequestHandler } from 'msw'

// MSW only ever stands in for the *outside world* — third-party hosts the real
// server reaches out to (font downloads, GitHub release assets, provider APIs).
// Our own Elysia server is never mocked here; tests drive it in-process.
export const handlers: RequestHandler[] = []
