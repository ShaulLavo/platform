import { and, asc, eq } from 'drizzle-orm'
import * as v from 'valibot'

import { FsError } from '../fs/errors'
import type { GitFileDiff, GitService } from '../git/service'
import {
  orchestrationEvents,
  projectionProjects,
  projectionThreads,
  type ProjectionProjectRow,
  type ProjectionThreadRow,
} from '../db/schema'
import type { OrchestrationDatabase } from './event-store'
import { rowToEvent } from './event-store'
import {
  orchestrationGetFullThreadDiffInputSchema,
  orchestrationGetTurnDiffInputSchema,
  type OrchestrationEvent,
  type OrchestrationGetFullThreadDiffInput,
  type OrchestrationGetTurnDiffInput,
} from './schemas'

type CheckpointSummary = {
  checkpointRef: string
  checkpointTurnCount: number
  status: 'ready' | 'missing' | 'error'
  turnId: string
}

type ThreadCheckpointContext = {
  checkpoints: CheckpointSummary[]
  threadId: string
  workspacePath: string
}

export class OrchestrationCheckpointDiffQuery {
  private readonly database: OrchestrationDatabase
  private readonly git: GitService

  constructor(database: OrchestrationDatabase, git: GitService) {
    this.database = database
    this.git = git
  }

  turnDiff(input: OrchestrationGetTurnDiffInput): Promise<GitFileDiff[]> {
    const query = v.parse(orchestrationGetTurnDiffInputSchema, input)
    validateTurnRange(query)

    const context = this.threadCheckpointContext(query.threadId)
    const refs = checkpointRefsForRange(query, context)
    if (query.fromTurnCount === query.toTurnCount) return Promise.resolve([])

    return this.git.diffRefs({
      newRef: refs.toRef,
      oldRef: refs.fromRef,
      path: context.workspacePath,
    })
  }

  fullThreadDiff(input: OrchestrationGetFullThreadDiffInput): Promise<GitFileDiff[]> {
    const query = v.parse(orchestrationGetFullThreadDiffInputSchema, input)

    return this.turnDiff({
      fromTurnCount: 0,
      threadId: query.threadId,
      toTurnCount: query.toTurnCount,
    })
  }

  private threadCheckpointContext(threadId: string): ThreadCheckpointContext {
    const thread = this.threadRow(threadId)
    const project = this.projectRow(thread.projectId)
    const workspacePath = thread.worktreePath ?? project.workspaceRoot

    return {
      checkpoints: this.checkpointSummaries(threadId),
      threadId,
      workspacePath,
    }
  }

  private threadRow(threadId: string): ProjectionThreadRow {
    const row = this.database
      .select()
      .from(projectionThreads)
      .where(eq(projectionThreads.threadId, threadId))
      .get()
    if (!row || row.deletedAt) throw new FsError('NOT_FOUND', `Thread not found: ${threadId}`)

    return row
  }

  private projectRow(projectId: string): ProjectionProjectRow {
    const row = this.database
      .select()
      .from(projectionProjects)
      .where(eq(projectionProjects.projectId, projectId))
      .get()
    if (!row || row.deletedAt) throw new FsError('NOT_FOUND', `Project not found: ${projectId}`)

    return row
  }

  private checkpointSummaries(threadId: string) {
    const summaries = new Map<string, CheckpointSummary>()
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

    return Array.from(summaries.values()).toSorted(
      (left, right) => left.checkpointTurnCount - right.checkpointTurnCount,
    )
  }
}

function applyCheckpointEvent(
  summaries: Map<string, CheckpointSummary>,
  event: OrchestrationEvent,
) {
  if (event.type === 'thread.turn-diff-completed') {
    summaries.set(event.payload.turnId, {
      checkpointRef: event.payload.checkpointRef,
      checkpointTurnCount: event.payload.checkpointTurnCount,
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

function validateTurnRange(input: OrchestrationGetTurnDiffInput) {
  if (input.fromTurnCount <= input.toTurnCount) return

  throw new FsError('INVALID_PATH', 'fromTurnCount must be less than or equal to toTurnCount')
}

function checkpointRefsForRange(
  input: OrchestrationGetTurnDiffInput,
  context: ThreadCheckpointContext,
) {
  const maxTurnCount = maxCheckpointTurnCount(context.checkpoints)
  if (input.toTurnCount > maxTurnCount) {
    throw new FsError(
      'NOT_FOUND',
      `Turn diff range exceeds current turn count: requested ${input.toTurnCount}, current ${maxTurnCount}`,
    )
  }

  return {
    fromRef: checkpointRefForTurnCount(context, input.fromTurnCount),
    toRef: checkpointRefForTurnCount(context, input.toTurnCount),
  }
}

function maxCheckpointTurnCount(checkpoints: readonly CheckpointSummary[]) {
  let maxTurnCount = 0

  for (const checkpoint of checkpoints) {
    maxTurnCount = Math.max(maxTurnCount, checkpoint.checkpointTurnCount)
  }

  return maxTurnCount
}

function checkpointRefForTurnCount(context: ThreadCheckpointContext, turnCount: number) {
  if (turnCount === 0) return checkpointRefForThreadTurn(context.threadId, 0)

  const checkpoint = context.checkpoints.find(
    (candidate) => candidate.checkpointTurnCount === turnCount,
  )
  if (!checkpoint) throw checkpointUnavailable(turnCount)
  if (checkpoint.status !== 'ready') throw checkpointUnavailable(turnCount)

  return checkpoint.checkpointRef
}

function checkpointUnavailable(turnCount: number) {
  return new FsError('NOT_FOUND', `Checkpoint ref is unavailable for turn ${turnCount}`)
}

function checkpointRefForThreadTurn(threadId: string, turnCount: number) {
  const encodedThreadId = Buffer.from(threadId).toString('base64url')

  return `refs/t3/checkpoints/${encodedThreadId}/turn/${turnCount}`
}
