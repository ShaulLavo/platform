import { Elysia } from 'elysia'

import { recordClientLog } from './client-ingest'

export function observabilityRoutes() {
  return new Elysia({ name: 'observability-routes' }).group('/_log', (app) =>
    app.post('/ingest', ({ body, request, set }) => {
      const result = recordClientLog(body, request)
      if (result.ok) {
        set.status = 204
        return null
      }

      set.status = 400
      return { error: { message: result.message } }
    }),
  )
}
