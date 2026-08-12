import { eq } from 'drizzle-orm'
import type { ChatAttachment, ThreadId } from '@workspace/contracts'
import { deleteAttachmentBlobs } from '../attachments/store'
import { projectionProjects, projectionThreadMessages, projectionThreads } from '../db/schema'
import type { OrchestrationDatabase } from './event-store'
import type { GitWorktreeService } from '../git/worktrees'
import type { ProviderService } from '../provider/provider-service'
import type { ProviderRuntimeBindingWithMetadata } from '../provider/provider-session-directory'
import {
  orchestrationEventSummary,
  providerBindingSummary,
  recordChatPipelineInfo,
  recordChatPipelineWarning,
} from './orchestration-logging'
import type { OrchestrationEvent } from './schemas'
import type { OrchestrationDomainEventReactor } from './streams'

type ThreadDeletedEvent = Extract<OrchestrationEvent, { type: 'thread.deleted' }>

/**
 * Deleting a thread only tombstones a row; the provider process bound to it
 * keeps running, burning tokens and holding the worktree the user thinks they
 * just released, and its image blobs stay on disk forever. This reactor is what
 * turns the tombstone into an actual stop and a blob reclaim.
 *
 * It reacts to `thread.deleted` — which is also what the `project.delete`
 * cascade emits, one per live thread, in the same committed batch — so project
 * deletion is covered by the same path with no separate project branch.
 *
 * The stop is deliberately *not* fed back through `ingestion` the way the
 * provider reactor's stop does: an ingested `session.set` would dispatch
 * `thread.session.set`, whose invariant rejects a deleted thread, and the
 * deletion would end up minting a durable rejection receipt for its own
 * cleanup.
 */
export class ThreadDeletionReactor implements OrchestrationDomainEventReactor {
  readonly name = 'thread-deletion-reactor'
  private readonly cleanups = new Set<Promise<void>>()
  private readonly cleaningThreads = new Set<ThreadId>()
  private readonly attachmentsDir: string
  /** Null when the engine was built without git; reclamation is skipped rather than faked. */
  private readonly worktrees: GitWorktreeService | null
  private readonly database: OrchestrationDatabase
  private readonly providerService: ProviderService

  constructor({
    attachmentsDir,
    worktrees,
    database,
    providerService,
  }: {
    attachmentsDir: string
    worktrees?: GitWorktreeService | null
    database: OrchestrationDatabase
    providerService: ProviderService
  }) {
    this.attachmentsDir = attachmentsDir
    this.worktrees = worktrees ?? null
    this.database = database
    this.providerService = providerService
  }

  handleEvents(events: OrchestrationEvent[]) {
    for (const event of events) {
      if (event.type !== 'thread.deleted') continue

      this.enqueueCleanup(event)
    }
  }

  /** Test/shutdown hook: settle every in-flight stop. */
  async drain() {
    while (this.cleanups.size > 0) {
      await Promise.all(Array.from(this.cleanups))
    }
  }

  private enqueueCleanup(event: ThreadDeletedEvent) {
    const threadId = event.payload.threadId
    // A redelivered batch (or the same thread appearing twice in a cascade) must
    // not race a second stop against the binding the first one is releasing.
    if (this.cleaningThreads.has(threadId)) return

    this.cleaningThreads.add(threadId)
    let cleanup: Promise<void>
    cleanup = this.cleanupThread(event).finally(() => {
      this.cleaningThreads.delete(threadId)
      this.cleanups.delete(cleanup)
    })
    this.cleanups.add(cleanup)
  }

  /**
   * Never rejects. `thread.deleted` is already durable by the time a reactor
   * sees it, so a failed stop is a field on this operation's wide event — not an
   * exception that would unwind a commit the engine cannot take back.
   */
  private async cleanupThread(event: ThreadDeletedEvent) {
    const startedAt = performance.now()
    const threadId = event.payload.threadId
    const binding = this.providerService.bindingForThread(threadId)
    const outcome = await this.releaseSession(threadId, binding)
    // The tombstone leaves the projection rows behind, so the message metadata
    // is still there to tell us which blobs the thread owned. Deleting a thread
    // is the only moment its images become unreclaimable garbage.
    const blobsReclaimed = await this.reclaimBlobs(threadId)
    // A session that ran in its own checkout leaves a whole worktree behind,
    // which no other deletion path reclaims — the row is a tombstone and the
    // directory outlives the app.
    const worktree = await this.reclaimWorktree(threadId)
    const cleanup = {
      ...orchestrationEventSummary(event),
      bindingStatus: binding?.status ?? null,
      blobsReclaimed,
      durationMs: elapsedMs(startedAt),
      ...worktree,
      ...outcome,
    }

    if ('error' in outcome) {
      recordChatPipelineWarning('chat.pipeline.thread_deletion_reactor.cleanup', cleanup)
      return
    }

    recordChatPipelineInfo('chat.pipeline.thread_deletion_reactor.cleanup', cleanup)
  }

  /**
   * Never rejects, same as the session stop: a blob that cannot be unlinked is
   * a field on the wide event, not a reason to unwind a durable deletion.
   */
  private async reclaimBlobs(threadId: ThreadId) {
    try {
      const attachments = this.threadAttachments(threadId)

      return await deleteAttachmentBlobs({ attachments, attachmentsDir: this.attachmentsDir })
    } catch {
      return 0
    }
  }

  /**
   * Removes the session's own checkout, and only ever that.
   *
   * Never forced. A worktree with uncommitted changes is left on disk and named
   * on the wide event instead: the user deleted a conversation, which is not
   * the same as consenting to throw away the code that came out of it. The
   * worktree list is where they find it afterwards.
   */
  private async reclaimWorktree(threadId: ThreadId) {
    if (!this.worktrees) return { worktreeRemoved: false }

    const target = this.threadWorktree(threadId)
    if (!target) return { worktreeRemoved: false }

    try {
      await this.worktrees.remove({
        force: false,
        path: target.workspaceRoot,
        worktreePath: target.worktreePath,
      })

      return { worktreeRemoved: true }
    } catch (error) {
      return { worktreeRemoved: false, worktreeRetained: target.worktreePath, worktreeError: error }
    }
  }

  /** Null unless the thread had a checkout of its own — the project root is not one. */
  private threadWorktree(threadId: ThreadId) {
    const row = this.database
      .select({
        projectId: projectionThreads.projectId,
        worktreePath: projectionThreads.worktreePath,
      })
      .from(projectionThreads)
      .where(eq(projectionThreads.threadId, threadId))
      .get()
    if (!row?.worktreePath) return null

    const project = this.database
      .select({ workspaceRoot: projectionProjects.workspaceRoot })
      .from(projectionProjects)
      .where(eq(projectionProjects.projectId, row.projectId))
      .get()
    if (!project) return null
    // The overwhelmingly common case, and the one that must never be removed:
    // a thread with no worktree of its own is stamped with the project root.
    if (project.workspaceRoot === row.worktreePath) return null

    return { workspaceRoot: project.workspaceRoot, worktreePath: row.worktreePath }
  }

  private threadAttachments(threadId: ThreadId): ChatAttachment[] {
    const rows = this.database
      .select({ attachmentsJson: projectionThreadMessages.attachmentsJson })
      .from(projectionThreadMessages)
      .where(eq(projectionThreadMessages.threadId, threadId))
      .all()

    return rows.flatMap((row) => parseAttachmentsJson(row.attachmentsJson))
  }

  private async releaseSession(
    threadId: ThreadId,
    binding: ProviderRuntimeBindingWithMetadata | null,
  ) {
    // A thread that never ran a turn — or a delete seen twice — has nothing to
    // stop, and asking the adapter anyway would invent a failure to report.
    if (!binding) return { sessionStopped: false, skipReason: 'no-binding' as const }
    if (binding.status === 'stopped') {
      return { sessionStopped: false, skipReason: 'already-stopped' as const }
    }

    try {
      const stopped = await this.providerService.stopSession({ threadId })

      return { ...providerBindingSummary(stopped), sessionStopped: stopped !== null }
    } catch (error) {
      return { error, sessionStopped: false }
    }
  }
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
}

/** A row whose attachments no longer parse contributes nothing, never a failure. */
function parseAttachmentsJson(attachmentsJson: string): ChatAttachment[] {
  try {
    const parsed: unknown = JSON.parse(attachmentsJson)
    if (!Array.isArray(parsed)) return []

    return parsed as ChatAttachment[]
  } catch {
    return []
  }
}
