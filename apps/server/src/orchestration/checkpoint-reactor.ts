import { commandIdSchema, type MessageId, type ThreadId, type TurnId } from '@workspace/contracts'
import * as v from 'valibot'

import { GitCheckpointStore } from '../git/checkpoint-store'
import type { GitService } from '../git/service'
import type { ProviderService } from '../provider/provider-service'
import { checkpointFilesFromDiffs } from './checkpoint-files'
import { checkpointRefForThreadTurn } from './checkpoint-refs'
import {
  orchestrationEventSummary,
  recordChatPipelineInfo,
  recordChatPipelineWarning,
} from './orchestration-logging'
import { BoundedTtlCache } from './provider-runtime-buffers'
import {
  settledTurnStateForSessionStatus,
  type OrchestrationProjectedThread,
  type OrchestrationReadModel,
} from './read-model'
import type { OrchestrationCommand, OrchestrationEvent } from './schemas'
import type { OrchestrationDomainEventReactor } from './streams'

type CheckpointTask = {
  event: OrchestrationEvent
  kind: 'baseline' | 'turn'
  threadId: ThreadId
  turnId: TurnId | null
}

type CheckpointOutcome = Record<string, unknown>

const HANDLED_EVENT_ID_MAX = 20_000
const HANDLED_EVENT_ID_TTL_MS = 30 * 60 * 1000

/**
 * Turns a committed turn into a git checkpoint. Nothing else writes
 * `thread.turn.diff.complete`, so without this reactor `checkpointByTurnId` is
 * empty forever: no changed-files section, no turn diff, and a revert with no
 * ref to restore.
 *
 * Two triggers, both domain events, because the provider runtime stream is a
 * shared subscription that the engine already drains through ingestion:
 *
 * - `thread.turn-start-requested` captures the *baseline* the turn will be
 *   diffed against. Turn one has nothing to compare to unless the worktree was
 *   photographed before the agent touched it; every later turn reuses the
 *   previous turn's checkpoint and the capture is skipped.
 * - a `thread.session-set` that settles the live turn is the turn ending. The
 *   worktree at that moment is the turn's result, so it becomes `turn/N`.
 *
 * Mid-turn `turn.diff.updated` placeholders (dispatched by ingestion with
 * status `missing`) keep the changed-files list live while the agent works;
 * this reactor is what upgrades the last of them to a real ref. The projection
 * refuses the reverse, so a late placeholder can never undo a capture.
 */
export class CheckpointReactor implements OrchestrationDomainEventReactor {
  readonly name = 'checkpoint-reactor'
  private readonly dispatch: (command: OrchestrationCommand) => Promise<unknown>
  private readonly getReadModel: () => OrchestrationReadModel
  // A replayed batch — the engine republishes events it committed before a
  // failed dispatch threw — must not photograph the worktree a second time.
  private readonly handledEventIds: BoundedTtlCache<string, true>
  private readonly providerService: ProviderService
  private readonly store: GitCheckpointStore
  private readonly worker: DrainableCheckpointWorker

  constructor({
    dispatch,
    getReadModel,
    git,
    now,
    providerService,
  }: {
    dispatch: (command: OrchestrationCommand) => Promise<unknown>
    getReadModel: () => OrchestrationReadModel
    git: GitService
    now?: () => number
    providerService: ProviderService
  }) {
    this.dispatch = dispatch
    this.getReadModel = getReadModel
    this.handledEventIds = new BoundedTtlCache({
      capacity: HANDLED_EVENT_ID_MAX,
      now,
      ttlMs: HANDLED_EVENT_ID_TTL_MS,
    })
    this.providerService = providerService
    this.store = new GitCheckpointStore(git)
    this.worker = new DrainableCheckpointWorker((task) => this.runTask(task))
  }

  handleEvents(events: OrchestrationEvent[]) {
    for (const event of events) {
      const task = this.taskForEvent(event)
      if (!task) continue
      if (this.handledEventIds.has(event.eventId)) continue

      this.handledEventIds.set(event.eventId, true)
      this.worker.enqueue(task)
    }
  }

  /** Test/shutdown hook: settle every in-flight capture. */
  drain() {
    return this.worker.drain()
  }

  /**
   * Runs while the dispatch that produced the event is still on the stack, so
   * the read model is exactly the post-event state. Everything the async
   * capture cannot re-derive later — which turn just ended — is resolved here.
   */
  private taskForEvent(event: OrchestrationEvent): CheckpointTask | null {
    if (event.type === 'thread.turn-start-requested') {
      return { event, kind: 'baseline', threadId: event.payload.threadId, turnId: null }
    }
    if (event.type !== 'thread.session-set') return null
    if (!settledTurnStateForSessionStatus(event.payload.session.status)) return null

    const turnId = this.settledTurnId(event.payload.threadId)
    if (!turnId) return null

    return { event, kind: 'turn', threadId: event.payload.threadId, turnId }
  }

  private settledTurnId(threadId: ThreadId) {
    const thread = this.getReadModel().threads.get(threadId)
    if (!thread || thread.deletedAt) return null

    const turnId = thread.latestTurn?.turnId
    if (!turnId) return null
    // A session that settles again — a stop after the turn, a restart — must not
    // re-photograph a worktree the user has kept editing since.
    if (thread.checkpointByTurnId[turnId]?.status === 'ready') return null

    return turnId
  }

  private async runTask(task: CheckpointTask) {
    const startedAt = performance.now()
    const outcome = await this.taskOutcome(task)
    const capture = {
      ...orchestrationEventSummary(task.event),
      checkpointKind: task.kind,
      durationMs: elapsedMs(startedAt),
      threadId: task.threadId,
      turnId: task.turnId,
      ...outcome,
    }

    if ('error' in outcome) {
      recordChatPipelineWarning('chat.pipeline.checkpoint_reactor.capture', capture)
      return
    }

    recordChatPipelineInfo('chat.pipeline.checkpoint_reactor.capture', capture)
  }

  /**
   * Never rejects. The turn it describes is already durable and already shown
   * to the user, so a git failure is a field on this operation's wide event —
   * never an exception that would leave the turn looking unfinished.
   */
  private async taskOutcome(task: CheckpointTask): Promise<CheckpointOutcome> {
    try {
      if (task.kind === 'baseline') return await this.captureBaseline(task)

      return await this.captureTurn(task)
    } catch (error) {
      return { captured: false, error }
    }
  }

  private async captureBaseline(task: CheckpointTask): Promise<CheckpointOutcome> {
    const context = this.checkpointContext(task.threadId)
    if (!context) return { captured: false, skipReason: 'no-workspace' }

    const checkpointTurnCount = maxCheckpointTurnCount(context.thread)
    const checkpointRef = checkpointRefForThreadTurn(task.threadId, checkpointTurnCount)
    if (await this.store.has({ path: context.workspacePath, ref: checkpointRef })) {
      return { captured: false, checkpointRef, checkpointTurnCount, skipReason: 'baseline-exists' }
    }

    const checkpointCommit = await this.store.capture({
      path: context.workspacePath,
      ref: checkpointRef,
    })

    return { captured: true, checkpointCommit, checkpointRef, checkpointTurnCount }
  }

  private async captureTurn(task: CheckpointTask): Promise<CheckpointOutcome> {
    const turnId = task.turnId
    if (!turnId) return { captured: false, skipReason: 'no-turn' }

    const context = this.checkpointContext(task.threadId)
    if (!context) return { captured: false, skipReason: 'no-workspace' }

    const existing = context.thread.checkpointByTurnId[turnId]
    if (existing?.status === 'ready') return { captured: false, skipReason: 'already-captured' }

    // A mid-turn placeholder already claimed a slot for this turn; taking a new
    // one would leave a gap that the diff routes read as a missing checkpoint.
    const checkpointTurnCount =
      existing?.checkpointTurnCount ?? maxCheckpointTurnCount(context.thread) + 1
    const checkpointRef = checkpointRefForThreadTurn(task.threadId, checkpointTurnCount)
    const checkpointCommit = await this.store.capture({
      path: context.workspacePath,
      ref: checkpointRef,
    })
    const summary = await this.turnFileSummary({
      checkpointRef,
      checkpointTurnCount,
      threadId: task.threadId,
      workspacePath: context.workspacePath,
    })

    await this.dispatch({
      assistantMessageId: assistantMessageIdForTurn(context.thread, turnId),
      checkpointRef,
      checkpointTurnCount,
      commandId: checkpointCommandId(task.event.eventId),
      completedAt: checkpointTimestamp(task.event),
      createdAt: checkpointTimestamp(task.event),
      files: summary.files,
      status: 'ready',
      threadId: task.threadId,
      turnId,
      type: 'thread.turn.diff.complete',
    })

    const captured = {
      captured: true,
      checkpointCommit,
      checkpointRef,
      checkpointTurnCount,
      fileCount: summary.files.length,
    }
    if (!summary.error) return captured

    return { ...captured, error: summary.error }
  }

  /**
   * The stat line for the turn. A failure here costs the changed-files summary
   * and nothing else: the ref is already written, so the diff routes and revert
   * still work off it.
   */
  private async turnFileSummary(input: {
    checkpointRef: string
    checkpointTurnCount: number
    threadId: ThreadId
    workspacePath: string
  }) {
    const fromRef = checkpointRefForThreadTurn(
      input.threadId,
      Math.max(0, input.checkpointTurnCount - 1),
    )

    try {
      const diffs = await this.store.diff({
        fallbackFromToHead: true,
        fromRef,
        ignoreWhitespace: false,
        path: input.workspacePath,
        toRef: input.checkpointRef,
      })

      return { error: null, files: checkpointFilesFromDiffs(diffs) }
    } catch (error) {
      return { error, files: [] }
    }
  }

  private checkpointContext(threadId: ThreadId) {
    const model = this.getReadModel()
    const thread = model.threads.get(threadId)
    if (!thread || thread.deletedAt) return null

    const project = model.projects.get(thread.projectId)
    if (!project) return null

    return {
      thread,
      workspacePath: this.workspacePathForThread(thread, project.workspaceRoot),
    }
  }

  /**
   * The running session's cwd wins: an agent may have been launched against a
   * worktree the thread row does not know about yet, and checkpointing the
   * wrong tree is worse than not checkpointing at all.
   */
  private workspacePathForThread(thread: OrchestrationProjectedThread, workspaceRoot: string) {
    const payload = this.providerService.bindingForThread(thread.id)?.runtimePayload

    return payload?.cwd ?? thread.worktreePath ?? workspaceRoot
  }
}

function maxCheckpointTurnCount(thread: OrchestrationProjectedThread) {
  let maxTurnCount = 0

  for (const checkpoint of Object.values(thread.checkpointByTurnId)) {
    maxTurnCount = Math.max(maxTurnCount, checkpoint.checkpointTurnCount)
  }

  return maxTurnCount
}

function assistantMessageIdForTurn(
  thread: OrchestrationProjectedThread,
  turnId: TurnId,
): MessageId | undefined {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index]
    if (!message) continue
    if (message.role !== 'assistant') continue
    if (message.turnId !== turnId) continue

    return message.id
  }

  return undefined
}

function checkpointTimestamp(event: OrchestrationEvent) {
  if (event.type === 'thread.session-set') return event.payload.session.updatedAt

  return event.occurredAt
}

function checkpointCommandId(eventId: string) {
  return v.parse(commandIdSchema, `checkpoint:${eventId}:turn-diff-complete`)
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
}

/**
 * Captures run one at a time per process: two `git add --all` passes over the
 * same worktree race on the object store, and the turn count a capture claims
 * is read from the read model at the moment it runs.
 */
class DrainableCheckpointWorker {
  private readonly handler: (task: CheckpointTask) => Promise<void>
  private pending = 0
  private queue = Promise.resolve()

  constructor(handler: (task: CheckpointTask) => Promise<void>) {
    this.handler = handler
  }

  enqueue(task: CheckpointTask) {
    this.pending += 1
    const next = this.queue.then(() => this.handler(task)).finally(() => (this.pending -= 1))
    this.queue = next.then(noop, noop)
  }

  async drain() {
    // Re-read `queue` each pass: a capture dispatches, and a dispatch can enqueue
    // the next task behind the one being awaited.
    while (this.pending > 0) {
      await this.queue
    }
  }
}

function noop() {}
