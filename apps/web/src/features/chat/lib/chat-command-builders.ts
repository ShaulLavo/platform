import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  commandIdSchema,
  messageIdSchema,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
  type CommandId,
  type ChatAttachment,
  type ChatAttachmentUpload,
  type InteractionMode,
  type MessageId,
  type ModelSelection,
  type OrchestrationMessage,
  type ProjectCreateCommand,
  type ProjectId,
  type ProjectMetaUpdateCommand,
  type RuntimeMode,
  type ThreadArchiveCommand,
  type ThreadCheckpointRevertCommand,
  type ThreadDeleteCommand,
  type ThreadId,
  type ThreadMetaUpdateCommand,
  type ThreadSessionStopCommand,
  type ThreadTurnInterruptCommand,
  type ThreadTurnStartCommand,
  type ThreadUnarchiveCommand,
  type TurnId,
} from '@workspace/contracts'
import * as v from 'valibot'

const THREAD_TITLE_MAX_LENGTH = 48
const SENSITIVE_THREAD_TITLE_WORDS = new Set([
  'apikey',
  'bearer',
  'credential',
  'credentials',
  'keystore',
  'oauth',
  'passwd',
  'password',
  'passwords',
  'pat',
  'secret',
  'secrets',
  'token',
  'tokens',
])
const SENSITIVE_THREAD_TITLE_COMPOUNDS = ['accesskey', 'apikey', 'privatekey'] as const

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
    defaultModelSelection: null,
    projectId: workspaceProjectId(rootPath),
    title: workspaceProjectTitle(rootPath),
    type: 'project.create',
    workspaceRoot: rootPath,
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
  attachments?: ChatAttachmentUpload[]
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
      // Metadata only: the base64 bytes belong on the wire, not in the
      // projection the timeline renders from.
      attachments: attachments.map(chatAttachmentMetadata),
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
  modelSelection,
  projectId,
  rootPath,
  runtimeMode = DEFAULT_RUNTIME_MODE,
  text,
}: {
  attachments?: ChatAttachmentUpload[]
  createdAt: string
  interactionMode?: InteractionMode
  modelSelection: ModelSelection
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

export function createThreadSessionStopCommand({
  createdAt,
  threadId,
}: {
  createdAt: string
  threadId: ThreadId
}): ThreadSessionStopCommand {
  return {
    commandId: createCommandId(),
    createdAt,
    threadId,
    type: 'thread.session.stop',
  }
}

/**
 * Sets only the title. Every other field is deliberately omitted so the
 * projection's compact patch leaves the model, branch, and worktree alone.
 * The title must already be trimmed and non-empty — the server rejects blanks.
 */
export function createThreadRenameCommand({
  threadId,
  title,
  updatedAt,
}: {
  threadId: ThreadId
  title: string
  updatedAt: string
}): ThreadMetaUpdateCommand {
  return {
    commandId: createCommandId(),
    threadId,
    title,
    type: 'thread.meta.update',
    updatedAt,
  }
}

export function createThreadArchiveCommand({
  archivedAt,
  threadId,
}: {
  archivedAt: string
  threadId: ThreadId
}): ThreadArchiveCommand {
  return {
    archivedAt,
    commandId: createCommandId(),
    threadId,
    type: 'thread.archive',
  }
}

export function createThreadUnarchiveCommand({
  threadId,
  updatedAt,
}: {
  threadId: ThreadId
  updatedAt: string
}): ThreadUnarchiveCommand {
  return {
    commandId: createCommandId(),
    threadId,
    type: 'thread.unarchive',
    updatedAt,
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

export function createCheckpointRevertCommand({
  createdAt,
  threadId,
  turnCount,
}: {
  createdAt: string
  threadId: ThreadId
  turnCount: number
}): ThreadCheckpointRevertCommand {
  return {
    commandId: createCommandId(),
    createdAt,
    threadId,
    turnCount,
    type: 'thread.checkpoint.revert',
  }
}

/**
 * Updates only the project's default model. Title and workspaceRoot are deliberately
 * omitted so the projection's compact patch leaves them untouched.
 */
export function createProjectDefaultModelCommand({
  defaultModelSelection,
  projectId,
  updatedAt,
}: {
  defaultModelSelection: ModelSelection
  projectId: ProjectId
  updatedAt: string
}): ProjectMetaUpdateCommand {
  return {
    commandId: createCommandId(),
    defaultModelSelection,
    projectId,
    type: 'project.meta.update',
    updatedAt,
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

function chatAttachmentMetadata(attachment: ChatAttachmentUpload): ChatAttachment {
  return {
    id: attachment.id,
    mimeType: attachment.mimeType,
    name: attachment.name,
    sizeBytes: attachment.sizeBytes,
    type: attachment.type,
  }
}

function createCommandId(): CommandId {
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
  if (hasSensitiveThreadTitleWord(title)) return undefined
  if (title.length <= THREAD_TITLE_MAX_LENGTH) return title

  return `${title.slice(0, THREAD_TITLE_MAX_LENGTH - 1).trim()}...`
}

function hasSensitiveThreadTitleWord(title: string) {
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  if (words.some((word) => SENSITIVE_THREAD_TITLE_WORDS.has(word))) return true

  const compact = words.join('')
  return SENSITIVE_THREAD_TITLE_COMPOUNDS.some((word) => compact.includes(word))
}

function stablePathHash(value: string) {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}
