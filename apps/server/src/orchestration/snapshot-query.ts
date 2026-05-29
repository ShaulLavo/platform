import { and, asc, eq, isNull } from 'drizzle-orm'
import * as v from 'valibot'
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
  type OrchestrationProject,
  type OrchestrationSession,
  type OrchestrationShellSnapshot,
  type OrchestrationThread,
  type OrchestrationThreadActivity,
  type OrchestrationThreadDetailSnapshot,
} from './schemas'
import { db as defaultDb } from '../db/client'
import {
  orchestrationEvents,
  projectionProjects,
  projectionState,
  projectionThreadActivities,
  projectionThreadMessages,
  projectionThreadSessions,
  projectionThreads,
  type OrchestrationThreadActivityRow,
  type OrchestrationThreadMessageRow,
  type ProjectionProjectRow,
  type ProjectionThreadRow,
  type ProjectionThreadSessionRow,
} from '../db/schema'
import type { OrchestrationDatabase } from './event-store'
import { rowToEvent } from './event-store'
import {
  createEmptyReadModel,
  type OrchestrationProjectedCheckpoint,
  type OrchestrationReadModel,
} from './read-model'
import { ORCHESTRATION_PROJECTOR_NAME } from './projection-pipeline'

export class OrchestrationSnapshotQuery {
  private readonly database: OrchestrationDatabase

  constructor(database: OrchestrationDatabase = defaultDb) {
    this.database = database
  }

  fullReadModel(sequence = this.currentSequence()): OrchestrationReadModel {
    const model = createEmptyReadModel(sequence)

    for (const row of this.database.select().from(projectionProjects).all()) {
      model.projects.set(row.projectId, projectFromRow(row))
    }
    for (const row of this.database.select().from(projectionThreads).all()) {
      const thread = threadFromRow(
        row,
        this.threadMessages(row.threadId),
        this.threadActivities(row.threadId),
        this.threadSession(row.threadId),
      )
      model.threads.set(row.threadId, {
        ...thread,
        checkpointByTurnId: this.threadCheckpoints(row.threadId),
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

  threadDetailSnapshot(threadId: string): OrchestrationThreadDetailSnapshot {
    const row = this.database
      .select()
      .from(projectionThreads)
      .where(eq(projectionThreads.threadId, threadId))
      .get()
    if (!row) throw orchestrationErrors.THREAD_NOT_FOUND({ threadId })

    return v.parse(orchestrationThreadDetailSnapshotSchema, {
      snapshotSequence: this.currentSequence(),
      thread: threadFromRow(
        row,
        this.threadMessages(threadId),
        this.threadActivities(threadId),
        this.threadSession(threadId),
      ),
    })
  }

  private threadMessages(threadId: string) {
    return this.database
      .select()
      .from(projectionThreadMessages)
      .where(eq(projectionThreadMessages.threadId, threadId))
      .orderBy(asc(projectionThreadMessages.createdAt))
      .all()
  }

  private threadActivities(threadId: string) {
    return this.database
      .select()
      .from(projectionThreadActivities)
      .where(eq(projectionThreadActivities.threadId, threadId))
      .orderBy(asc(projectionThreadActivities.createdAt))
      .all()
  }

  private threadSession(threadId: string) {
    return this.database
      .select()
      .from(projectionThreadSessions)
      .where(eq(projectionThreadSessions.threadId, threadId))
      .get()
  }

  private threadCheckpoints(threadId: string) {
    const summaries = new Map<string, OrchestrationProjectedCheckpoint>()
    const rows = this.database
      .select()
      .from(orchestrationEvents)
      .where(
        and(
          eq(orchestrationEvents.aggregateKind, 'thread'),
          eq(orchestrationEvents.aggregateId, threadId),
        ),
      )
      .orderBy(asc(orchestrationEvents.sequence))
      .all()

    for (const row of rows) {
      applyCheckpointEvent(summaries, rowToEvent(row))
    }

    return Object.fromEntries(summaries) as Record<string, OrchestrationProjectedCheckpoint>
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

function projectFromRow(row: ProjectionProjectRow): OrchestrationProject {
  return v.parse(orchestrationProjectSchema, {
    createdAt: row.createdAt,
    defaultModelSelection: parseJson<ModelSelection | null>(row.defaultModelSelectionJson, null),
    deletedAt: row.deletedAt,
    id: row.projectId,
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
    projectId: row.projectId,
    runtimeMode: row.runtimeMode,
    session: session ? sessionFromRow(session) : null,
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

function applyCheckpointEvent(
  summaries: Map<string, OrchestrationProjectedCheckpoint>,
  event: ReturnType<typeof rowToEvent>,
) {
  if (event.type === 'thread.turn-diff-completed') {
    summaries.set(event.payload.turnId, {
      assistantMessageId: event.payload.assistantMessageId,
      checkpointRef: event.payload.checkpointRef,
      checkpointTurnCount: event.payload.checkpointTurnCount,
      completedAt: event.payload.completedAt,
      status: event.payload.status,
      turnId: event.payload.turnId,
    })
    return
  }
  if (event.type !== 'thread.reverted') return

  for (const summary of summaries.values()) {
    if (summary.checkpointTurnCount <= event.payload.turnCount) continue

    summaries.delete(summary.turnId)
  }
}

function parseJson<T>(value: string | null, fallback?: T) {
  if (value === null || value === undefined) return fallback as T

  return JSON.parse(value) as T
}
