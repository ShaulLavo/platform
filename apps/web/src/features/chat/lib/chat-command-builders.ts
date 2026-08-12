import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  commandIdSchema,
  messageIdSchema,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
  type ApprovalRequestId,
  type CommandId,
  type ChatAttachment,
  type ChatAttachmentUpload,
  type InteractionMode,
  type MessageId,
  type ModelSelection,
  type OrchestrationMessage,
  type OrchestrationProjectScript,
  type ProjectCreateCommand,
  type ProjectDeleteCommand,
  type ProjectId,
  type ProjectMetaUpdateCommand,
  type ProjectReorderCommand,
  type ProviderApprovalDecision,
  type ProviderUserInputAnswers,
  type RuntimeMode,
  type ThreadApprovalRespondCommand,
  type ThreadArchiveCommand,
  type ThreadCheckpointRevertCommand,
  type ThreadDeleteCommand,
  type ThreadId,
  type ThreadInteractionModeSetCommand,
  type ThreadMetaUpdateCommand,
  type ThreadPinCommand,
  type ThreadPinReorderCommand,
  type ThreadRuntimeModeSetCommand,
  type ThreadSessionStopCommand,
  type ThreadTurnInterruptCommand,
  type ThreadTurnStartCommand,
  type ThreadUnarchiveCommand,
  type ThreadUserInputRespondCommand,
  type TurnId,
} from '@workspace/contracts'
import * as v from 'valibot'

import { appendTerminalContextsToPrompt, type TerminalContextSelection } from './terminal-context'

const NO_TERMINAL_CONTEXTS: readonly TerminalContextSelection[] = []
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

/**
 * The plan an implementation turn came from. The server stamps that plan
 * implemented when the turn starts, which is what stops every surface offering
 * "Implement" a second time.
 */
export type SourceProposedPlanReference = NonNullable<ThreadTurnStartCommand['sourceProposedPlan']>

export type ChatTurnSubmission = {
  command: ThreadTurnStartCommand
  optimisticMessage: OrchestrationMessage
}

export type DraftThreadSubmission = {
  command: ThreadTurnStartCommand
  optimisticMessage: OrchestrationMessage
}

export function createWorkspaceProjectCommand({
  rootPath,
}: {
  rootPath: string
}): ProjectCreateCommand {
  return {
    commandId: createCommandId(),
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
  sourceProposedPlan,
  terminalContexts = NO_TERMINAL_CONTEXTS,
  text,
  threadId,
}: {
  attachments?: ChatAttachmentUpload[]
  createdAt: string
  interactionMode: InteractionMode
  modelSelection: ModelSelection
  runtimeMode: RuntimeMode
  sourceProposedPlan?: SourceProposedPlanReference
  terminalContexts?: readonly TerminalContextSelection[]
  text: string
  threadId: ThreadId
}): ChatTurnSubmission {
  const commandId = createCommandId()
  const messageId = createMessageId()
  const turnId = createTurnId()
  // The serialized block is appended here rather than in the composer so the
  // title keeps reading the typed text: a send that is nothing but captured
  // output would otherwise name the thread `<terminal_context>`.
  const prompt = appendTerminalContextsToPrompt(text, terminalContexts)

  return {
    command: {
      commandId,
      interactionMode,
      message: {
        attachments,
        messageId,
        role: 'user',
        text: prompt,
      },
      modelSelection,
      runtimeMode,
      sourceProposedPlan,
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
      text: prompt,
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
  sourceProposedPlan,
  terminalContexts = NO_TERMINAL_CONTEXTS,
  text,
  title: titleOverride,
  worktree,
}: {
  attachments?: ChatAttachmentUpload[]
  createdAt: string
  interactionMode?: InteractionMode
  modelSelection: ModelSelection
  projectId: ProjectId
  rootPath: string
  runtimeMode?: RuntimeMode
  sourceProposedPlan?: SourceProposedPlanReference
  terminalContexts?: readonly TerminalContextSelection[]
  text: string
  /**
   * Overrides the title derived from the prompt. A turn the user did not type —
   * a plan handed to a new thread — would otherwise be named after the
   * instruction that carries it.
   */
  title?: string
  /**
   * The session's own checkout, when one was prepared for it. Absent means the
   * session shares the project root, which is what every session did before
   * worktrees were reachable.
   */
  worktree?: { branch: string | null; path: string }
}): DraftThreadSubmission {
  const threadId = createThreadId()
  const title = titleOverride ?? threadTitleFromPrompt(text) ?? 'New chat'
  const submission = createTurnSubmission({
    attachments,
    createdAt,
    interactionMode,
    modelSelection,
    runtimeMode,
    sourceProposedPlan,
    terminalContexts,
    text,
    threadId,
  })

  return {
    command: {
      ...submission.command,
      bootstrap: {
        createThread: {
          branch: worktree?.branch ?? null,
          interactionMode,
          modelSelection,
          projectId,
          runtimeMode,
          title,
          worktreePath: worktree?.path ?? rootPath,
        },
      },
      titleSeed: title,
    },
    optimisticMessage: submission.optimisticMessage,
  }
}

export function createThreadInterruptCommand({
  threadId,
  turnId,
}: {
  threadId: ThreadId
  turnId?: TurnId
}): ThreadTurnInterruptCommand {
  return {
    commandId: createCommandId(),
    threadId,
    turnId,
    type: 'thread.turn.interrupt',
  }
}

export function createThreadSessionStopCommand({
  threadId,
}: {
  threadId: ThreadId
}): ThreadSessionStopCommand {
  return {
    commandId: createCommandId(),
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
}: {
  threadId: ThreadId
  title: string
}): ThreadMetaUpdateCommand {
  return {
    commandId: createCommandId(),
    threadId,
    title,
    type: 'thread.meta.update',
  }
}

export function createThreadArchiveCommand({
  threadId,
}: {
  threadId: ThreadId
}): ThreadArchiveCommand {
  return {
    commandId: createCommandId(),
    threadId,
    type: 'thread.archive',
  }
}

export function createThreadUnarchiveCommand({
  threadId,
}: {
  threadId: ThreadId
}): ThreadUnarchiveCommand {
  return {
    commandId: createCommandId(),
    threadId,
    type: 'thread.unarchive',
  }
}

export function createThreadDeleteCommand({
  threadId,
}: {
  threadId: ThreadId
}): ThreadDeleteCommand {
  return {
    commandId: createCommandId(),
    threadId,
    type: 'thread.delete',
  }
}

export function createApprovalRespondCommand({
  decision,
  requestId,
  threadId,
}: {
  decision: ProviderApprovalDecision
  requestId: ApprovalRequestId
  threadId: ThreadId
}): ThreadApprovalRespondCommand {
  return {
    commandId: createCommandId(),
    decision,
    requestId,
    threadId,
    type: 'thread.approval.respond',
  }
}

export function createUserInputRespondCommand({
  answers,
  requestId,
  threadId,
}: {
  answers: ProviderUserInputAnswers
  requestId: ApprovalRequestId
  threadId: ThreadId
}): ThreadUserInputRespondCommand {
  return {
    answers,
    commandId: createCommandId(),
    requestId,
    threadId,
    type: 'thread.user-input.respond',
  }
}

export function createRuntimeModeSetCommand({
  runtimeMode,
  threadId,
}: {
  runtimeMode: RuntimeMode
  threadId: ThreadId
}): ThreadRuntimeModeSetCommand {
  return {
    commandId: createCommandId(),
    runtimeMode,
    threadId,
    type: 'thread.runtime-mode.set',
  }
}

export function createInteractionModeSetCommand({
  interactionMode,
  threadId,
}: {
  interactionMode: InteractionMode
  threadId: ThreadId
}): ThreadInteractionModeSetCommand {
  return {
    commandId: createCommandId(),
    interactionMode,
    threadId,
    type: 'thread.interaction-mode.set',
  }
}

export function createCheckpointRevertCommand({
  threadId,
  turnCount,
}: {
  threadId: ThreadId
  turnCount: number
}): ThreadCheckpointRevertCommand {
  return {
    commandId: createCommandId(),
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
}: {
  defaultModelSelection: ModelSelection
  projectId: ProjectId
}): ProjectMetaUpdateCommand {
  return {
    commandId: createCommandId(),
    defaultModelSelection,
    projectId,
    type: 'project.meta.update',
  }
}

/**
 * Renames a project, or repoints it at a different folder.
 *
 * Both fields are optional and omitted when absent, because the projection
 * patches compactly: sending `title` alone must leave the workspace root and
 * the default model exactly as they were.
 */
export function createProjectMetaCommand({
  projectId,
  title,
  workspaceRoot,
}: {
  projectId: ProjectId
  title?: string
  workspaceRoot?: string
}): ProjectMetaUpdateCommand {
  return {
    commandId: createCommandId(),
    projectId,
    type: 'project.meta.update',
    ...(title === undefined ? {} : { title }),
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
  }
}

/**
 * Writes the project's saved scripts. The whole list every time — scripts are
 * renamed and reordered as a set, and an empty array is how the user clears
 * them, which is why the command distinguishes absent from empty.
 */
export function createProjectScriptsCommand({
  projectId,
  scripts,
}: {
  projectId: ProjectId
  scripts: readonly OrchestrationProjectScript[]
}): ProjectMetaUpdateCommand {
  return {
    commandId: createCommandId(),
    projectId,
    scripts: [...scripts],
    type: 'project.meta.update',
  }
}

/**
 * `force` is always true from the client: the confirmation dialog the caller just
 * ran is the explicit opt-in the command's guard exists to demand. The server
 * cascades the project's threads in the same transaction.
 */
export function createProjectDeleteCommand({
  projectId,
}: {
  projectId: ProjectId
}): ProjectDeleteCommand {
  return {
    commandId: createCommandId(),
    force: true,
    projectId,
    type: 'project.delete',
  }
}

/**
 * One drag, one key, one row. The key already sorts between the drop position's
 * neighbours, so the projects either side of it are never rewritten and two
 * clients that saw the same drop converge without a shared counter.
 */
export function createProjectReorderCommand({
  orderKey,
  projectId,
}: {
  orderKey: string
  projectId: ProjectId
}): ProjectReorderCommand {
  return {
    commandId: createCommandId(),
    orderKey,
    projectId,
    type: 'project.reorder',
  }
}

/** Moves a session that already holds a slot in its project's arranged run. */
export function createSessionReorderCommand({
  orderKey,
  threadId,
}: {
  orderKey: string
  threadId: ThreadId
}): ThreadPinReorderCommand {
  return {
    commandId: createCommandId(),
    orderKey,
    threadId,
    type: 'thread.pin.reorder',
  }
}

/**
 * The first drag of a session, which is also what puts it in the arranged run:
 * the server refuses `thread.pin.reorder` for a thread that holds no slot yet,
 * so the same key arrives as the pin's opening position instead.
 */
export function createSessionPlaceCommand({
  orderKey,
  threadId,
}: {
  orderKey: string
  threadId: ThreadId
}): ThreadPinCommand {
  return {
    commandId: createCommandId(),
    orderKey,
    threadId,
    type: 'thread.pin',
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
