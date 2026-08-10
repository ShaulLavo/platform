import * as v from 'valibot'
import { commandIdSchema, projectIdSchema, threadIdSchema } from './chat-ids'
import {
  isoDateTimeSchema,
  nonNegativeIntegerSchema,
  orchestrationCheckpointSummarySchema,
  orchestrationLatestTurnSchema,
  orchestrationMessageSchema,
  orchestrationProjectSchema,
  orchestrationProposedPlanSchema,
  orchestrationSessionSchema,
  orchestrationThreadActivitySchema,
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

/**
 * How many messages and how many activities one thread-detail window carries.
 * A thread is unbounded, so the detail snapshot ships only its tail — a 5,000
 * message thread must open as fast as a 5 message one. Everything older stays
 * reachable through `threadDetailPage`.
 */
export const ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE = 200

/** Ceiling on a client-chosen page size: the page read is client-reachable. */
export const ORCHESTRATION_THREAD_DETAIL_MAX_PAGE_SIZE = 1_000

/**
 * Keyset boundary for one backwards walk: the oldest row the caller already
 * holds, as `(createdAt, id)`.
 *
 * Deliberately derived from row content instead of an opaque server-minted
 * token. The caller can always rebuild the boundary from what it is currently
 * holding, so trimming a client cache, a reconnect that replaces the window, or
 * a revert that rewrites projection rows can never strand history behind a
 * stale cursor — which is the only way "capped" stops meaning "unreachable".
 */
export const orchestrationThreadDetailAnchorSchema = v.object({
  id: trimmedNonEmptyStringSchema,
  createdAt: isoDateTimeSchema,
})

/**
 * `null` on a boundary means "hold nothing of this kind yet", which reads the
 * newest rows — the same slice the detail snapshot's window carries.
 */
export const orchestrationThreadDetailPageInputSchema = v.object({
  threadId: threadIdSchema,
  beforeMessage: v.nullish(orchestrationThreadDetailAnchorSchema, null),
  beforeActivity: v.nullish(orchestrationThreadDetailAnchorSchema, null),
  limit: v.optional(
    v.pipe(
      nonNegativeIntegerSchema,
      v.minValue(1),
      v.maxValue(ORCHESTRATION_THREAD_DETAIL_MAX_PAGE_SIZE),
    ),
    ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE,
  ),
})

/** Rows are oldest-first, so a caller prepends the page as it arrives. */
export const orchestrationThreadDetailPageSchema = v.object({
  threadId: threadIdSchema,
  snapshotSequence: nonNegativeIntegerSchema,
  messages: v.array(orchestrationMessageSchema),
  activities: v.array(orchestrationThreadActivitySchema),
  /** False only once both walks have reached the start of the thread. */
  hasEarlier: v.boolean(),
})

/**
 * Plans and checkpoints ride on the snapshot rather than on the thread: they
 * are history, and the engine's in-memory thread deliberately keeps only the
 * live tail. A cold reload gets them here; live updates arrive as events.
 *
 * `thread.messages` and `thread.activities` are the newest
 * `ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE` rows, not the whole thread.
 */
export const orchestrationThreadDetailSnapshotSchema = v.object({
  snapshotSequence: nonNegativeIntegerSchema,
  thread: orchestrationThreadSchema,
  proposedPlans: v.array(orchestrationProposedPlanSchema),
  checkpoints: v.array(orchestrationCheckpointSummarySchema),
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
  /**
   * Display diffs ignore whitespace-only hunks (they are noise to a reader);
   * stat counting does not (they are real changes). Absent means git's default:
   * whitespace counts.
   */
  ignoreWhitespace: v.optional(v.boolean()),
})

export const orchestrationGetFullThreadDiffInputSchema = v.object({
  threadId: threadIdSchema,
  toTurnCount: nonNegativeIntegerSchema,
  ignoreWhitespace: v.optional(v.boolean()),
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

export type OrchestrationThreadDetailAnchor = v.InferOutput<
  typeof orchestrationThreadDetailAnchorSchema
>
/** Input side: boundaries and `limit` are the caller's to omit. */
export type OrchestrationThreadDetailPageInput = v.InferInput<
  typeof orchestrationThreadDetailPageInputSchema
>
export type OrchestrationThreadDetailPage = v.InferOutput<
  typeof orchestrationThreadDetailPageSchema
>
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
