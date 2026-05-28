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
  chatAttachmentSchema,
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

export const projectCreateCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('project.create'),
  projectId: projectIdSchema,
  title: trimmedNonEmptyStringSchema,
  workspaceRoot: trimmedNonEmptyStringSchema,
  defaultModelSelection: v.optional(v.nullable(modelSelectionSchema), null),
  createdAt: isoDateTimeSchema,
})

export const projectMetaUpdateCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('project.meta.update'),
  projectId: projectIdSchema,
  title: v.optional(trimmedNonEmptyStringSchema),
  workspaceRoot: v.optional(trimmedNonEmptyStringSchema),
  defaultModelSelection: v.optional(v.nullable(modelSelectionSchema)),
  updatedAt: isoDateTimeSchema,
})

export const projectDeleteCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('project.delete'),
  projectId: projectIdSchema,
  deletedAt: isoDateTimeSchema,
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
  createdAt: isoDateTimeSchema,
})

export const threadTurnBootstrapCreateThreadSchema = v.object({
  projectId: projectIdSchema,
  title: trimmedNonEmptyStringSchema,
  modelSelection: modelSelectionSchema,
  runtimeMode: v.optional(runtimeModeSchema, DEFAULT_RUNTIME_MODE),
  interactionMode: v.optional(interactionModeSchema, DEFAULT_INTERACTION_MODE),
  branch: v.optional(v.nullable(trimmedNonEmptyStringSchema), null),
  worktreePath: v.optional(v.nullable(trimmedNonEmptyStringSchema), null),
  createdAt: isoDateTimeSchema,
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
  worktreePath: v.optional(v.nullable(trimmedNonEmptyStringSchema)),
  updatedAt: isoDateTimeSchema,
})

export const threadDeleteCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.delete'),
  threadId: threadIdSchema,
  deletedAt: isoDateTimeSchema,
})

export const threadArchiveCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.archive'),
  threadId: threadIdSchema,
  archivedAt: isoDateTimeSchema,
})

export const threadUnarchiveCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.unarchive'),
  threadId: threadIdSchema,
  updatedAt: isoDateTimeSchema,
})

export const threadRuntimeModeSetCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.runtime-mode.set'),
  threadId: threadIdSchema,
  runtimeMode: runtimeModeSchema,
  updatedAt: isoDateTimeSchema,
})

export const threadInteractionModeSetCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.interaction-mode.set'),
  threadId: threadIdSchema,
  interactionMode: interactionModeSchema,
  updatedAt: isoDateTimeSchema,
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
    attachments: v.optional(v.array(chatAttachmentSchema), []),
  }),
  modelSelection: v.optional(modelSelectionSchema),
  titleSeed: v.optional(trimmedNonEmptyStringSchema),
  runtimeMode: v.optional(runtimeModeSchema, DEFAULT_RUNTIME_MODE),
  interactionMode: v.optional(interactionModeSchema, DEFAULT_INTERACTION_MODE),
  sourceProposedPlan: v.optional(sourceProposedPlanReferenceSchema),
  bootstrap: v.optional(threadTurnBootstrapSchema),
  createdAt: isoDateTimeSchema,
})

export const threadTurnInterruptCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.turn.interrupt'),
  threadId: threadIdSchema,
  turnId: v.optional(turnIdSchema),
  createdAt: isoDateTimeSchema,
})

export const threadSessionStopCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.session.stop'),
  threadId: threadIdSchema,
  createdAt: isoDateTimeSchema,
})

export const threadApprovalRespondCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.approval.respond'),
  threadId: threadIdSchema,
  requestId: approvalRequestIdSchema,
  decision: providerApprovalDecisionSchema,
  createdAt: isoDateTimeSchema,
})

export const threadUserInputRespondCommandSchema = v.object({
  ...commandBaseSchema,
  type: v.literal('thread.user-input.respond'),
  threadId: threadIdSchema,
  requestId: approvalRequestIdSchema,
  answers: providerUserInputAnswersSchema,
  createdAt: isoDateTimeSchema,
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
export type ClientOrchestrationCommand = v.InferOutput<typeof clientOrchestrationCommandSchema>
export type InternalOrchestrationCommand = v.InferOutput<typeof internalOrchestrationCommandSchema>
export type OrchestrationCommand = v.InferOutput<typeof orchestrationCommandSchema>
