import * as v from 'valibot'
import {
  eventIdSchema,
  messageIdSchema,
  projectIdSchema,
  proposedPlanIdSchema,
  providerInstanceIdSchema,
  threadIdSchema,
  turnIdSchema,
} from './chat-ids'
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  interactionModeSchema,
  modelSelectionSchema,
  runtimeModeSchema,
} from './orchestration-runtime'

export const isoDateTimeSchema = v.string()
export const nonNegativeIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(0))
export const trimmedNonEmptyStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1))

export const chatAttachmentSchema = v.object({
  type: v.literal('image'),
  id: trimmedNonEmptyStringSchema,
  name: trimmedNonEmptyStringSchema,
  mimeType: v.pipe(v.string(), v.regex(/^image\//i)),
  sizeBytes: nonNegativeIntegerSchema,
})

export const orchestrationProjectSchema = v.object({
  id: projectIdSchema,
  title: trimmedNonEmptyStringSchema,
  workspaceRoot: trimmedNonEmptyStringSchema,
  defaultModelSelection: v.nullable(modelSelectionSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: v.nullable(isoDateTimeSchema),
})

export const orchestrationMessageRoleSchema = v.picklist(['user', 'assistant', 'system'])

export const orchestrationMessageSchema = v.object({
  id: messageIdSchema,
  threadId: threadIdSchema,
  role: orchestrationMessageRoleSchema,
  text: v.string(),
  attachments: v.optional(v.array(chatAttachmentSchema), []),
  turnId: v.nullable(turnIdSchema),
  streaming: v.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export const orchestrationThreadActivityToneSchema = v.picklist([
  'info',
  'tool',
  'approval',
  'error',
])

export const orchestrationThreadActivitySchema = v.object({
  id: eventIdSchema,
  threadId: threadIdSchema,
  tone: orchestrationThreadActivityToneSchema,
  kind: trimmedNonEmptyStringSchema,
  summary: trimmedNonEmptyStringSchema,
  payload: v.unknown(),
  turnId: v.nullable(turnIdSchema),
  sequence: v.optional(nonNegativeIntegerSchema),
  createdAt: isoDateTimeSchema,
})

export const orchestrationProposedPlanSchema = v.object({
  id: proposedPlanIdSchema,
  threadId: threadIdSchema,
  turnId: v.nullable(turnIdSchema),
  planMarkdown: trimmedNonEmptyStringSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export const orchestrationSessionStatusSchema = v.picklist([
  'idle',
  'starting',
  'running',
  'ready',
  'interrupted',
  'stopped',
  'error',
])

export const orchestrationSessionSchema = v.object({
  threadId: threadIdSchema,
  status: orchestrationSessionStatusSchema,
  providerName: v.nullable(trimmedNonEmptyStringSchema),
  providerInstanceId: v.optional(providerInstanceIdSchema),
  providerSessionId: v.nullable(trimmedNonEmptyStringSchema),
  runtimeMode: v.optional(runtimeModeSchema, DEFAULT_RUNTIME_MODE),
  activeTurnId: v.nullable(turnIdSchema),
  lastError: v.nullable(trimmedNonEmptyStringSchema),
  updatedAt: isoDateTimeSchema,
})

export const orchestrationLatestTurnStateSchema = v.picklist([
  'running',
  'interrupted',
  'completed',
  'error',
])

export const sourceProposedPlanReferenceSchema = v.object({
  threadId: threadIdSchema,
  planId: proposedPlanIdSchema,
})

export const orchestrationLatestTurnSchema = v.object({
  turnId: turnIdSchema,
  state: orchestrationLatestTurnStateSchema,
  requestedAt: isoDateTimeSchema,
  startedAt: v.nullable(isoDateTimeSchema),
  completedAt: v.nullable(isoDateTimeSchema),
  assistantMessageId: v.nullable(messageIdSchema),
  sourceProposedPlan: v.optional(sourceProposedPlanReferenceSchema),
})

export const orchestrationCheckpointStatusSchema = v.picklist(['ready', 'missing', 'error'])

export const orchestrationCheckpointFileSchema = v.object({
  path: trimmedNonEmptyStringSchema,
  kind: trimmedNonEmptyStringSchema,
  additions: nonNegativeIntegerSchema,
  deletions: nonNegativeIntegerSchema,
})

export const orchestrationThreadSchema = v.object({
  id: threadIdSchema,
  projectId: projectIdSchema,
  title: trimmedNonEmptyStringSchema,
  modelSelection: modelSelectionSchema,
  runtimeMode: v.optional(runtimeModeSchema, DEFAULT_RUNTIME_MODE),
  interactionMode: v.optional(interactionModeSchema, DEFAULT_INTERACTION_MODE),
  branch: v.nullable(trimmedNonEmptyStringSchema),
  worktreePath: v.nullable(trimmedNonEmptyStringSchema),
  latestTurn: v.nullable(orchestrationLatestTurnSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  archivedAt: v.nullable(isoDateTimeSchema),
  deletedAt: v.nullable(isoDateTimeSchema),
  messages: v.array(orchestrationMessageSchema),
  activities: v.array(orchestrationThreadActivitySchema),
  session: v.nullable(orchestrationSessionSchema),
})

export type IsoDateTime = v.InferOutput<typeof isoDateTimeSchema>
export type ChatAttachment = v.InferOutput<typeof chatAttachmentSchema>
export type OrchestrationProject = v.InferOutput<typeof orchestrationProjectSchema>
export type OrchestrationMessageRole = v.InferOutput<typeof orchestrationMessageRoleSchema>
export type OrchestrationMessage = v.InferOutput<typeof orchestrationMessageSchema>
export type OrchestrationThreadActivityTone = v.InferOutput<
  typeof orchestrationThreadActivityToneSchema
>
export type OrchestrationThreadActivity = v.InferOutput<typeof orchestrationThreadActivitySchema>
export type OrchestrationProposedPlan = v.InferOutput<typeof orchestrationProposedPlanSchema>
export type OrchestrationSessionStatus = v.InferOutput<typeof orchestrationSessionStatusSchema>
export type OrchestrationSession = v.InferOutput<typeof orchestrationSessionSchema>
export type OrchestrationLatestTurn = v.InferOutput<typeof orchestrationLatestTurnSchema>
export type OrchestrationCheckpointStatus = v.InferOutput<
  typeof orchestrationCheckpointStatusSchema
>
export type OrchestrationCheckpointFile = v.InferOutput<typeof orchestrationCheckpointFileSchema>
export type OrchestrationThread = v.InferOutput<typeof orchestrationThreadSchema>
