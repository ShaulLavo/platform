import type {
  OrchestrationLatestTurn,
  OrchestrationProject,
  OrchestrationSession,
  OrchestrationThread,
} from '@workspace/contracts'

export type OrchestrationProjectedThread = OrchestrationThread & {
  hasActionableProposedPlan: boolean
  latestUserMessageAt: string | null
  pendingApprovalCount: number
  pendingUserInputCount: number
}

export type OrchestrationReadModel = {
  projects: Map<string, OrchestrationProject>
  sequence: number
  threads: Map<string, OrchestrationProjectedThread>
}

export function createEmptyReadModel(sequence = 0): OrchestrationReadModel {
  return {
    projects: new Map(),
    sequence,
    threads: new Map(),
  }
}

export function cloneReadModel(model: OrchestrationReadModel): OrchestrationReadModel {
  return {
    projects: new Map(model.projects),
    sequence: model.sequence,
    threads: new Map(
      Array.from(model.threads, ([threadId, thread]) => [threadId, cloneThread(thread)]),
    ),
  }
}

export function requireProject(model: OrchestrationReadModel, projectId: string) {
  const project = model.projects.get(projectId)
  if (!project || project.deletedAt) throw new Error(`Project not found: ${projectId}`)

  return project
}

export function requireThread(model: OrchestrationReadModel, threadId: string) {
  const thread = model.threads.get(threadId)
  if (!thread || thread.deletedAt) throw new Error(`Thread not found: ${threadId}`)

  return thread
}

export function setThreadSession(
  thread: OrchestrationProjectedThread,
  session: OrchestrationSession | null,
) {
  return {
    ...thread,
    session,
    updatedAt: session?.updatedAt ?? thread.updatedAt,
  }
}

export function setLatestTurnState(
  thread: OrchestrationProjectedThread,
  state: OrchestrationLatestTurn['state'],
  timestamp: string,
  assistantMessageId = thread.latestTurn?.assistantMessageId ?? null,
) {
  if (!thread.latestTurn) return thread

  return {
    ...thread,
    latestTurn: {
      ...thread.latestTurn,
      assistantMessageId,
      completedAt: state === 'running' ? thread.latestTurn.completedAt : timestamp,
      state,
    },
    updatedAt: timestamp,
  }
}

function cloneThread(thread: OrchestrationProjectedThread): OrchestrationProjectedThread {
  return {
    ...thread,
    activities: thread.activities.map((activity) => ({ ...activity })),
    messages: thread.messages.map((message) => ({ ...message })),
    session: thread.session ? { ...thread.session } : null,
  }
}
