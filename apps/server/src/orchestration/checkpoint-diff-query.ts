import { asc, eq } from 'drizzle-orm'
import * as v from 'valibot'

import { orchestrationErrors } from '../observability'
import type { GitFileDiff, GitService } from '../git/service'
import {
  projectionProjects,
  projectionThreadCheckpoints,
  projectionThreads,
  type ProjectionProjectRow,
  type ProjectionThreadCheckpointRow,
  type ProjectionThreadRow,
} from '../db/schema'
import type { OrchestrationDatabase } from './event-store'
import { checkpointRefForThreadTurn } from './checkpoint-refs'
import { checkpointErrors } from './structured-errors'
import {
  orchestrationGetFullThreadDiffInputSchema,
  orchestrationGetTurnDiffInputSchema,
  type OrchestrationGetFullThreadDiffInput,
  type OrchestrationGetTurnDiffInput,
} from './schemas'

type ThreadCheckpointContext = {
  checkpoints: ProjectionThreadCheckpointRow[]
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

  async turnDiff(input: OrchestrationGetTurnDiffInput): Promise<GitFileDiff[]> {
    const query = v.parse(orchestrationGetTurnDiffInputSchema, input)
    validateTurnRange(query)

    const context = this.threadCheckpointContext(query.threadId)
    if (query.fromTurnCount === query.toTurnCount) return []

    const refs = checkpointRefsForRange(query, context)
    await this.assertCheckpointRefAvailable(context, refs.fromRef, query.fromTurnCount)
    await this.assertCheckpointRefAvailable(context, refs.toRef, query.toTurnCount)
    return this.git.diffRefs({
      ignoreWhitespace: query.ignoreWhitespace,
      newRef: refs.toRef,
      oldRef: refs.fromRef,
      path: context.workspacePath,
    })
  }

  fullThreadDiff(input: OrchestrationGetFullThreadDiffInput): Promise<GitFileDiff[]> {
    const query = v.parse(orchestrationGetFullThreadDiffInputSchema, input)

    return this.turnDiff({
      fromTurnCount: 0,
      ignoreWhitespace: query.ignoreWhitespace,
      threadId: query.threadId,
      toTurnCount: query.toTurnCount,
    })
  }

  private threadCheckpointContext(threadId: string): ThreadCheckpointContext {
    const thread = this.threadRow(threadId)
    const project = this.projectRow(thread.projectId)
    const workspacePath = thread.worktreePath ?? project.workspaceRoot

    return {
      checkpoints: this.checkpointRows(threadId),
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
    if (!row || row.deletedAt) throw orchestrationErrors.THREAD_NOT_FOUND({ threadId })

    return row
  }

  private projectRow(projectId: string): ProjectionProjectRow {
    const row = this.database
      .select()
      .from(projectionProjects)
      .where(eq(projectionProjects.projectId, projectId))
      .get()
    if (!row || row.deletedAt) throw orchestrationErrors.PROJECT_NOT_FOUND({ projectId })

    return row
  }

  /** The projection is the source: reverts already pruned what it no longer holds. */
  private checkpointRows(threadId: string) {
    return this.database
      .select()
      .from(projectionThreadCheckpoints)
      .where(eq(projectionThreadCheckpoints.threadId, threadId))
      .orderBy(asc(projectionThreadCheckpoints.checkpointTurnCount))
      .all()
  }

  private async assertCheckpointRefAvailable(
    context: ThreadCheckpointContext,
    ref: string,
    turnCount: number,
  ) {
    if (await this.git.hasRef({ path: context.workspacePath, ref })) return

    throw checkpointErrors.REF_UNAVAILABLE({ turnCount })
  }
}

function validateTurnRange(input: OrchestrationGetTurnDiffInput) {
  if (input.fromTurnCount <= input.toTurnCount) return

  throw checkpointErrors.RANGE_INVALID({
    fromTurnCount: input.fromTurnCount,
    toTurnCount: input.toTurnCount,
  })
}

function checkpointRefsForRange(
  input: OrchestrationGetTurnDiffInput,
  context: ThreadCheckpointContext,
) {
  const availableTurnCount = maxCheckpointTurnCount(context.checkpoints)
  if (input.toTurnCount > availableTurnCount) {
    throw checkpointErrors.RANGE_EXCEEDS_TURN_COUNT({
      availableTurnCount,
      requestedTurnCount: input.toTurnCount,
    })
  }

  return {
    fromRef: checkpointRefForTurnCount(context, input.fromTurnCount),
    toRef: checkpointRefForTurnCount(context, input.toTurnCount),
  }
}

function maxCheckpointTurnCount(checkpoints: readonly ProjectionThreadCheckpointRow[]) {
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
  if (!checkpoint) throw checkpointErrors.REF_UNAVAILABLE({ turnCount })
  if (checkpoint.status !== 'ready') throw checkpointErrors.REF_UNAVAILABLE({ turnCount })

  return checkpoint.checkpointRef
}
