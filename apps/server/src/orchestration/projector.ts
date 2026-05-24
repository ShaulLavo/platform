import type { OrchestrationEvent, OrchestrationMessage } from './schemas'
import {
  cloneReadModel,
  createEmptyReadModel,
  setLatestTurnState,
  setThreadSession,
  type OrchestrationProjectedThread,
  type OrchestrationReadModel,
} from './read-model'

export function projectEvents(events: OrchestrationEvent[], base = createEmptyReadModel()) {
  let model = cloneReadModel(base)

  for (const event of events) {
    model = projectEvent(event, model)
  }

  return model
}

export function projectEvent(event: OrchestrationEvent, model: OrchestrationReadModel) {
  const next = cloneReadModel(model)
  next.sequence = Math.max(next.sequence, event.sequence)

  applyEvent(event, next)

  return next
}

function applyEvent(event: OrchestrationEvent, model: OrchestrationReadModel) {
  switch (event.type) {
    case 'project.created':
      model.projects.set(event.payload.projectId, {
        defaultModelSelection: event.payload.defaultModelSelection,
        deletedAt: null,
        id: event.payload.projectId,
        title: event.payload.title,
        workspaceRoot: event.payload.workspaceRoot,
        createdAt: event.payload.createdAt,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'project.meta-updated':
      updateProject(event, model)
      return
    case 'project.deleted':
      updateProjectValue(model, event.payload.projectId, {
        deletedAt: event.payload.deletedAt,
        updatedAt: event.payload.deletedAt,
      })
      return
    case 'thread.created':
      model.threads.set(event.payload.threadId, createdThread(event))
      return
    case 'thread.message-sent':
      upsertMessage(event, model)
      return
    case 'thread.turn-start-requested':
      updateThread(model, event.payload.threadId, (thread) => ({
        ...thread,
        interactionMode: event.payload.interactionMode ?? thread.interactionMode,
        latestTurn: {
          assistantMessageId: null,
          completedAt: null,
          requestedAt: event.payload.createdAt,
          sourceProposedPlan: event.payload.sourceProposedPlan,
          startedAt: null,
          state: 'running',
          turnId: event.payload.turnId,
        },
        runtimeMode: event.payload.runtimeMode ?? thread.runtimeMode,
        updatedAt: event.payload.createdAt,
      }))
      return
    case 'thread.session-set':
      updateThread(model, event.payload.threadId, (thread) =>
        setThreadSession(thread, event.payload.session),
      )
      return
    case 'thread.activity-appended':
      updateThread(model, event.payload.threadId, (thread) => ({
        ...thread,
        activities: [...thread.activities, { ...event.payload.activity, sequence: event.sequence }],
        updatedAt: event.payload.activity.createdAt,
      }))
      return
    case 'thread.meta-updated':
      updateThreadMeta(event, model)
      return
    case 'thread.deleted':
      updateThreadValue(model, event.payload.threadId, {
        deletedAt: event.payload.deletedAt,
        updatedAt: event.payload.deletedAt,
      })
      return
    case 'thread.archived':
      updateThreadValue(model, event.payload.threadId, {
        archivedAt: event.payload.archivedAt,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.unarchived':
      updateThreadValue(model, event.payload.threadId, {
        archivedAt: null,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.runtime-mode-set':
      updateThreadValue(model, event.payload.threadId, {
        runtimeMode: event.payload.runtimeMode,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.interaction-mode-set':
      updateThreadValue(model, event.payload.threadId, {
        interactionMode: event.payload.interactionMode,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.turn-interrupt-requested':
      updateThread(model, event.payload.threadId, (thread) =>
        setLatestTurnState(thread, 'interrupted', event.payload.createdAt),
      )
      return
    case 'thread.turn-diff-completed':
      updateThread(model, event.payload.threadId, (thread) =>
        setLatestTurnState(thread, 'completed', event.payload.completedAt),
      )
      return
    case 'thread.session-stop-requested':
      updateThread(model, event.payload.threadId, (thread) => setThreadSession(thread, null))
      return
    case 'thread.proposed-plan-upserted':
      updateThreadValue(model, event.payload.threadId, { hasActionableProposedPlan: true })
      return
    case 'thread.reverted':
    case 'thread.approval-response-requested':
    case 'thread.user-input-response-requested':
      return
  }
}

function createdThread(event: Extract<OrchestrationEvent, { type: 'thread.created' }>) {
  return {
    activities: [],
    archivedAt: null,
    branch: event.payload.branch,
    createdAt: event.payload.createdAt,
    deletedAt: null,
    hasActionableProposedPlan: false,
    id: event.payload.threadId,
    interactionMode: event.payload.interactionMode,
    latestTurn: null,
    latestUserMessageAt: null,
    messages: [],
    modelSelection: event.payload.modelSelection,
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
    projectId: event.payload.projectId,
    runtimeMode: event.payload.runtimeMode,
    session: null,
    title: event.payload.title,
    updatedAt: event.payload.updatedAt,
    worktreePath: event.payload.worktreePath,
  } satisfies OrchestrationProjectedThread
}

function updateProject(
  event: Extract<OrchestrationEvent, { type: 'project.meta-updated' }>,
  model: OrchestrationReadModel,
) {
  updateProjectValue(model, event.payload.projectId, {
    defaultModelSelection: event.payload.defaultModelSelection,
    title: event.payload.title,
    updatedAt: event.payload.updatedAt,
    workspaceRoot: event.payload.workspaceRoot,
  })
}

function updateThreadMeta(
  event: Extract<OrchestrationEvent, { type: 'thread.meta-updated' }>,
  model: OrchestrationReadModel,
) {
  updateThreadValue(model, event.payload.threadId, {
    branch: event.payload.branch,
    modelSelection: event.payload.modelSelection,
    title: event.payload.title,
    updatedAt: event.payload.updatedAt,
    worktreePath: event.payload.worktreePath,
  })
}

function upsertMessage(
  event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
  model: OrchestrationReadModel,
) {
  updateThread(model, event.payload.threadId, (thread) => {
    const messages = upsertThreadMessage(thread.messages, event)

    return {
      ...thread,
      latestUserMessageAt:
        event.payload.role === 'user' ? event.payload.createdAt : thread.latestUserMessageAt,
      messages,
      updatedAt: event.payload.updatedAt,
    }
  })
}

function upsertThreadMessage(
  messages: OrchestrationMessage[],
  event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
) {
  const existing = messages.find((message) => message.id === event.payload.messageId)
  if (!existing) return [...messages, messageFromEvent(event)]

  return messages.map((message) => {
    if (message.id !== event.payload.messageId) return message

    return {
      ...message,
      streaming: event.payload.streaming,
      text: event.payload.text ? `${message.text}${event.payload.text}` : message.text,
      updatedAt: event.payload.updatedAt,
    }
  })
}

function messageFromEvent(event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>) {
  return {
    attachments: event.payload.attachments,
    createdAt: event.payload.createdAt,
    id: event.payload.messageId,
    role: event.payload.role,
    streaming: event.payload.streaming,
    text: event.payload.text,
    threadId: event.payload.threadId,
    turnId: event.payload.turnId,
    updatedAt: event.payload.updatedAt,
  } satisfies OrchestrationMessage
}

function updateProjectValue(
  model: OrchestrationReadModel,
  projectId: string,
  patch: Partial<
    OrchestrationReadModel['projects'] extends Map<string, infer Project> ? Project : never
  >,
) {
  const project = model.projects.get(projectId)
  if (!project) return

  model.projects.set(projectId, compactUpdate(project, patch))
}

function updateThreadValue(
  model: OrchestrationReadModel,
  threadId: string,
  patch: Partial<OrchestrationProjectedThread>,
) {
  updateThread(model, threadId, (thread) => compactUpdate(thread, patch))
}

function updateThread(
  model: OrchestrationReadModel,
  threadId: string,
  update: (thread: OrchestrationProjectedThread) => OrchestrationProjectedThread,
) {
  const thread = model.threads.get(threadId)
  if (!thread) return

  model.threads.set(threadId, update(thread))
}

function compactUpdate<T extends object>(value: T, patch: Partial<T>) {
  const next = { ...value }

  for (const [key, candidate] of Object.entries(patch)) {
    if (candidate === undefined) continue
    Object.assign(next, { [key]: candidate })
  }

  return next
}
