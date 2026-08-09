import * as v from 'valibot'
import {
  approvalRequestIdSchema,
  commandIdSchema,
  messageIdSchema,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
} from './chat-ids'
import {
  chatAttachmentUploadsSchema,
  isoDateTimeSchema,
  nonNegativeIntegerSchema,
  orchestrationCheckpointFileSchema,
  orchestrationCheckpointStatusSchema,
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

const commandBaseSchema = {
  commandId: commandIdSchema,
} as const

/**
 * Client commands carry no timestamps: the server clock stamps `occurredAt` and
 * every projected `createdAt`/`updatedAt`/`deletedAt`/`archivedAt`. A skewed or
 * hostile client must not be able to place an event in the past or the future.
 * Internal (provider-runtime) commands below still carry the provider's own
 * event time, which is already a server clock reading.
 */
export const projectCreateCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('project.create'),
  projectId: projectIdSchema,
  title: trimmedNonEmptyStringSchema,
  workspaceRoot: trimmedNonEmptyStringSchema,
  defaultModelSelection: v.optional(v.nullable(modelSelectionSchema), null),
})

export const projectMetaUpdateCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('project.meta.update'),
  projectId: projectIdSchema,
  title: v.optional(trimmedNonEmptyStringSchema),
  workspaceRoot: v.optional(trimmedNonEmptyStringSchema),
  defaultModelSelection: v.optional(v.nullable(modelSelectionSchema)),
})

export const projectDeleteCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('project.delete'),
  projectId: projectIdSchema,
  // Deleting a project cascades to its threads, so a project that still has
  // live threads needs an explicit opt-in rather than a silent mass delete.
  force: v.optional(v.boolean(), false),
})

export const threadCreateCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.create'),
  threadId: threadIdSchema,
  projectId: projectIdSchema,
  title: trimmedNonEmptyStringSchema,
  modelSelection: modelSelectionSchema,
  runtimeMode: v.optional(runtimeModeSchema, DEFAULT_RUNTIME_MODE),
  interactionMode: v.optional(interactionModeSchema, DEFAULT_INTERACTION_MODE),
  branch: v.optional(v.nullable(trimmedNonEmptyStringSchema), null),
  worktreePath: v.optional(v.nullable(trimmedNonEmptyStringSchema), null),
})

export const threadTurnBootstrapCreateThreadSchema = v.object({
  projectId: projectIdSchema,
  title: trimmedNonEmptyStringSchema,
  modelSelection: modelSelectionSchema,
  runtimeMode: v.optional(runtimeModeSchema, DEFAULT_RUNTIME_MODE),
  interactionMode: v.optional(interactionModeSchema, DEFAULT_INTERACTION_MODE),
  branch: v.optional(v.nullable(trimmedNonEmptyStringSchema), null),
  worktreePath: v.optional(v.nullable(trimmedNonEmptyStringSchema), null),
})

export const threadTurnBootstrapSchema = v.object({
  createThread: v.optional(threadTurnBootstrapCreateThreadSchema),
})

export const threadMetaUpdateCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.meta.update'),
  threadId: threadIdSchema,
  title: v.optional(trimmedNonEmptyStringSchema),
  modelSelection: v.optional(modelSelectionSchema),
  branch: v.optional(v.nullable(trimmedNonEmptyStringSchema)),
  // Compare-and-swap guard: when present, the update only applies if the thread
  // still sits on this branch. Two clients editing the same thread from stale
  // snapshots would otherwise silently clobber each other's branch.
  expectedBranch: v.optional(v.nullable(trimmedNonEmptyStringSchema)),
  worktreePath: v.optional(v.nullable(trimmedNonEmptyStringSchema)),
})

export const threadDeleteCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.delete'),
  threadId: threadIdSchema,
})

export const threadArchiveCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.archive'),
  threadId: threadIdSchema,
})

export const threadUnarchiveCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.unarchive'),
  threadId: threadIdSchema,
})

export const threadRuntimeModeSetCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.runtime-mode.set'),
  threadId: threadIdSchema,
  runtimeMode: runtimeModeSchema,
})

export const threadInteractionModeSetCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.interaction-mode.set'),
  threadId: threadIdSchema,
  interactionMode: interactionModeSchema,
})

export const threadTurnStartCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.turn.start'),
  threadId: threadIdSchema,
  turnId: turnIdSchema,
  message: v.object({
    messageId: messageIdSchema,
    role: v.literal('user'),
    text: v.string(),
    attachments: v.optional(chatAttachmentUploadsSchema, []),
  }),
  modelSelection: v.optional(modelSelectionSchema),
  titleSeed: v.optional(trimmedNonEmptyStringSchema),
  runtimeMode: v.optional(runtimeModeSchema, DEFAULT_RUNTIME_MODE),
  interactionMode: v.optional(interactionModeSchema, DEFAULT_INTERACTION_MODE),
  sourceProposedPlan: v.optional(sourceProposedPlanReferenceSchema),
  bootstrap: v.optional(threadTurnBootstrapSchema),
})

export const threadTurnInterruptCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.turn.interrupt'),
  threadId: threadIdSchema,
  turnId: v.optional(turnIdSchema),
})

export const threadSessionStopCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.session.stop'),
  threadId: threadIdSchema,
})

export const threadApprovalRespondCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.approval.respond'),
  threadId: threadIdSchema,
  requestId: approvalRequestIdSchema,
  decision: providerApprovalDecisionSchema,
})

export const threadUserInputRespondCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.user-input.respond'),
  threadId: threadIdSchema,
  requestId: approvalRequestIdSchema,
  answers: providerUserInputAnswersSchema,
})

export const threadCheckpointRevertCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.checkpoint.revert'),
  threadId: threadIdSchema,
  turnCount: nonNegativeIntegerSchema,
})

export const clientOrchestrationCommandSchema = v.variant('type', [
  projectCreateCommandSchema,
  projectMetaUpdateCommandSchema,
  projectDeleteCommandSchema,
  threadCreateCommandSchema,
  threadMetaUpdateCommandSchema,
  threadDeleteCommandSchema,
  threadArchiveCommandSchema,
  threadUnarchiveCommandSchema,
  threadRuntimeModeSetCommandSchema,
  threadInteractionModeSetCommandSchema,
  threadTurnStartCommandSchema,
  threadTurnInterruptCommandSchema,
  threadSessionStopCommandSchema,
  threadApprovalRespondCommandSchema,
  threadUserInputRespondCommandSchema,
  threadCheckpointRevertCommandSchema,
])

export const threadSessionSetCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.session.set'),
  threadId: threadIdSchema,
  session: orchestrationSessionSchema,
  createdAt: isoDateTimeSchema,
})

export const threadMessageAssistantDeltaCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.message.assistant.delta'),
  threadId: threadIdSchema,
  messageId: messageIdSchema,
  delta: v.string(),
  turnId: v.optional(turnIdSchema),
  createdAt: isoDateTimeSchema,
})

export const threadMessageAssistantCompleteCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.message.assistant.complete'),
  threadId: threadIdSchema,
  messageId: messageIdSchema,
  turnId: v.optional(turnIdSchema),
  completedAt: isoDateTimeSchema,
})

export const threadActivityAppendCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.activity.append'),
  threadId: threadIdSchema,
  activity: orchestrationThreadActivitySchema,
  createdAt: isoDateTimeSchema,
})

export const threadProposedPlanUpsertCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.proposed-plan.upsert'),
  threadId: threadIdSchema,
  proposedPlan: orchestrationProposedPlanSchema,
  createdAt: isoDateTimeSchema,
})

export const threadTurnDiffCompleteCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.turn.diff.complete'),
  threadId: threadIdSchema,
  turnId: turnIdSchema,
  completedAt: isoDateTimeSchema,
  checkpointRef: trimmedNonEmptyStringSchema,
  status: orchestrationCheckpointStatusSchema,
  files: v.array(orchestrationCheckpointFileSchema),
  assistantMessageId: v.optional(messageIdSchema),
  checkpointTurnCount: nonNegativeIntegerSchema,
  createdAt: isoDateTimeSchema,
})

export const threadRevertCompleteCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.revert.complete'),
  threadId: threadIdSchema,
  turnCount: nonNegativeIntegerSchema,
  createdAt: isoDateTimeSchema,
})

export const internalOrchestrationCommandSchema = v.variant('type', [
  threadSessionSetCommandSchema,
  threadMessageAssistantDeltaCommandSchema,
  threadMessageAssistantCompleteCommandSchema,
  threadActivityAppendCommandSchema,
  threadProposedPlanUpsertCommandSchema,
  threadTurnDiffCompleteCommandSchema,
  threadRevertCompleteCommandSchema,
])

export const orchestrationCommandSchema = v.variant('type', [
  ...clientOrchestrationCommandSchema.options,
  ...internalOrchestrationCommandSchema.options,
])

export type ProjectCreateCommand = v.InferOutput<typeof projectCreateCommandSchema>
export type ProjectMetaUpdateCommand = v.InferOutput<typeof projectMetaUpdateCommandSchema>
export type ProjectDeleteCommand = v.InferOutput<typeof projectDeleteCommandSchema>
export type ThreadCreateCommand = v.InferOutput<typeof threadCreateCommandSchema>
export type ThreadTurnBootstrapCreateThread = v.InferOutput<
  typeof threadTurnBootstrapCreateThreadSchema
>
export type ThreadTurnBootstrap = v.InferOutput<typeof threadTurnBootstrapSchema>
export type ThreadMetaUpdateCommand = v.InferOutput<typeof threadMetaUpdateCommandSchema>
export type ThreadDeleteCommand = v.InferOutput<typeof threadDeleteCommandSchema>
export type ThreadArchiveCommand = v.InferOutput<typeof threadArchiveCommandSchema>
export type ThreadUnarchiveCommand = v.InferOutput<typeof threadUnarchiveCommandSchema>
export type ThreadRuntimeModeSetCommand = v.InferOutput<typeof threadRuntimeModeSetCommandSchema>
export type ThreadInteractionModeSetCommand = v.InferOutput<
  typeof threadInteractionModeSetCommandSchema
>
export type ThreadTurnStartCommand = v.InferOutput<typeof threadTurnStartCommandSchema>
export type ThreadTurnInterruptCommand = v.InferOutput<typeof threadTurnInterruptCommandSchema>
export type ThreadSessionStopCommand = v.InferOutput<typeof threadSessionStopCommandSchema>
export type ThreadApprovalRespondCommand = v.InferOutput<typeof threadApprovalRespondCommandSchema>
export type ThreadUserInputRespondCommand = v.InferOutput<
  typeof threadUserInputRespondCommandSchema
>
export type ThreadCheckpointRevertCommand = v.InferOutput<
  typeof threadCheckpointRevertCommandSchema
>
export type ClientOrchestrationCommand = v.InferOutput<typeof clientOrchestrationCommandSchema>
export type InternalOrchestrationCommand = v.InferOutput<typeof internalOrchestrationCommandSchema>
export type OrchestrationCommand = v.InferOutput<typeof orchestrationCommandSchema>
