import { and, asc, desc, eq, isNull, lt, or, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import * as v from 'valibot'
import {
  ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE,
  orchestrationThreadDetailPageInputSchema,
  orchestrationThreadDetailPageSchema,
  type OrchestrationCheckpointFile,
  type OrchestrationThreadDetailAnchor,
  type OrchestrationThreadDetailPage,
  type OrchestrationThreadDetailPageInput,
} from '@workspace/contracts'
import { orchestrationErrors } from '../observability'
import {
  orchestrationShellSnapshotSchema,
  orchestrationMessageSchema,
  orchestrationProjectSchema,
  orchestrationSessionSchema,
  orchestrationThreadActivitySchema,
  orchestrationThreadDetailSnapshotSchema,
  orchestrationThreadSchema,
  type ChatAttachment,
  type ModelSelection,
  type OrchestrationLatestTurn,
  type OrchestrationThreadShell,
  type OrchestrationProject,
  type OrchestrationProjectScript,
  type OrchestrationSession,
  type OrchestrationShellSnapshot,
  type OrchestrationThread,
  type OrchestrationThreadActivity,
  type OrchestrationThreadDetailSnapshot,
} from './schemas'
import { getDefaultPlatformDatabase } from '../db/client'
import {
  projectionProjects,
  projectionState,
  projectionThreadActivities,
  projectionThreadCheckpoints,
  projectionThreadMessages,
  projectionThreadProposedPlans,
  projectionThreadSessions,
  projectionThreads,
  type OrchestrationThreadActivityRow,
  type OrchestrationThreadMessageRow,
  type ProjectionProjectRow,
  type ProjectionThreadCheckpointRow,
  type ProjectionThreadProposedPlanRow,
  type ProjectionThreadRow,
  type ProjectionThreadSessionRow,
} from '../db/schema'
import type { OrchestrationDatabase } from './event-store'
import {
  boundCheckpoints,
  createEmptyReadModel,
  MAX_THREAD_ACTIVITIES,
  MAX_THREAD_MESSAGES,
  type OrchestrationProjectedCheckpoint,
  type OrchestrationReadModel,
} from './read-model'
import { ORCHESTRATION_PROJECTOR_NAME } from './projection-pipeline'

export class OrchestrationSnapshotQuery {
  private readonly database: OrchestrationDatabase

  constructor(database: OrchestrationDatabase = getDefaultPlatformDatabase()) {
    this.database = database
  }

  /**
   * Hydrates the engine's in-memory model, so it takes only the tail of each
   * thread: the decider and the provider reactor ask about the live turn, and
   * loading every message of every thread at boot is how a server runs out of
   * memory. Full history stays one `threadDetailSnapshot` away.
   */
  fullReadModel(sequence = this.currentSequence()): OrchestrationReadModel {
    const model = createEmptyReadModel(sequence)

    for (const row of this.database.select().from(projectionProjects).all()) {
      model.projects.set(row.projectId, projectFromRow(row))
    }
    for (const row of this.database.select().from(projectionThreads).all()) {
      const thread = threadFromRow(
        row,
        this.recentThreadMessages(row.threadId),
        this.recentThreadActivities(row.threadId),
        this.threadSession(row.threadId),
      )
      model.threads.set(row.threadId, {
        ...thread,
        checkpointByTurnId: boundCheckpoints(this.threadCheckpointIndex(row.threadId)),
        hasActionableProposedPlan: row.hasActionableProposedPlan,
        latestUserMessageAt: row.latestUserMessageAt,
        pendingApprovalCount: row.pendingApprovalCount,
        pendingUserInputCount: row.pendingUserInputCount,
      })
    }

    return model
  }

  shellSnapshot(): OrchestrationShellSnapshot {
    const projects = this.database
      .select()
      .from(projectionProjects)
      .where(isNull(projectionProjects.deletedAt))
      .orderBy(asc(projectionProjects.updatedAt))
      .all()
      .map(projectFromRow)
      .map(projectToShell)
    const threads = this.database
      .select()
      .from(projectionThreads)
      .where(isNull(projectionThreads.deletedAt))
      .orderBy(asc(projectionThreads.createdAt))
      .all()
      .map((thread) => shellThreadFromRow(thread, this.threadSession(thread.threadId)))

    return v.parse(orchestrationShellSnapshotSchema, {
      projects,
      snapshotSequence: this.currentSequence(),
      threads,
      updatedAt: latestShellSnapshotUpdatedAt(projects, threads),
    })
  }

  /**
   * The newest window of the thread, never the whole thread: opening a 5,000
   * message thread has to cost the same as opening a 5 message one. Older rows
   * are reached with `threadDetailPage`, walking backwards from the oldest row
   * the caller holds — nothing here is trimmed out of reach.
   */
  threadDetailSnapshot(threadId: string): OrchestrationThreadDetailSnapshot {
    const row = this.database
      .select()
      .from(projectionThreads)
      .where(eq(projectionThreads.threadId, threadId))
      .get()
    if (!row) throw orchestrationErrors.THREAD_NOT_FOUND({ threadId })

    return v.parse(orchestrationThreadDetailSnapshotSchema, {
      checkpoints: this.threadCheckpointRows(threadId).map(checkpointFromRow),
      proposedPlans: this.threadProposedPlans(threadId).map(proposedPlanFromRow),
      snapshotSequence: this.currentSequence(),
      thread: threadFromRow(
        row,
        this.messagesBefore(threadId, null, ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE).rows,
        this.activitiesBefore(threadId, null, ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE).rows,
        this.threadSession(threadId),
      ),
    })
  }

  /**
   * One page of strictly older rows. Messages and activities are two streams
   * with their own boundaries, so each walks back independently and the page is
   * exhausted only once both have reached the start of the thread.
   */
  threadDetailPage(input: OrchestrationThreadDetailPageInput): OrchestrationThreadDetailPage {
    const query = v.parse(orchestrationThreadDetailPageInputSchema, input)
    const exists = this.database
      .select({ threadId: projectionThreads.threadId })
      .from(projectionThreads)
      .where(eq(projectionThreads.threadId, query.threadId))
      .get()
    if (!exists) throw orchestrationErrors.THREAD_NOT_FOUND({ threadId: query.threadId })

    const messages = this.messagesBefore(query.threadId, query.beforeMessage, query.limit)
    const activities = this.activitiesBefore(query.threadId, query.beforeActivity, query.limit)

    return v.parse(orchestrationThreadDetailPageSchema, {
      activities: activities.rows.map(activityFromRow),
      hasEarlier: messages.hasEarlier || activities.hasEarlier,
      messages: messages.rows.map(messageFromRow),
      snapshotSequence: this.currentSequence(),
      threadId: query.threadId,
    })
  }

  private messagesBefore(
    threadId: string,
    before: OrchestrationThreadDetailAnchor | null,
    limit: number,
  ) {
    const rows = this.database
      .select()
      .from(projectionThreadMessages)
      .where(
        and(
          eq(projectionThreadMessages.threadId, threadId),
          olderThan(projectionThreadMessages.createdAt, projectionThreadMessages.messageId, before),
        ),
      )
      .orderBy(desc(projectionThreadMessages.createdAt), desc(projectionThreadMessages.messageId))
      .limit(limit + 1)
      .all()

    return takeBackwardsPage(rows, limit)
  }

  private activitiesBefore(
    threadId: string,
    before: OrchestrationThreadDetailAnchor | null,
    limit: number,
  ) {
    const rows = this.database
      .select()
      .from(projectionThreadActivities)
      .where(
        and(
          eq(projectionThreadActivities.threadId, threadId),
          olderThan(
            projectionThreadActivities.createdAt,
            projectionThreadActivities.activityId,
            before,
          ),
        ),
      )
      .orderBy(
        desc(projectionThreadActivities.createdAt),
        desc(projectionThreadActivities.activityId),
      )
      .limit(limit + 1)
      .all()

    return takeBackwardsPage(rows, limit)
  }

  private recentThreadMessages(threadId: string) {
    return this.messagesBefore(threadId, null, MAX_THREAD_MESSAGES).rows
  }

  private recentThreadActivities(threadId: string) {
    return this.activitiesBefore(threadId, null, MAX_THREAD_ACTIVITIES).rows
  }

  private threadSession(threadId: string) {
    return this.database
      .select()
      .from(projectionThreadSessions)
      .where(eq(projectionThreadSessions.threadId, threadId))
      .get()
  }

  private threadCheckpointRows(threadId: string) {
    return this.database
      .select()
      .from(projectionThreadCheckpoints)
      .where(eq(projectionThreadCheckpoints.threadId, threadId))
      .orderBy(asc(projectionThreadCheckpoints.checkpointTurnCount))
      .all()
  }

  private threadProposedPlans(threadId: string) {
    return this.database
      .select()
      .from(projectionThreadProposedPlans)
      .where(eq(projectionThreadProposedPlans.threadId, threadId))
      .orderBy(
        asc(projectionThreadProposedPlans.createdAt),
        asc(projectionThreadProposedPlans.planId),
      )
      .all()
  }

  private threadCheckpointIndex(threadId: string) {
    const entries = this.threadCheckpointRows(threadId).map(
      (row) => [row.turnId, projectedCheckpointFromRow(row)] as const,
    )

    return Object.fromEntries(entries) as Record<string, OrchestrationProjectedCheckpoint>
  }

  private currentSequence() {
    return (
      this.database
        .select({ sequence: projectionState.lastAppliedSequence })
        .from(projectionState)
        .where(eq(projectionState.projector, ORCHESTRATION_PROJECTOR_NAME))
        .get()?.sequence ?? 0
    )
  }
}

/**
 * Strictly-older predicate under `(createdAt, id)` ordering. A `null` boundary
 * is "hold nothing yet", which reads the newest rows — the same slice the
 * detail snapshot's window carries.
 */
function olderThan(
  createdAtColumn: SQLiteColumn,
  idColumn: SQLiteColumn,
  before: OrchestrationThreadDetailAnchor | null,
): SQL | undefined {
  if (!before) return undefined

  return or(
    lt(createdAtColumn, before.createdAt),
    and(eq(createdAtColumn, before.createdAt), lt(idColumn, before.id)),
  )
}

/**
 * Rows arrive newest-first and one past the limit: reading the extra row is how
 * `hasEarlier` stays exact without a second count query. The page is returned
 * oldest-first so callers prepend it as-is.
 */
function takeBackwardsPage<Row>(rows: Row[], limit: number) {
  return {
    hasEarlier: rows.length > limit,
    rows: rows.slice(0, limit).toReversed(),
  }
}

function projectFromRow(row: ProjectionProjectRow): OrchestrationProject {
  return v.parse(orchestrationProjectSchema, {
    createdAt: row.createdAt,
    defaultModelSelection: parseJson<ModelSelection | null>(row.defaultModelSelectionJson, null),
    deletedAt: row.deletedAt,
    id: row.projectId,
    orderKey: row.orderKey,
    scripts: parseJson<OrchestrationProjectScript[]>(row.scriptsJson, []),
    title: row.title,
    updatedAt: row.updatedAt,
    workspaceRoot: row.workspaceRoot,
  })
}

function projectToShell(project: OrchestrationProject) {
  return {
    createdAt: project.createdAt,
    defaultModelSelection: project.defaultModelSelection,
    id: project.id,
    orderKey: project.orderKey,
    scripts: project.scripts,
    title: project.title,
    updatedAt: project.updatedAt,
    workspaceRoot: project.workspaceRoot,
  }
}

type ShellSnapshotTimestampSource = {
  session?: { updatedAt: string } | null
  updatedAt: string
}

function latestShellSnapshotUpdatedAt(
  projects: ShellSnapshotTimestampSource[],
  threads: ShellSnapshotTimestampSource[],
) {
  let updatedAt = new Date(0).toISOString()

  for (const project of projects) {
    updatedAt = latestTimestamp(updatedAt, project.updatedAt)
  }
  for (const thread of threads) {
    updatedAt = latestTimestamp(updatedAt, thread.updatedAt)
    updatedAt = latestTimestamp(updatedAt, thread.session?.updatedAt)
  }

  return updatedAt
}

function latestTimestamp(current: string, candidate: string | null | undefined) {
  if (!candidate) return current
  if (candidate <= current) return current

  return candidate
}

function shellThreadFromRow(row: ProjectionThreadRow, session?: ProjectionThreadSessionRow) {
  return {
    archivedAt: row.archivedAt,
    branch: row.branch,
    createdAt: row.createdAt,
    hasActionableProposedPlan: row.hasActionableProposedPlan,
    id: row.threadId,
    interactionMode: row.interactionMode,
    latestTurn: parseJson<OrchestrationLatestTurn | null>(row.latestTurnJson, null),
    latestUserMessageAt: row.latestUserMessageAt,
    modelSelection: parseJson<ModelSelection>(row.modelSelectionJson),
    pendingApprovalCount: row.pendingApprovalCount,
    pendingUserInputCount: row.pendingUserInputCount,
    // The cold read has to carry it too, or a reload leaves a thread that is
    // mid-plan showing a coarse spinner until its next plan snapshot arrives —
    // seconds during a live turn, and forever once the turn stops planning.
    planProgress: parseJson<OrchestrationThreadShell['planProgress']>(row.planProgressJson, null),
    pinOrderKey: row.pinOrderKey,
    pinnedAt: row.pinnedAt,
    projectId: row.projectId,
    runtimeMode: row.runtimeMode,
    session: session ? sessionFromRow(session) : null,
    settledAt: row.settledAt,
    settledOverride: row.settledOverride,
    snoozedAt: row.snoozedAt,
    snoozedUntil: row.snoozedUntil,
    title: row.title,
    updatedAt: row.updatedAt,
    worktreePath: row.worktreePath,
  }
}

function threadFromRow(
  row: ProjectionThreadRow,
  messages: OrchestrationThreadMessageRow[],
  activities: OrchestrationThreadActivityRow[],
  session?: ProjectionThreadSessionRow,
): OrchestrationThread {
  return v.parse(orchestrationThreadSchema, {
    ...shellThreadFromRow(row, session),
    activities: activities.map(activityFromRow),
    deletedAt: row.deletedAt,
    messages: messages.map(messageFromRow),
  })
}

function messageFromRow(row: OrchestrationThreadMessageRow) {
  return v.parse(orchestrationMessageSchema, {
    attachments: parseJson<ChatAttachment[]>(row.attachmentsJson, []),
    createdAt: row.createdAt,
    id: row.messageId,
    role: row.role,
    streaming: row.streaming,
    text: row.text,
    threadId: row.threadId,
    turnId: row.turnId,
    updatedAt: row.updatedAt,
  })
}

function activityFromRow(row: OrchestrationThreadActivityRow): OrchestrationThreadActivity {
  return v.parse(orchestrationThreadActivitySchema, {
    createdAt: row.createdAt,
    id: row.activityId,
    kind: row.kind,
    payload: parseJson<unknown>(row.payloadJson, null),
    sequence: row.sequence ?? undefined,
    summary: row.summary,
    threadId: row.threadId,
    tone: row.tone,
    turnId: row.turnId,
  })
}

function sessionFromRow(row: ProjectionThreadSessionRow): OrchestrationSession {
  return v.parse(orchestrationSessionSchema, {
    activeTurnId: row.activeTurnId,
    lastError: row.lastError,
    providerInstanceId: row.providerInstanceId,
    providerName: row.providerName,
    providerSessionId: row.providerSessionId,
    runtimeMode: row.runtimeMode,
    status: row.status,
    threadId: row.threadId,
    updatedAt: row.updatedAt,
  })
}

function checkpointFromRow(row: ProjectionThreadCheckpointRow) {
  return {
    assistantMessageId: row.assistantMessageId,
    checkpointRef: row.checkpointRef,
    checkpointTurnCount: row.checkpointTurnCount,
    completedAt: row.completedAt,
    files: parseJson<OrchestrationCheckpointFile[]>(row.filesJson, []),
    status: row.status,
    turnId: row.turnId,
  }
}

/** The in-memory model answers "what can be reverted", so it drops the files. */
function projectedCheckpointFromRow(row: ProjectionThreadCheckpointRow) {
  return {
    assistantMessageId: row.assistantMessageId,
    checkpointRef: row.checkpointRef,
    checkpointTurnCount: row.checkpointTurnCount,
    completedAt: row.completedAt,
    status: row.status,
    turnId: row.turnId,
  } as OrchestrationProjectedCheckpoint
}

function proposedPlanFromRow(row: ProjectionThreadProposedPlanRow) {
  return {
    createdAt: row.createdAt,
    id: row.planId,
    implementationThreadId: row.implementationThreadId,
    implementedAt: row.implementedAt,
    planMarkdown: row.planMarkdown,
    threadId: row.threadId,
    turnId: row.turnId,
    updatedAt: row.updatedAt,
  }
}

function parseJson<T>(value: string | null, fallback?: T) {
  if (value === null || value === undefined) return fallback as T

  return JSON.parse(value) as T
}
