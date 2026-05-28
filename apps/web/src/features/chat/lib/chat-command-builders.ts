import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  commandIdSchema,
  messageIdSchema,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
  type CommandId,
  type ChatAttachment,
  type InteractionMode,
  type MessageId,
  type ModelSelection,
  type OrchestrationMessage,
  type ProjectCreateCommand,
  type ProjectId,
  type RuntimeMode,
  type ThreadCreateCommand,
  type ThreadDeleteCommand,
  type ThreadId,
  type ThreadTurnInterruptCommand,
  type ThreadTurnStartCommand,
  type TurnId,
} from '@workspace/contracts'
import * as v from 'valibot'

const DEFAULT_CODEX_MODEL = 'gpt-5.5'
const THREAD_TITLE_MAX_LENGTH = 48

export type ChatTurnSubmission = {
  command: ThreadTurnStartCommand
  optimisticMessage: OrchestrationMessage
}

export type DraftThreadSubmission = {
  command: ThreadTurnStartCommand
  optimisticMessage: OrchestrationMessage
}

export function createWorkspaceProjectCommand({
  createdAt,
  rootPath,
}: {
  createdAt: string
  rootPath: string
}): ProjectCreateCommand {
  return {
    commandId: createCommandId(),
    createdAt,
    defaultModelSelection: defaultChatModelSelection(),
    projectId: workspaceProjectId(rootPath),
    title: workspaceProjectTitle(rootPath),
    type: 'project.create',
    workspaceRoot: rootPath,
  }
}

export function createThreadCommand({
  createdAt,
  projectId,
  rootPath,
  title,
}: {
  createdAt: string
  projectId: ProjectId
  rootPath: string
  title?: string
}): ThreadCreateCommand {
  return {
    branch: null,
    commandId: createCommandId(),
    createdAt,
    interactionMode: DEFAULT_INTERACTION_MODE,
    modelSelection: defaultChatModelSelection(),
    projectId,
    runtimeMode: DEFAULT_RUNTIME_MODE,
    threadId: createThreadId(),
    title: cleanThreadTitle(title) ?? 'New chat',
    type: 'thread.create',
    worktreePath: rootPath,
  }
}

export function createTurnSubmission({
  attachments = [],
  createdAt,
  interactionMode,
  modelSelection,
  runtimeMode,
  text,
  threadId,
}: {
  attachments?: ChatAttachment[]
  createdAt: string
  interactionMode: InteractionMode
  modelSelection: ModelSelection
  runtimeMode: RuntimeMode
  text: string
  threadId: ThreadId
}): ChatTurnSubmission {
  const commandId = createCommandId()
  const messageId = createMessageId()
  const turnId = createTurnId()

  return {
    command: {
      commandId,
      createdAt,
      interactionMode,
      message: {
        attachments,
        messageId,
        role: 'user',
        text,
      },
      modelSelection,
      runtimeMode,
      threadId,
      titleSeed: threadTitleFromPrompt(text),
      turnId,
      type: 'thread.turn.start',
    },
    optimisticMessage: {
      attachments,
      createdAt,
      id: messageId,
      role: 'user',
      streaming: false,
      text,
      threadId,
      turnId,
      updatedAt: createdAt,
    },
  }
}

export function createDraftThreadSubmission({
  attachments = [],
  createdAt,
  interactionMode = DEFAULT_INTERACTION_MODE,
  modelSelection = defaultChatModelSelection(),
  projectId,
  rootPath,
  runtimeMode = DEFAULT_RUNTIME_MODE,
  text,
}: {
  attachments?: ChatAttachment[]
  createdAt: string
  interactionMode?: InteractionMode
  modelSelection?: ModelSelection
  projectId: ProjectId
  rootPath: string
  runtimeMode?: RuntimeMode
  text: string
}): DraftThreadSubmission {
  const threadId = createThreadId()
  const title = threadTitleFromPrompt(text) ?? 'New chat'
  const submission = createTurnSubmission({
    attachments,
    createdAt,
    interactionMode,
    modelSelection,
    runtimeMode,
    text,
    threadId,
  })

  return {
    command: {
      ...submission.command,
      bootstrap: {
        createThread: {
          branch: null,
          createdAt,
          interactionMode,
          modelSelection,
          projectId,
          runtimeMode,
          title,
          worktreePath: rootPath,
        },
      },
      titleSeed: title,
    },
    optimisticMessage: submission.optimisticMessage,
  }
}

export function createThreadDeleteCommand({
  deletedAt,
  threadId,
}: {
  deletedAt: string
  threadId: ThreadId
}): ThreadDeleteCommand {
  return {
    commandId: createCommandId(),
    deletedAt,
    threadId,
    type: 'thread.delete',
  }
}

export function createThreadInterruptCommand({
  createdAt,
  threadId,
  turnId,
}: {
  createdAt: string
  threadId: ThreadId
  turnId?: TurnId
}): ThreadTurnInterruptCommand {
  return {
    commandId: createCommandId(),
    createdAt,
    threadId,
    turnId,
    type: 'thread.turn.interrupt',
  }
}

export function defaultChatModelSelection(): ModelSelection {
  return {
    model: DEFAULT_CODEX_MODEL,
    providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
  }
}

export function workspaceProjectId(rootPath: string): ProjectId {
  return v.parse(projectIdSchema, `project-${stablePathHash(rootPath)}`)
}

export function workspaceProjectTitle(rootPath: string) {
  const normalized = rootPath.replaceAll(/\/+$/g, '')
  const leaf = normalized.split('/').filter(Boolean).at(-1)

  return leaf ?? 'Workspace'
}

export function threadTitleFromPrompt(prompt: string) {
  return cleanThreadTitle(prompt.split(/\r?\n/)[0])
}

export function createCommandId(): CommandId {
  return v.parse(commandIdSchema, `command-${crypto.randomUUID()}`)
}

function createThreadId(): ThreadId {
  return v.parse(threadIdSchema, `thread-${crypto.randomUUID()}`)
}

function createMessageId(): MessageId {
  return v.parse(messageIdSchema, `message-${crypto.randomUUID()}`)
}

function createTurnId(): TurnId {
  return v.parse(turnIdSchema, `turn-${crypto.randomUUID()}`)
}

function cleanThreadTitle(value: string | undefined) {
  const title = value?.trim().replaceAll(/\s+/g, ' ')
  if (!title) return undefined
  if (title.length <= THREAD_TITLE_MAX_LENGTH) return title

  return `${title.slice(0, THREAD_TITLE_MAX_LENGTH - 1).trim()}...`
}

function stablePathHash(value: string) {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}
