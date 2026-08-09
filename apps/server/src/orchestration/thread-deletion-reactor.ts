import type { ThreadId } from '@workspace/contracts'
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
 * just released. This reactor is what turns the tombstone into an actual stop.
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
  private readonly providerService: ProviderService

  constructor({ providerService }: { providerService: ProviderService }) {
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
    const cleanup = {
      ...orchestrationEventSummary(event),
      bindingStatus: binding?.status ?? null,
      durationMs: elapsedMs(startedAt),
      ...outcome,
    }

    if ('error' in outcome) {
      recordChatPipelineWarning('chat.pipeline.thread_deletion_reactor.cleanup', cleanup)
      return
    }

    recordChatPipelineInfo('chat.pipeline.thread_deletion_reactor.cleanup', cleanup)
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
