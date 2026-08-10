import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE,
  orchestrationSearchThreadsInputSchema,
} from '@workspace/contracts'
import {
  clientOrchestrationCommandSchema,
  orchestrationReplayEventsInputSchema,
  threadIdSchema,
} from './schemas'
import type { OrchestrationEngine } from './engine'
import type { OrchestrationCheckpointDiffQuery } from './checkpoint-diff-query'
import { OrchestrationThreadSearchQuery } from './thread-search-query'
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

const turnCountQueryValueSchema = v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(0))

/** Query strings arrive as text; only the exact "true" opts in. */
const booleanQueryValueSchema = v.pipe(
  v.string(),
  v.transform((value) => value === 'true'),
)

const turnDiffQuerySchema = v.object({
  fromTurnCount: turnCountQueryValueSchema,
  ignoreWhitespace: v.optional(booleanQueryValueSchema),
  threadId: threadIdSchema,
  toTurnCount: turnCountQueryValueSchema,
})

const fullThreadDiffQuerySchema = v.object({
  ignoreWhitespace: v.optional(booleanQueryValueSchema),
  threadId: threadIdSchema,
  toTurnCount: turnCountQueryValueSchema,
})

const threadDetailStreamQuerySchema = v.object({
  afterSequence: v.optional(v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(0)), '0'),
  threadId: threadIdSchema,
})

export function orchestrationRoutes(
  engine: OrchestrationEngine,
  checkpointDiff: OrchestrationCheckpointDiffQuery,
  // Defaults to the process-wide database — the same handle production hands
  // the engine. Callers holding their own handle pass a query built over it.
  threadSearch: OrchestrationThreadSearchQuery = new OrchestrationThreadSearchQuery(),
) {
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
              // A full window means the thread is longer than the snapshot: the
              // rest is reachable only if the client pages backwards, so these
              // are the fields that tell a truncated timeline from a short one.
              activityWindowFull:
                snapshot.thread.activities.length === ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE,
              messageCount: snapshot.thread.messages.length,
              messageWindowFull:
                snapshot.thread.messages.length === ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE,
              snapshotSequence: snapshot.snapshotSequence,
              windowSize: ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE,
            }),
          ),
        {
          query: threadDetailQuerySchema,
        },
      )
      .post(
        '/thread-search',
        ({ body }) =>
          observeRequestOperation(
            // The query text is user content and stays off the wide event; its
            // length is what explains a slow scan or a bounds rejection.
            chatOperationContext('orchestration.thread_search', {
              limit: body.limit,
              queryLength: body.query.length,
            }),
            async () => threadSearch.search(body),
            (result) => ({ matchCount: result.matches.length }),
          ),
        {
          body: orchestrationSearchThreadsInputSchema,
        },
      )
      .get(
        '/turn-diff',
        ({ query }) =>
          observeRequestOperation(
            chatOperationContext('orchestration.turn_diff', {
              fromTurnCount: query.fromTurnCount,
              ignoreWhitespace: query.ignoreWhitespace ?? false,
              threadId: query.threadId,
              toTurnCount: query.toTurnCount,
            }),
            async () => checkpointDiff.turnDiff(query),
            (diffs) => ({ diffCount: diffs.length }),
          ),
        {
          query: turnDiffQuerySchema,
        },
      )
      .get(
        '/full-thread-diff',
        ({ query }) =>
          observeRequestOperation(
            chatOperationContext('orchestration.full_thread_diff', {
              ignoreWhitespace: query.ignoreWhitespace ?? false,
              threadId: query.threadId,
              toTurnCount: query.toTurnCount,
            }),
            async () => checkpointDiff.fullThreadDiff(query),
            (diffs) => ({ diffCount: diffs.length }),
          ),
        {
          query: fullThreadDiffQuerySchema,
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
