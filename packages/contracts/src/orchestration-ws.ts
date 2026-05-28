import * as v from 'valibot'
import { threadIdSchema } from './chat-ids'
import { nonNegativeIntegerSchema, trimmedNonEmptyStringSchema } from './chat-model'
import { clientOrchestrationCommandSchema } from './orchestration-commands'
import {
  orchestrationReplayEventsInputSchema,
  orchestrationShellStreamItemSchema,
  orchestrationThreadStreamItemSchema,
} from './orchestration-snapshots'

export const orchestrationWsRequestIdSchema = trimmedNonEmptyStringSchema
export const orchestrationWsSubscriptionIdSchema = trimmedNonEmptyStringSchema

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
    method: v.literal('replayEvents'),
    input: orchestrationReplayEventsInputSchema,
  }),
])

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

export const orchestrationWsErrorSchema = v.object({
  code: v.optional(v.string()),
  message: v.string(),
  name: v.optional(v.string()),
  status: v.optional(nonNegativeIntegerSchema),
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
  orchestrationWsResponseMessageSchema,
  orchestrationWsSubscriptionNextMessageSchema,
  orchestrationWsSubscriptionErrorMessageSchema,
  orchestrationWsSubscriptionCompleteMessageSchema,
  orchestrationWsPongMessageSchema,
])

export type OrchestrationWsClientMessage = v.InferOutput<typeof orchestrationWsClientMessageSchema>
export type OrchestrationWsError = v.InferOutput<typeof orchestrationWsErrorSchema>
export type OrchestrationWsRequest = v.InferOutput<typeof orchestrationWsRequestSchema>
export type OrchestrationWsRequestId = v.InferOutput<typeof orchestrationWsRequestIdSchema>
export type OrchestrationWsResponseMessage = v.InferOutput<
  typeof orchestrationWsResponseMessageSchema
>
export type OrchestrationWsServerMessage = v.InferOutput<typeof orchestrationWsServerMessageSchema>
export type OrchestrationWsSubscribe = v.InferOutput<typeof orchestrationWsSubscribeSchema>
export type OrchestrationWsSubscriptionId = v.InferOutput<
  typeof orchestrationWsSubscriptionIdSchema
>
export type OrchestrationWsSubscriptionItem = v.InferOutput<
  typeof orchestrationWsSubscriptionItemSchema
>
