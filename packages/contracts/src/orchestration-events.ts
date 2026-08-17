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
  chatAttachmentsSchema,
  isoDateTimeSchema,
  nonNegativeIntegerSchema,
  orchestrationCheckpointFileSchema,
  orchestrationCheckpointStatusSchema,
  orchestrationMessageRoleSchema,
  orchestrationProjectScriptSchema,
  orchestrationProposedPlanSchema,
  orchestrationSessionSchema,
  orchestrationThreadActivitySchema,
  orderKeySchema,
  sourceProposedPlanReferenceSchema,
  threadLifecycleReasonSchema,
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
  // Absent means "unchanged", an empty array means "the user removed them all".
  // Collapsing the two would make clearing the list impossible.
  scripts: v.optional(v.array(orchestrationProjectScriptSchema)),
  updatedAt: isoDateTimeSchema,
})

/**
 * A reorder carries no `updatedAt`: arranging the list is a view placement, not
 * an edit of the project, and bumping the row's timestamp would churn every
 * ordering that reads `updatedAt`. Re-sending the same key is therefore a
 * natural no-op.
 */
export const projectReorderedPayloadSchema = v.object({
  projectId: projectIdSchema,
  orderKey: orderKeySchema,
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
  /**
   * The thread asked to run in a checkout of its own. A fact about how it was
   * created, not projected state — the worktree that answers it arrives later
   * as a `thread.meta-updated` carrying the real path.
   */
  requestWorktree: v.optional(v.boolean(), false),
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

export const threadSettledPayloadSchema = v.object({
  threadId: threadIdSchema,
  settledAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export const threadUnsettledPayloadSchema = v.object({
  threadId: threadIdSchema,
  reason: threadLifecycleReasonSchema,
  updatedAt: isoDateTimeSchema,
})

export const threadSnoozedPayloadSchema = v.object({
  threadId: threadIdSchema,
  snoozedUntil: isoDateTimeSchema,
  snoozedAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export const threadUnsnoozedPayloadSchema = v.object({
  threadId: threadIdSchema,
  reason: threadLifecycleReasonSchema,
  updatedAt: isoDateTimeSchema,
})

export const threadPinnedPayloadSchema = v.object({
  threadId: threadIdSchema,
  pinnedAt: isoDateTimeSchema,
  // Absent when re-pinning an already-pinned thread — the key the user already
  // placed wins over a raced duplicate — and when the pin carried no slot.
  pinOrderKey: v.optional(orderKeySchema),
  updatedAt: isoDateTimeSchema,
})

export const threadUnpinnedPayloadSchema = v.object({
  threadId: threadIdSchema,
  updatedAt: isoDateTimeSchema,
})

export const threadPinReorderedPayloadSchema = v.object({
  threadId: threadIdSchema,
  orderKey: orderKeySchema,
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
  attachments: v.optional(chatAttachmentsSchema, []),
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

export const threadCheckpointRevertRequestedPayloadSchema = v.object({
  threadId: threadIdSchema,
  turnCount: nonNegativeIntegerSchema,
  createdAt: isoDateTimeSchema,
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

/**
 * The event catalog: one row per orchestration event, mapping the wire `type` to
 * the schema its `payload` must satisfy.
 *
 * This record is the only hand-written list. The parser variant below and the
 * `OrchestrationEventType` union are both derived from it, so an event cannot
 * half-exist — there is no state where a type is nameable but unparseable, or
 * parseable but absent from the union. Adding an event is a payload schema plus
 * one row here.
 *
 * The order below is the order the catalog has always been read in (project
 * lifecycle, thread lifecycle, then turn traffic). valibot dispatches on the
 * discriminator, not on position, so the order is documentation — but do not
 * alphabetise it.
 */
export const ORCHESTRATION_EVENT_PAYLOADS = {
  'project.created': projectCreatedPayloadSchema,
  'project.meta-updated': projectMetaUpdatedPayloadSchema,
  'project.reordered': projectReorderedPayloadSchema,
  'project.deleted': projectDeletedPayloadSchema,
  'thread.created': threadCreatedPayloadSchema,
  'thread.meta-updated': threadMetaUpdatedPayloadSchema,
  'thread.deleted': threadDeletedPayloadSchema,
  'thread.archived': threadArchivedPayloadSchema,
  'thread.unarchived': threadUnarchivedPayloadSchema,
  'thread.settled': threadSettledPayloadSchema,
  'thread.unsettled': threadUnsettledPayloadSchema,
  'thread.snoozed': threadSnoozedPayloadSchema,
  'thread.unsnoozed': threadUnsnoozedPayloadSchema,
  'thread.pinned': threadPinnedPayloadSchema,
  'thread.unpinned': threadUnpinnedPayloadSchema,
  'thread.pin-reordered': threadPinReorderedPayloadSchema,
  'thread.runtime-mode-set': threadRuntimeModeSetPayloadSchema,
  'thread.interaction-mode-set': threadInteractionModeSetPayloadSchema,
  'thread.message-sent': threadMessageSentPayloadSchema,
  'thread.turn-start-requested': threadTurnStartRequestedPayloadSchema,
  'thread.turn-interrupt-requested': threadTurnInterruptRequestedPayloadSchema,
  'thread.session-stop-requested': threadSessionStopRequestedPayloadSchema,
  'thread.session-set': threadSessionSetPayloadSchema,
  'thread.activity-appended': threadActivityAppendedPayloadSchema,
  'thread.proposed-plan-upserted': threadProposedPlanUpsertedPayloadSchema,
  'thread.turn-diff-completed': threadTurnDiffCompletedPayloadSchema,
  'thread.checkpoint-revert-requested': threadCheckpointRevertRequestedPayloadSchema,
  'thread.reverted': threadRevertedPayloadSchema,
  'thread.approval-response-requested': threadApprovalResponseRequestedPayloadSchema,
  'thread.user-input-response-requested': threadUserInputResponseRequestedPayloadSchema,
}

export type OrchestrationEventType = keyof typeof ORCHESTRATION_EVENT_PAYLOADS

/**
 * One variant member. Generic on purpose: instantiated with a single literal
 * type it returns the exact `ObjectSchema` for that event, which is what
 * `OrchestrationEventVariantOption` maps over to rebuild the discriminated union.
 */
const eventVariantOption = <TType extends OrchestrationEventType>(
  type: TType,
  payload: (typeof ORCHESTRATION_EVENT_PAYLOADS)[TType],
) => v.object({ ...eventBaseSchema, type: v.literal(type), payload })

type OrchestrationEventVariantOption = {
  [TType in OrchestrationEventType]: ReturnType<typeof eventVariantOption<TType>>
}[OrchestrationEventType]

/**
 * `Object.entries` erases the key→payload correlation — it hands back
 * `[string, <union of every payload schema>]` — so rebuilding the discriminated
 * union costs exactly one assertion. The three type-derivation gates at the top
 * of `tests/orchestration.test.ts` are what keep it honest: they stop compiling
 * the moment `OrchestrationEvent` widens or decorrelates.
 */
const orchestrationEventVariantOptions = Object.entries(ORCHESTRATION_EVENT_PAYLOADS).map(
  ([type, payload]) => eventVariantOption(type as OrchestrationEventType, payload),
) as OrchestrationEventVariantOption[]

export const orchestrationEventSchema = v.variant('type', orchestrationEventVariantOptions)

export type OrchestrationAggregateKind = v.InferOutput<typeof orchestrationAggregateKindSchema>
export type OrchestrationActorKind = v.InferOutput<typeof orchestrationActorKindSchema>
export type ProjectCreatedPayload = v.InferOutput<typeof projectCreatedPayloadSchema>
export type ThreadCreatedPayload = v.InferOutput<typeof threadCreatedPayloadSchema>
export type OrchestrationEventMetadata = v.InferOutput<typeof orchestrationEventMetadataSchema>
export type OrchestrationEvent = v.InferOutput<typeof orchestrationEventSchema>
