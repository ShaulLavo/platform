import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  clientOrchestrationCommandSchema,
  orchestrationReplayEventsInputSchema,
  threadIdSchema,
} from './schemas'
import type { OrchestrationEngine } from './engine'
import { toSse } from '../sse'
import { observeRequestOperation } from '../observability'
import { chatOperationContext, orchestrationReplaySummary } from './orchestration-logging'

const ORCHESTRATION_STREAM_HEARTBEAT_MS = 15_000

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
      .post(
        '/commands',
        ({ body }) =>
          observeRequestOperation(
            chatOperationContext('orchestration.commands', {
              commandId: body.commandId,
              commandType: body.type,
            }),
            async () => engine.dispatchClientCommand(body),
            (result) => ({
              deduped: result.deduped,
              sequence: result.sequence,
            }),
          ),
        {
          body: clientOrchestrationCommandSchema,
        },
      )
      .get('/shell-snapshot', () =>
        observeRequestOperation(
          chatOperationContext('orchestration.shell_snapshot'),
          async () => engine.shellSnapshot(),
          (snapshot) => ({
            projectCount: snapshot.projects.length,
            snapshotSequence: snapshot.snapshotSequence,
            threadCount: snapshot.threads.length,
          }),
        ),
      )
      .get(
        '/thread-detail',
        ({ query }) =>
          observeRequestOperation(
            chatOperationContext('orchestration.thread_detail_snapshot', {
              threadId: query.threadId,
            }),
            async () => engine.threadDetailSnapshot(query.threadId),
            (snapshot) => ({
              activityCount: snapshot.thread.activities.length,
              messageCount: snapshot.thread.messages.length,
              snapshotSequence: snapshot.snapshotSequence,
            }),
          ),
        {
          query: threadDetailQuerySchema,
        },
      )
      .get(
        '/shell-stream',
        ({ query, request }) =>
          toSse(
            engine.shellStream({ afterSequence: query.afterSequence, signal: request.signal }),
            {
              event: (event) => event.kind,
              heartbeatMs: ORCHESTRATION_STREAM_HEARTBEAT_MS,
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
              heartbeatMs: ORCHESTRATION_STREAM_HEARTBEAT_MS,
            },
          ),
        {
          query: threadDetailStreamQuerySchema,
        },
      )
      .post(
        '/replay',
        ({ body }) =>
          observeRequestOperation(
            chatOperationContext('orchestration.replay', orchestrationReplaySummary(body)),
            async () => engine.replay(body),
            (result) => ({
              eventCount: result.events.length,
              maxSequence: result.events.at(-1)?.sequence ?? body.afterSequence,
            }),
          ),
        {
          body: orchestrationReplayEventsInputSchema,
        },
      ),
  )
}
