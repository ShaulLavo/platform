import * as v from 'valibot'
import { projectIdSchema, threadIdSchema } from './chat-ids'
import {
  isoDateTimeSchema,
  nonNegativeIntegerSchema,
  trimmedNonEmptyStringSchema,
} from './chat-model'
import { clientOrchestrationCommandSchema } from './orchestration-commands'
import {
  ORCHESTRATION_THREAD_DETAIL_MAX_PAGE_SIZE,
  orchestrationReplayEventsInputSchema,
  orchestrationShellStreamItemSchema,
  orchestrationThreadDetailAnchorSchema,
  orchestrationThreadStreamItemSchema,
} from './orchestration-snapshots'

/**
 * Bumped whenever a shape in this file changes in a way an older peer cannot
 * read. The server reports it in the connection handshake so a client built
 * against a different protocol detects the skew on connect instead of failing
 * later on a frame it cannot parse.
 *
 * 2 — added the `threadDetailPage` request.
 */
export const ORCHESTRATION_WS_PROTOCOL_VERSION = 2

/**
 * Hard ceiling on one `replayEvents` page. `replayEvents` is client-reachable,
 * so an unbounded read is a request-shaped way to make the server decode the
 * entire event log into memory. Clients page by passing the last sequence they
 * received back as `afterSequence`.
 */
export const ORCHESTRATION_REPLAY_MAX_EVENTS = 1_000

/**
 * How far behind the server's head a subscriber's cursor may be and still be
 * resumed by replay. Past this gap a single snapshot is both cheaper and
 * bounded, so the server resets the client instead of replaying unbounded
 * history.
 */
export const ORCHESTRATION_RESUME_MAX_GAP = 1_000

/**
 * Bounds on server-side thread search. The server's SQLite client is
 * synchronous and single-connection, so both the scan input and the response
 * size are bounded: an unbounded search is a request-shaped way for one client
 * to monopolize that connection for every other request in the process.
 */
export const ORCHESTRATION_THREAD_SEARCH_MIN_QUERY_LENGTH = 2
export const ORCHESTRATION_THREAD_SEARCH_MAX_QUERY_LENGTH = 200
export const ORCHESTRATION_THREAD_SEARCH_DEFAULT_LIMIT = 20
export const ORCHESTRATION_THREAD_SEARCH_MAX_LIMIT = 50

/** Long enough to read the phrase in context, short enough that fifty of them stay one frame. */
export const ORCHESTRATION_THREAD_SEARCH_SNIPPET_MAX_LENGTH = 240

export const orchestrationThreadSearchSourceSchema = v.picklist(['user', 'assistant'])

export const orchestrationSearchThreadsInputSchema = v.object({
  query: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(ORCHESTRATION_THREAD_SEARCH_MIN_QUERY_LENGTH),
    v.maxLength(ORCHESTRATION_THREAD_SEARCH_MAX_QUERY_LENGTH),
  ),
  limit: v.optional(
    v.pipe(
      nonNegativeIntegerSchema,
      v.minValue(1),
      v.maxValue(ORCHESTRATION_THREAD_SEARCH_MAX_LIMIT),
    ),
    ORCHESTRATION_THREAD_SEARCH_DEFAULT_LIMIT,
  ),
})

/**
 * One match per thread, not per message: the answer to "where did I discuss X"
 * is a thread, and a thread that says X forty times would otherwise bury every
 * other thread out of the bounded result.
 */
export const orchestrationThreadSearchMatchSchema = v.object({
  threadId: threadIdSchema,
  projectId: projectIdSchema,
  source: orchestrationThreadSearchSourceSchema,
  snippet: v.pipe(v.string(), v.maxLength(ORCHESTRATION_THREAD_SEARCH_SNIPPET_MAX_LENGTH)),
  messageCreatedAt: isoDateTimeSchema,
})

export const orchestrationSearchThreadsResultSchema = v.object({
  matches: v.array(orchestrationThreadSearchMatchSchema),
})

export const orchestrationWsRequestIdSchema = trimmedNonEmptyStringSchema
export const orchestrationWsSubscriptionIdSchema = trimmedNonEmptyStringSchema

export const orchestrationWsReplayInputSchema = v.object({
  ...orchestrationReplayEventsInputSchema.entries,
  limit: v.optional(
    v.pipe(nonNegativeIntegerSchema, v.minValue(1), v.maxValue(ORCHESTRATION_REPLAY_MAX_EVENTS)),
  ),
})

/**
 * The wire form of a backwards page read. Anchors and limit carry no defaults
 * here on purpose: the frame says exactly what the client asked for, and
 * `orchestrationThreadDetailPageInputSchema` on the server applies the defaults
 * once, in the one place that owns them.
 */
export const orchestrationWsThreadDetailPageInputSchema = v.object({
  threadId: threadIdSchema,
  beforeMessage: v.nullish(orchestrationThreadDetailAnchorSchema),
  beforeActivity: v.nullish(orchestrationThreadDetailAnchorSchema),
  limit: v.optional(
    v.pipe(
      nonNegativeIntegerSchema,
      v.minValue(1),
      v.maxValue(ORCHESTRATION_THREAD_DETAIL_MAX_PAGE_SIZE),
    ),
  ),
})

export const orchestrationWsRequestSchema = v.variant('method', [
  v.object({
    kind: v.literal('request'),
    requestId: orchestrationWsRequestIdSchema,
    method: v.literal('dispatchCommand'),
    command: clientOrchestrationCommandSchema,
  }),
  v.object({
    kind: v.literal('request'),
    requestId: orchestrationWsRequestIdSchema,
    method: v.literal('shellSnapshot'),
  }),
  v.object({
    kind: v.literal('request'),
    requestId: orchestrationWsRequestIdSchema,
    method: v.literal('threadDetailSnapshot'),
    threadId: threadIdSchema,
  }),
  v.object({
    kind: v.literal('request'),
    requestId: orchestrationWsRequestIdSchema,
    method: v.literal('threadDetailPage'),
    input: orchestrationWsThreadDetailPageInputSchema,
  }),
  v.object({
    kind: v.literal('request'),
    requestId: orchestrationWsRequestIdSchema,
    method: v.literal('replayEvents'),
    input: orchestrationWsReplayInputSchema,
  }),
  v.object({
    kind: v.literal('request'),
    requestId: orchestrationWsRequestIdSchema,
    method: v.literal('serverConfig'),
  }),
])

/**
 * `afterSequence` is the resume cursor: the highest stream sequence the client
 * has already applied. `0` means "no cursor" and always yields a snapshot.
 * A non-zero cursor is resumed by replaying the events after it, unless the
 * server can no longer serve that range (see `ORCHESTRATION_RESUME_MAX_GAP`),
 * in which case the subscription opens with a snapshot instead. Either way the
 * server emits a `synchronized` frame once the client is caught up to live.
 */
export const orchestrationWsSubscribeSchema = v.variant('method', [
  v.object({
    kind: v.literal('subscribe'),
    subscriptionId: orchestrationWsSubscriptionIdSchema,
    method: v.literal('subscribeShell'),
    afterSequence: v.optional(nonNegativeIntegerSchema, 0),
  }),
  v.object({
    kind: v.literal('subscribe'),
    subscriptionId: orchestrationWsSubscriptionIdSchema,
    method: v.literal('subscribeThread'),
    threadId: threadIdSchema,
    afterSequence: v.optional(nonNegativeIntegerSchema, 0),
  }),
])

export const orchestrationWsUnsubscribeSchema = v.object({
  kind: v.literal('unsubscribe'),
  subscriptionId: orchestrationWsSubscriptionIdSchema,
})

export const orchestrationWsPingSchema = v.object({
  kind: v.literal('ping'),
  requestId: orchestrationWsRequestIdSchema,
})

export const orchestrationWsClientMessageSchema = v.union([
  orchestrationWsRequestSchema,
  orchestrationWsSubscribeSchema,
  orchestrationWsUnsubscribeSchema,
  orchestrationWsPingSchema,
])

/**
 * Emitted once per subscription, after the snapshot or the catch-up replay and
 * before the first live delta. It is what lets a client distinguish "still
 * catching up" from "live": until it arrives, everything received is history.
 */
export const orchestrationStreamSynchronizedItemSchema = v.object({
  kind: v.literal('synchronized'),
  sequence: nonNegativeIntegerSchema,
})

export const orchestrationShellStreamFrameSchema = v.union([
  orchestrationShellStreamItemSchema,
  orchestrationStreamSynchronizedItemSchema,
])

export const orchestrationThreadStreamFrameSchema = v.union([
  orchestrationThreadStreamItemSchema,
  orchestrationStreamSynchronizedItemSchema,
])

export const orchestrationWsErrorSchema = v.object({
  code: v.optional(v.string()),
  message: v.string(),
  name: v.optional(v.string()),
  status: v.optional(nonNegativeIntegerSchema),
})

export const orchestrationWsServerConfigSchema = v.object({
  protocolVersion: nonNegativeIntegerSchema,
  serverVersion: trimmedNonEmptyStringSchema,
  /** New per process: a change means the server restarted and cursors are stale. */
  serverInstanceId: trimmedNonEmptyStringSchema,
  startedAt: isoDateTimeSchema,
  capabilities: v.object({
    resume: v.boolean(),
    synchronizedMarker: v.boolean(),
  }),
  limits: v.object({
    replayMaxEvents: nonNegativeIntegerSchema,
    resumeMaxGap: nonNegativeIntegerSchema,
  }),
})

/** Pushed by the server as the first frame on an authenticated connection. */
export const orchestrationWsConnectedMessageSchema = v.object({
  kind: v.literal('connected'),
  config: orchestrationWsServerConfigSchema,
})

export const orchestrationWsResponseMessageSchema = v.variant('ok', [
  v.object({
    kind: v.literal('response'),
    requestId: orchestrationWsRequestIdSchema,
    ok: v.literal(true),
    data: v.unknown(),
  }),
  v.object({
    kind: v.literal('response'),
    requestId: orchestrationWsRequestIdSchema,
    ok: v.literal(false),
    error: orchestrationWsErrorSchema,
  }),
])

export const orchestrationWsSubscriptionItemSchema = v.union([
  orchestrationShellStreamItemSchema,
  orchestrationThreadStreamItemSchema,
  orchestrationStreamSynchronizedItemSchema,
])

export const orchestrationWsSubscriptionNextMessageSchema = v.object({
  kind: v.literal('subscription.next'),
  subscriptionId: orchestrationWsSubscriptionIdSchema,
  item: orchestrationWsSubscriptionItemSchema,
})

export const orchestrationWsSubscriptionErrorMessageSchema = v.object({
  kind: v.literal('subscription.error'),
  subscriptionId: orchestrationWsSubscriptionIdSchema,
  error: orchestrationWsErrorSchema,
})

export const orchestrationWsSubscriptionCompleteMessageSchema = v.object({
  kind: v.literal('subscription.complete'),
  subscriptionId: orchestrationWsSubscriptionIdSchema,
})

export const orchestrationWsPongMessageSchema = v.object({
  kind: v.literal('pong'),
  requestId: orchestrationWsRequestIdSchema,
})

export const orchestrationWsServerMessageSchema = v.union([
  orchestrationWsConnectedMessageSchema,
  orchestrationWsResponseMessageSchema,
  orchestrationWsSubscriptionNextMessageSchema,
  orchestrationWsSubscriptionErrorMessageSchema,
  orchestrationWsSubscriptionCompleteMessageSchema,
  orchestrationWsPongMessageSchema,
])

export type OrchestrationStreamSynchronizedItem = v.InferOutput<
  typeof orchestrationStreamSynchronizedItemSchema
>
export type OrchestrationShellStreamFrame = v.InferOutput<
  typeof orchestrationShellStreamFrameSchema
>
export type OrchestrationThreadStreamFrame = v.InferOutput<
  typeof orchestrationThreadStreamFrameSchema
>
export type OrchestrationSearchThreadsInput = v.InferInput<
  typeof orchestrationSearchThreadsInputSchema
>
export type OrchestrationSearchThreadsResult = v.InferOutput<
  typeof orchestrationSearchThreadsResultSchema
>
export type OrchestrationThreadSearchMatch = v.InferOutput<
  typeof orchestrationThreadSearchMatchSchema
>
export type OrchestrationThreadSearchSource = v.InferOutput<
  typeof orchestrationThreadSearchSourceSchema
>
export type OrchestrationWsClientMessage = v.InferOutput<typeof orchestrationWsClientMessageSchema>
export type OrchestrationWsConnectedMessage = v.InferOutput<
  typeof orchestrationWsConnectedMessageSchema
>
export type OrchestrationWsError = v.InferOutput<typeof orchestrationWsErrorSchema>
export type OrchestrationWsReplayInput = v.InferOutput<typeof orchestrationWsReplayInputSchema>
export type OrchestrationWsThreadDetailPageInput = v.InferOutput<
  typeof orchestrationWsThreadDetailPageInputSchema
>
export type OrchestrationWsRequest = v.InferOutput<typeof orchestrationWsRequestSchema>
export type OrchestrationWsRequestId = v.InferOutput<typeof orchestrationWsRequestIdSchema>
export type OrchestrationWsResponseMessage = v.InferOutput<
  typeof orchestrationWsResponseMessageSchema
>
export type OrchestrationWsServerConfig = v.InferOutput<typeof orchestrationWsServerConfigSchema>
export type OrchestrationWsServerMessage = v.InferOutput<typeof orchestrationWsServerMessageSchema>
export type OrchestrationWsSubscribe = v.InferOutput<typeof orchestrationWsSubscribeSchema>
export type OrchestrationWsSubscriptionId = v.InferOutput<
  typeof orchestrationWsSubscriptionIdSchema
>
export type OrchestrationWsSubscriptionItem = v.InferOutput<
  typeof orchestrationWsSubscriptionItemSchema
>
