import type { ThreadId } from '@workspace/contracts'

import type { GitService } from '../git/service'
import type { GitWorktreeService } from '../git/worktrees'
import { recordChatPipelineInfo, recordChatPipelineWarning } from './orchestration-logging'
import type { OrchestrationCommand, OrchestrationEvent } from './schemas'
import type { OrchestrationReadModel } from './read-model'

/**
 * Establishes where a session's work happens and what that place is called:
 * prepares its worktree when it asked for one, then records the branch.
 *
 * Nothing wrote `thread.branch` before this: the command carried the field, the
 * projection stored it, the rail and the stage header read it, and the only
 * producer sent `null` forever. Everything gated on it — the branch chip, and
 * with it every pull-request affordance — could not render at all.
 *
A reactor rather than the decider because both halves are filesystem work and
 * the decider is pure and runs inside the command transaction.
 *
 * One reactor rather than two, because the order matters: reading the branch
 * before the worktree exists stamps the session with the project root's branch,
 * and two reactors racing on `thread.created` would do exactly that.
 *
 * Stamped at thread creation and again at every turn start. That is not a
 * watcher — a branch switched in a terminal between turns is picked up on the
 * next one, not the instant it happens — but it is the honest answer at the
 * only moments the thread's identity is being established anyway.
 */
export class SessionCheckoutReactor {
  readonly name = 'session-checkout-reactor'

  private readonly dispatch: (command: OrchestrationCommand) => Promise<unknown>
  private readonly getReadModel: () => OrchestrationReadModel
  private readonly git: GitService
  private readonly chains = new Map<ThreadId, Promise<void>>()
  private readonly pending = new Set<Promise<void>>()
  /** Null when the engine was built without git, same as the deletion reactor. */
  private readonly worktrees: GitWorktreeService | null

  constructor(options: {
    dispatch: (command: OrchestrationCommand) => Promise<unknown>
    getReadModel: () => OrchestrationReadModel
    git: GitService
    worktrees?: GitWorktreeService | null
  }) {
    this.dispatch = options.dispatch
    this.getReadModel = options.getReadModel
    this.git = options.git
    this.worktrees = options.worktrees ?? null
  }

  handleEvents(events: OrchestrationEvent[]) {
    for (const event of events) {
      if (event.type === 'thread.created') {
        this.enqueue(event.payload.threadId, event.payload.requestWorktree === true)
        continue
      }
      if (event.type !== 'thread.turn-start-requested') continue

      this.enqueue(event.payload.threadId, false)
    }
  }

  /** Test and shutdown hook: settle every in-flight read. */
  async drain() {
    while (this.pending.size > 0) {
      await Promise.all(Array.from(this.pending))
    }
  }

  /**
   * Serialized per thread, because `thread.created` and
   * `thread.turn-start-requested` arrive in the same batch: run concurrently,
   * the plain stamp reads the project root while the worktree is still being
   * made and records the root's branch — the very race one reactor was supposed
   * to remove. Chaining makes the second see the first's result.
   */
  private enqueue(threadId: ThreadId, requestWorktree: boolean) {
    const previous = this.chains.get(threadId) ?? Promise.resolve()
    const task = previous.then(() => this.establish(threadId, requestWorktree))
    this.chains.set(threadId, task)
    this.pending.add(task)
    void task.finally(() => {
      this.pending.delete(task)
      if (this.chains.get(threadId) === task) this.chains.delete(threadId)
    })
  }

  /**
   * Never rejects. The turn this rides on is already durable and already on
   * screen; a repository that cannot be read is a missing branch chip, not a
   * failed turn.
   */
  private async establish(threadId: ThreadId, requestWorktree: boolean) {
    try {
      if (requestWorktree) await this.prepareWorktree(threadId)

      await this.applyBranch(threadId)
    } catch (error) {
      recordChatPipelineWarning('chat.pipeline.session_checkout.failed', { error, threadId })
    }
  }

  /**
   * Creates the session's checkout and records where it is.
   *
   * A failure leaves the thread on the project root rather than unwinding the
   * turn: the message is already durable and already on screen, and running in
   * the shared root is what every session did before worktrees existed — worse
   * than asked for, not broken.
   */
  private async prepareWorktree(threadId: ThreadId) {
    if (!this.worktrees) return

    const context = this.threadContext(threadId)
    if (!context) return

    const created = await this.worktrees.create({
      path: context.workspacePath,
      sessionId: worktreeSessionId(threadId),
    })
    await this.dispatch({
      commandId: `session-worktree:${threadId}`,
      threadId,
      type: 'thread.meta.update',
      worktreePath: created.worktree.absolutePath,
    } as OrchestrationCommand)

    recordChatPipelineInfo('chat.pipeline.session_checkout.worktree', {
      created: created.created,
      threadId,
      worktreePath: created.worktree.absolutePath,
    })
  }

  private async applyBranch(threadId: ThreadId) {
    const context = this.threadContext(threadId)
    if (!context) return

    const { repository } = await this.git.repo(context.workspacePath)
    const branch = repository?.branch ?? null
    // A detached head and a directory that is not a repository both read as
    // null, which is already what the thread holds — writing it again would be
    // an event per turn that changes nothing.
    if (branch === context.branch) return

    await this.dispatch({
      branch,
      commandId: branchCommandId(threadId, branch),
      // Compare-and-swap: two turns starting close together both read the same
      // repository, and without the guard the slower one can overwrite a branch
      // the user has since switched away from.
      expectedBranch: context.branch,
      threadId,
      type: 'thread.meta.update',
    } as OrchestrationCommand)

    recordChatPipelineInfo('chat.pipeline.session_checkout.stamped', { branch, threadId })
  }

  private threadContext(threadId: ThreadId) {
    const model = this.getReadModel()
    const thread = model.threads.get(threadId)
    if (!thread || thread.deletedAt) return null

    const project = model.projects.get(thread.projectId)
    if (!project) return null

    return {
      branch: thread.branch ?? null,
      // The session's own checkout when it has one: a worktree is on a
      // different branch than the project root by construction, and reading the
      // root would label the session with someone else's branch.
      workspacePath: thread.worktreePath ?? project.workspaceRoot,
    }
  }
}

/**
 * Deterministic, and keyed by the value being written: re-deciding the same
 * stamp is idempotent through the receipt cache, while a genuine branch change
 * is a new command rather than a replay of the old one.
 */
/** Stable per thread, which is what makes the create idempotent across replays. */
function worktreeSessionId(threadId: ThreadId) {
  return `thread-${threadId}`
}

function branchCommandId(threadId: ThreadId, branch: string | null) {
  return `thread-branch:${threadId}:${branch ?? 'detached'}`
}
