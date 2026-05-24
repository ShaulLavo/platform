import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  clientOrchestrationCommandSchema,
  orchestrationReplayEventsInputSchema,
  threadIdSchema,
} from './schemas'
import type { OrchestrationEngine } from './engine'

const threadDetailQuerySchema = v.object({
  threadId: threadIdSchema,
})

export function orchestrationRoutes(engine: OrchestrationEngine) {
  return new Elysia({ name: 'orchestration-routes' }).group('/orchestration', (app) =>
    app
      .post('/commands', ({ body }) => engine.dispatchClientCommand(body), {
        body: clientOrchestrationCommandSchema,
      })
      .get('/shell-snapshot', () => engine.shellSnapshot())
      .get('/thread-detail', ({ query }) => engine.threadDetailSnapshot(query.threadId), {
        query: threadDetailQuerySchema,
      })
      .post('/replay', ({ body }) => engine.replay(body), {
        body: orchestrationReplayEventsInputSchema,
      }),
  )
}
