import { and, eq, isNull } from 'drizzle-orm'
import * as v from 'valibot'
import {
  orchestrationProjectShellSchema,
  orchestrationThreadShellSchema,
  type ModelSelection,
  type OrchestrationLatestTurn,
  type OrchestrationProjectShell,
  type OrchestrationShellSnapshot,
  type OrchestrationThreadShell,
} from '@workspace/contracts'
import type { PlatformDatabase } from '../db/client'
import {
  projectionProjects,
  projectionThreadSessions,
  projectionThreads,
  type ProjectionThreadSessionRow,
} from '../db/schema'
import type { OrchestrationSnapshotQuery } from './snapshot-query'

/**
 * Reads the shell shape of a *single* aggregate. A shell delta is about one
 * project or one thread, so it must not pay for the whole workspace: the full
 * `shellSnapshot()` is O(projects + threads) plus one session query per thread,
 * and running it once per event is what made a streaming turn the server's
 * dominant cost.
 *
 * `beginWindow` is called once per coalescing window, before any row read, so a
 * reader that must derive rows from a wider query can amortize it over the
 * window instead of per aggregate.
 */
export type OrchestrationShellRowReader = {
  beginWindow: () => void
  projectShell: (projectId: string) => OrchestrationProjectShell | null
  threadShell: (threadId: string) => OrchestrationThreadShell | null
}

export function createShellRowReader(
  snapshots: OrchestrationSnapshotQuery,
  database?: PlatformDatabase,
): OrchestrationShellRowReader {
  if (database) return new ProjectionShellRowReader(database)

  return new SnapshotShellRowReader(snapshots)
}

/**
 * Two primary-key point reads per thread delta (row + session), one per project
 * delta, and one small parse. This is the reader deltas should run on.
 */
export class ProjectionShellRowReader implements OrchestrationShellRowReader {
  private readonly database: PlatformDatabase

  constructor(database: PlatformDatabase) {
    this.database = database
  }

  beginWindow() {
    // Every read is already scoped to one aggregate; nothing to amortize.
  }

  projectShell(projectId: string): OrchestrationProjectShell | null {
    const row = this.database
      .select()
      .from(projectionProjects)
      .where(and(eq(projectionProjects.projectId, projectId), isNull(projectionProjects.deletedAt)))
      .get()
    if (!row) return null

    return v.parse(orchestrationProjectShellSchema, {
      createdAt: row.createdAt,
      defaultModelSelection: parseJson<ModelSelection | null>(row.defaultModelSelectionJson, null),
      id: row.projectId,
      title: row.title,
      updatedAt: row.updatedAt,
      workspaceRoot: row.workspaceRoot,
    })
  }

  threadShell(threadId: string): OrchestrationThreadShell | null {
    const row = this.database
      .select()
      .from(projectionThreads)
      .where(and(eq(projectionThreads.threadId, threadId), isNull(projectionThreads.deletedAt)))
      .get()
    if (!row) return null

    const session = this.database
      .select()
      .from(projectionThreadSessions)
      .where(eq(projectionThreadSessions.threadId, threadId))
      .get()

    return v.parse(orchestrationThreadShellSchema, {
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
      session: sessionShell(session),
      title: row.title,
      updatedAt: row.updatedAt,
      worktreePath: row.worktreePath,
    })
  }
}

/**
 * Fallback for a stream that was not given a database handle: it still costs a
 * full `shellSnapshot()`, but only once per coalescing window instead of once
 * per event. Delete it once every construction site passes a database.
 */
export class SnapshotShellRowReader implements OrchestrationShellRowReader {
  private readonly snapshots: OrchestrationSnapshotQuery
  private window: OrchestrationShellSnapshot | null = null

  constructor(snapshots: OrchestrationSnapshotQuery) {
    this.snapshots = snapshots
  }

  beginWindow() {
    this.window = null
  }

  projectShell(projectId: string): OrchestrationProjectShell | null {
    return this.snapshot().projects.find((project) => project.id === projectId) ?? null
  }

  threadShell(threadId: string): OrchestrationThreadShell | null {
    return this.snapshot().threads.find((thread) => thread.id === threadId) ?? null
  }

  private snapshot() {
    this.window ??= this.snapshots.shellSnapshot()

    return this.window
  }
}

function sessionShell(row: ProjectionThreadSessionRow | undefined) {
  if (!row) return null

  return {
    activeTurnId: row.activeTurnId,
    lastError: row.lastError,
    providerInstanceId: row.providerInstanceId,
    providerName: row.providerName,
    providerSessionId: row.providerSessionId,
    runtimeMode: row.runtimeMode,
    status: row.status,
    threadId: row.threadId,
    updatedAt: row.updatedAt,
  }
}

function parseJson<T>(value: string | null, fallback?: T) {
  if (value === null || value === undefined) return fallback as T

  return JSON.parse(value) as T
}
