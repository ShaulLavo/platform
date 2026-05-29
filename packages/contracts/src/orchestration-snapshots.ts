import * as v from 'valibot'
import { commandIdSchema, projectIdSchema, threadIdSchema } from './chat-ids'
import {
  isoDateTimeSchema,
  nonNegativeIntegerSchema,
  orchestrationLatestTurnSchema,
  orchestrationProjectSchema,
  orchestrationSessionSchema,
  orchestrationThreadSchema,
  trimmedNonEmptyStringSchema,
} from './chat-model'
import { orchestrationEventSchema, orchestrationAggregateKindSchema } from './orchestration-events'
import {
  interactionModeSchema,
  modelSelectionSchema,
  runtimeModeSchema,
} from './orchestration-runtime'

export const orchestrationProjectShellSchema = v.omit(orchestrationProjectSchema, ['deletedAt'])

export const orchestrationThreadShellSchema = v.object({
  id: threadIdSchema,
  projectId: projectIdSchema,
  title: trimmedNonEmptyStringSchema,
  modelSelection: modelSelectionSchema,
  runtimeMode: runtimeModeSchema,
  interactionMode: interactionModeSchema,
  branch: v.nullable(trimmedNonEmptyStringSchema),
  worktreePath: v.nullable(trimmedNonEmptyStringSchema),
  latestTurn: v.nullable(orchestrationLatestTurnSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  archivedAt: v.nullable(isoDateTimeSchema),
  session: v.nullable(orchestrationSessionSchema),
  latestUserMessageAt: v.nullable(isoDateTimeSchema),
  pendingApprovalCount: nonNegativeIntegerSchema,
  pendingUserInputCount: nonNegativeIntegerSchema,
  hasActionableProposedPlan: v.boolean(),
})

export const orchestrationShellSnapshotSchema = v.object({
  snapshotSequence: nonNegativeIntegerSchema,
  projects: v.array(orchestrationProjectShellSchema),
  threads: v.array(orchestrationThreadShellSchema),
  updatedAt: isoDateTimeSchema,
})

export const orchestrationThreadDetailSnapshotSchema = v.object({
  snapshotSequence: nonNegativeIntegerSchema,
  thread: orchestrationThreadSchema,
})

export const orchestrationShellStreamItemSchema = v.variant('kind', [
  v.object({
    kind: v.literal('snapshot'),
    snapshot: orchestrationShellSnapshotSchema,
  }),
  v.object({
    kind: v.literal('project-upserted'),
    sequence: nonNegativeIntegerSchema,
    project: orchestrationProjectShellSchema,
  }),
  v.object({
    kind: v.literal('project-removed'),
    sequence: nonNegativeIntegerSchema,
    projectId: projectIdSchema,
  }),
  v.object({
    kind: v.literal('thread-upserted'),
    sequence: nonNegativeIntegerSchema,
    thread: orchestrationThreadShellSchema,
  }),
  v.object({
    kind: v.literal('thread-removed'),
    sequence: nonNegativeIntegerSchema,
    threadId: threadIdSchema,
  }),
])

export const orchestrationThreadStreamItemSchema = v.variant('kind', [
  v.object({
    kind: v.literal('snapshot'),
    snapshot: orchestrationThreadDetailSnapshotSchema,
  }),
  v.object({
    kind: v.literal('event'),
    event: orchestrationEventSchema,
  }),
])

export const orchestrationReplayEventsInputSchema = v.object({
  afterSequence: nonNegativeIntegerSchema,
  aggregateKind: v.optional(orchestrationAggregateKindSchema),
  aggregateId: v.optional(v.union([projectIdSchema, threadIdSchema])),
  threadId: v.optional(threadIdSchema),
})

export const orchestrationReplayEventsResultSchema = v.object({
  events: v.array(orchestrationEventSchema),
})

export const orchestrationGetTurnDiffInputSchema = v.object({
  threadId: threadIdSchema,
  fromTurnCount: nonNegativeIntegerSchema,
  toTurnCount: nonNegativeIntegerSchema,
})

export const orchestrationGetFullThreadDiffInputSchema = v.object({
  threadId: threadIdSchema,
  toTurnCount: nonNegativeIntegerSchema,
})

export const orchestrationCommandReceiptStatusSchema = v.picklist(['accepted', 'rejected'])

export const orchestrationCommandReceiptSchema = v.object({
  commandId: commandIdSchema,
  commandType: trimmedNonEmptyStringSchema,
  aggregateKind: orchestrationAggregateKindSchema,
  aggregateId: v.union([projectIdSchema, threadIdSchema]),
  acceptedAt: isoDateTimeSchema,
  resultSequence: v.nullable(nonNegativeIntegerSchema),
  status: orchestrationCommandReceiptStatusSchema,
  error: v.nullable(v.string()),
})

export type OrchestrationProjectShell = v.InferOutput<typeof orchestrationProjectShellSchema>
export type OrchestrationThreadShell = v.InferOutput<typeof orchestrationThreadShellSchema>
export type OrchestrationShellSnapshot = v.InferOutput<typeof orchestrationShellSnapshotSchema>
export type OrchestrationThreadDetailSnapshot = v.InferOutput<
  typeof orchestrationThreadDetailSnapshotSchema
>
export type OrchestrationShellStreamItem = v.InferOutput<typeof orchestrationShellStreamItemSchema>
export type OrchestrationThreadStreamItem = v.InferOutput<
  typeof orchestrationThreadStreamItemSchema
>
export type OrchestrationReplayEventsInput = v.InferOutput<
  typeof orchestrationReplayEventsInputSchema
>
export type OrchestrationReplayEventsResult = v.InferOutput<
  typeof orchestrationReplayEventsResultSchema
>
export type OrchestrationGetTurnDiffInput = v.InferOutput<
  typeof orchestrationGetTurnDiffInputSchema
>
export type OrchestrationGetFullThreadDiffInput = v.InferOutput<
  typeof orchestrationGetFullThreadDiffInputSchema
>
export type OrchestrationCommandReceipt = v.InferOutput<typeof orchestrationCommandReceiptSchema>
