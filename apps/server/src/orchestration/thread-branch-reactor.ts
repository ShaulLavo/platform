import type { ThreadId } from '@workspace/contracts'

import type { GitService } from '../git/service'
import { recordChatPipelineInfo, recordChatPipelineWarning } from './orchestration-logging'
import type { OrchestrationCommand, OrchestrationEvent } from './schemas'
import type { OrchestrationReadModel } from './read-model'

/**
 * Records which branch a thread's checkout is actually on.
 *
 * Nothing wrote `thread.branch` before this: the command carried the field, the
 * projection stored it, the rail and the stage header read it, and the only
 * producer sent `null` forever. Everything gated on it — the branch chip, and
 * with it every pull-request affordance — could not render at all.
 *
 * A reactor rather than the decider because reading a branch is filesystem work
 * and the decider is pure and runs inside the command transaction; and its own
 * reactor rather than a branch of `CheckpointReactor` because "photograph the
 * worktree" and "say which branch it is" are different jobs that happen to
 * share a moment.
 *
 * Stamped at thread creation and again at every turn start. That is not a
 * watcher — a branch switched in a terminal between turns is picked up on the
 * next one, not the instant it happens — but it is the honest answer at the
 * only moments the thread's identity is being established anyway.
 */
export class ThreadBranchReactor {
  readonly name = 'thread-branch-reactor'

  private readonly dispatch: (command: OrchestrationCommand) => Promise<unknown>
  private readonly getReadModel: () => OrchestrationReadModel
  private readonly git: GitService
  private readonly pending = new Set<Promise<void>>()

  constructor(options: {
    dispatch: (command: OrchestrationCommand) => Promise<unknown>
    getReadModel: () => OrchestrationReadModel
    git: GitService
  }) {
    this.dispatch = options.dispatch
    this.getReadModel = options.getReadModel
    this.git = options.git
  }

  handleEvents(events: OrchestrationEvent[]) {
    for (const event of events) {
      if (event.type !== 'thread.created' && event.type !== 'thread.turn-start-requested') continue

      this.enqueue(event.payload.threadId)
    }
  }

  /** Test and shutdown hook: settle every in-flight read. */
  async drain() {
    while (this.pending.size > 0) {
      await Promise.all(Array.from(this.pending))
    }
  }

  private enqueue(threadId: ThreadId) {
    const task = this.stampBranch(threadId).finally(() => this.pending.delete(task))
    this.pending.add(task)
  }

  /**
   * Never rejects. The turn this rides on is already durable and already on
   * screen; a repository that cannot be read is a missing branch chip, not a
   * failed turn.
   */
  private async stampBranch(threadId: ThreadId) {
    try {
      await this.applyBranch(threadId)
    } catch (error) {
      recordChatPipelineWarning('chat.pipeline.thread_branch.failed', { error, threadId })
    }
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

    recordChatPipelineInfo('chat.pipeline.thread_branch.stamped', { branch, threadId })
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
function branchCommandId(threadId: ThreadId, branch: string | null) {
  return `thread-branch:${threadId}:${branch ?? 'detached'}`
}
