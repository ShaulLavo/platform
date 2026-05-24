import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  clientOrchestrationCommandSchema,
  orchestrationReplayEventsInputSchema,
  threadIdSchema,
} from './schemas'
import type { OrchestrationEngine } from './engine'
import { toSse } from '../sse'

const threadDetailQuerySchema = v.object({
  threadId: threadIdSchema,
})

const streamQuerySchema = v.object({
  afterSequence: v.optional(v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(0)), '0'),
})

const threadDetailStreamQuerySchema = v.object({
  afterSequence: v.optional(v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(0)), '0'),
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
      .get(
        '/shell-stream',
        ({ query, request }) =>
          toSse(
            engine.shellStream({ afterSequence: query.afterSequence, signal: request.signal }),
            {
              event: (event) => event.kind,
            },
          ),
        {
          query: streamQuerySchema,
        },
      )
      .get(
        '/thread-detail-stream',
        ({ query, request }) =>
          toSse(
            engine.threadDetailStream(query.threadId, {
              afterSequence: query.afterSequence,
              signal: request.signal,
            }),
            {
              event: (event) => event.kind,
            },
          ),
        {
          query: threadDetailStreamQuerySchema,
        },
      )
      .post('/replay', ({ body }) => engine.replay(body), {
        body: orchestrationReplayEventsInputSchema,
      }),
  )
}
