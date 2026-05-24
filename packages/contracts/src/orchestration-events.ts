import * as v from 'valibot'
import {
  approvalRequestIdSchema,
  commandIdSchema,
  eventIdSchema,
  messageIdSchema,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
} from './chat-ids'
import {
  chatAttachmentSchema,
  isoDateTimeSchema,
  nonNegativeIntegerSchema,
  orchestrationCheckpointFileSchema,
  orchestrationCheckpointStatusSchema,
  orchestrationMessageRoleSchema,
  orchestrationProposedPlanSchema,
  orchestrationSessionSchema,
  orchestrationThreadActivitySchema,
  sourceProposedPlanReferenceSchema,
  trimmedNonEmptyStringSchema,
} from './chat-model'
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  interactionModeSchema,
  modelSelectionSchema,
  providerApprovalDecisionSchema,
  providerUserInputAnswersSchema,
  runtimeModeSchema,
} from './orchestration-runtime'

export const orchestrationEventTypes = [
  'project.created',
  'project.meta-updated',
  'project.deleted',
  'thread.created',
  'thread.meta-updated',
  'thread.deleted',
  'thread.archived',
  'thread.unarchived',
  'thread.runtime-mode-set',
  'thread.interaction-mode-set',
  'thread.message-sent',
  'thread.turn-start-requested',
  'thread.turn-interrupt-requested',
  'thread.session-stop-requested',
  'thread.session-set',
  'thread.activity-appended',
  'thread.proposed-plan-upserted',
  'thread.turn-diff-completed',
  'thread.reverted',
  'thread.approval-response-requested',
  'thread.user-input-response-requested',
] as const

export const orchestrationEventTypeSchema = v.picklist(orchestrationEventTypes)
export const orchestrationAggregateKindSchema = v.picklist(['project', 'thread'])
export const orchestrationActorKindSchema = v.picklist(['client', 'server', 'provider'])

export const projectCreatedPayloadSchema = v.object({
  projectId: projectIdSchema,
  title: trimmedNonEmptyStringSchema,
  workspaceRoot: trimmedNonEmptyStringSchema,
  defaultModelSelection: v.nullable(modelSelectionSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export const projectMetaUpdatedPayloadSchema = v.object({
  projectId: projectIdSchema,
  title: v.optional(trimmedNonEmptyStringSchema),
  workspaceRoot: v.optional(trimmedNonEmptyStringSchema),
  defaultModelSelection: v.optional(v.nullable(modelSelectionSchema)),
  updatedAt: isoDateTimeSchema,
})

export const projectDeletedPayloadSchema = v.object({
  projectId: projectIdSchema,
  deletedAt: isoDateTimeSchema,
})

export const threadCreatedPayloadSchema = v.object({
  threadId: threadIdSchema,
  projectId: projectIdSchema,
  title: trimmedNonEmptyStringSchema,
  modelSelection: modelSelectionSchema,
  runtimeMode: v.optional(runtimeModeSchema, DEFAULT_RUNTIME_MODE),
  interactionMode: v.optional(interactionModeSchema, DEFAULT_INTERACTION_MODE),
  branch: v.nullable(trimmedNonEmptyStringSchema),
  worktreePath: v.nullable(trimmedNonEmptyStringSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export const threadMetaUpdatedPayloadSchema = v.object({
  threadId: threadIdSchema,
  title: v.optional(trimmedNonEmptyStringSchema),
  modelSelection: v.optional(modelSelectionSchema),
  branch: v.optional(v.nullable(trimmedNonEmptyStringSchema)),
  worktreePath: v.optional(v.nullable(trimmedNonEmptyStringSchema)),
  updatedAt: isoDateTimeSchema,
})

export const threadDeletedPayloadSchema = v.object({
  threadId: threadIdSchema,
  deletedAt: isoDateTimeSchema,
})

export const threadArchivedPayloadSchema = v.object({
  threadId: threadIdSchema,
  archivedAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export const threadUnarchivedPayloadSchema = v.object({
  threadId: threadIdSchema,
  updatedAt: isoDateTimeSchema,
})

export const threadRuntimeModeSetPayloadSchema = v.object({
  threadId: threadIdSchema,
  runtimeMode: runtimeModeSchema,
  updatedAt: isoDateTimeSchema,
})

export const threadInteractionModeSetPayloadSchema = v.object({
  threadId: threadIdSchema,
  interactionMode: v.optional(interactionModeSchema, DEFAULT_INTERACTION_MODE),
  updatedAt: isoDateTimeSchema,
})

export const threadMessageSentPayloadSchema = v.object({
  threadId: threadIdSchema,
  messageId: messageIdSchema,
  role: orchestrationMessageRoleSchema,
  text: v.string(),
  attachments: v.optional(v.array(chatAttachmentSchema), []),
  turnId: v.nullable(turnIdSchema),
  streaming: v.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export const threadTurnStartRequestedPayloadSchema = v.object({
  threadId: threadIdSchema,
  turnId: turnIdSchema,
  messageId: messageIdSchema,
  modelSelection: v.optional(modelSelectionSchema),
  titleSeed: v.optional(trimmedNonEmptyStringSchema),
  runtimeMode: v.optional(runtimeModeSchema, DEFAULT_RUNTIME_MODE),
  interactionMode: v.optional(interactionModeSchema, DEFAULT_INTERACTION_MODE),
  sourceProposedPlan: v.optional(sourceProposedPlanReferenceSchema),
  createdAt: isoDateTimeSchema,
})

export const threadTurnInterruptRequestedPayloadSchema = v.object({
  threadId: threadIdSchema,
  turnId: v.optional(turnIdSchema),
  createdAt: isoDateTimeSchema,
})

export const threadSessionStopRequestedPayloadSchema = v.object({
  threadId: threadIdSchema,
  createdAt: isoDateTimeSchema,
})

export const threadSessionSetPayloadSchema = v.object({
  threadId: threadIdSchema,
  session: orchestrationSessionSchema,
})

export const threadActivityAppendedPayloadSchema = v.object({
  threadId: threadIdSchema,
  activity: orchestrationThreadActivitySchema,
})

export const threadProposedPlanUpsertedPayloadSchema = v.object({
  threadId: threadIdSchema,
  proposedPlan: orchestrationProposedPlanSchema,
})

export const threadTurnDiffCompletedPayloadSchema = v.object({
  threadId: threadIdSchema,
  turnId: turnIdSchema,
  checkpointTurnCount: nonNegativeIntegerSchema,
  checkpointRef: trimmedNonEmptyStringSchema,
  status: orchestrationCheckpointStatusSchema,
  files: v.array(orchestrationCheckpointFileSchema),
  assistantMessageId: v.nullable(messageIdSchema),
  completedAt: isoDateTimeSchema,
})

export const threadRevertedPayloadSchema = v.object({
  threadId: threadIdSchema,
  turnCount: nonNegativeIntegerSchema,
  revertedAt: isoDateTimeSchema,
})

export const threadApprovalResponseRequestedPayloadSchema = v.object({
  threadId: threadIdSchema,
  requestId: approvalRequestIdSchema,
  decision: providerApprovalDecisionSchema,
  createdAt: isoDateTimeSchema,
})

export const threadUserInputResponseRequestedPayloadSchema = v.object({
  threadId: threadIdSchema,
  requestId: approvalRequestIdSchema,
  answers: providerUserInputAnswersSchema,
  createdAt: isoDateTimeSchema,
})

export const orchestrationEventMetadataSchema = v.object({
  providerTurnId: v.optional(trimmedNonEmptyStringSchema),
  providerItemId: v.optional(trimmedNonEmptyStringSchema),
  adapterKey: v.optional(trimmedNonEmptyStringSchema),
  requestId: v.optional(approvalRequestIdSchema),
  ingestedAt: v.optional(isoDateTimeSchema),
})

const eventBaseSchema = {
  sequence: nonNegativeIntegerSchema,
  eventId: eventIdSchema,
  aggregateKind: orchestrationAggregateKindSchema,
  aggregateId: v.union([projectIdSchema, threadIdSchema]),
  occurredAt: isoDateTimeSchema,
  commandId: v.nullable(commandIdSchema),
  causationEventId: v.nullable(eventIdSchema),
  correlationId: v.nullable(commandIdSchema),
  actorKind: orchestrationActorKindSchema,
  metadata: orchestrationEventMetadataSchema,
} as const

export const orchestrationEventSchema = v.variant('type', [
  v.object({
    ...eventBaseSchema,
    type: v.literal('project.created'),
    payload: projectCreatedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('project.meta-updated'),
    payload: projectMetaUpdatedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('project.deleted'),
    payload: projectDeletedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.created'),
    payload: threadCreatedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.meta-updated'),
    payload: threadMetaUpdatedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.deleted'),
    payload: threadDeletedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.archived'),
    payload: threadArchivedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.unarchived'),
    payload: threadUnarchivedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.runtime-mode-set'),
    payload: threadRuntimeModeSetPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.interaction-mode-set'),
    payload: threadInteractionModeSetPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.message-sent'),
    payload: threadMessageSentPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.turn-start-requested'),
    payload: threadTurnStartRequestedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.turn-interrupt-requested'),
    payload: threadTurnInterruptRequestedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.session-stop-requested'),
    payload: threadSessionStopRequestedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.session-set'),
    payload: threadSessionSetPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.activity-appended'),
    payload: threadActivityAppendedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.proposed-plan-upserted'),
    payload: threadProposedPlanUpsertedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.turn-diff-completed'),
    payload: threadTurnDiffCompletedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.reverted'),
    payload: threadRevertedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.approval-response-requested'),
    payload: threadApprovalResponseRequestedPayloadSchema,
  }),
  v.object({
    ...eventBaseSchema,
    type: v.literal('thread.user-input-response-requested'),
    payload: threadUserInputResponseRequestedPayloadSchema,
  }),
])

export type OrchestrationEventType = v.InferOutput<typeof orchestrationEventTypeSchema>
export type OrchestrationAggregateKind = v.InferOutput<typeof orchestrationAggregateKindSchema>
export type OrchestrationActorKind = v.InferOutput<typeof orchestrationActorKindSchema>
export type ProjectCreatedPayload = v.InferOutput<typeof projectCreatedPayloadSchema>
export type ThreadCreatedPayload = v.InferOutput<typeof threadCreatedPayloadSchema>
export type OrchestrationEventMetadata = v.InferOutput<typeof orchestrationEventMetadataSchema>
export type OrchestrationEvent = v.InferOutput<typeof orchestrationEventSchema>
