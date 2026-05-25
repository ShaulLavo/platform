import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  threadIdSchema,
  type ModelSelection,
} from '@workspace/contracts'
import * as v from 'valibot'

import {
  createDraftThreadSubmission,
  createThreadInterruptCommand,
  createTurnSubmission,
  createWorkspaceProjectCommand,
  threadTitleFromPrompt,
  workspaceProjectId,
  workspaceProjectTitle,
} from './chat-command-builders'

describe('chat command builders', () => {
  it('derives a stable project identity from the workspace path', () => {
    const rootPath = '/Users/test/workspace/platform'
    const createdAt = '2026-05-24T12:00:00.000Z'
    const command = createWorkspaceProjectCommand({ createdAt, rootPath })

    expect(command.projectId).toBe(workspaceProjectId(rootPath))
    expect(command.title).toBe('platform')
    expect(command.workspaceRoot).toBe(rootPath)
    expect(command.defaultModelSelection).toEqual({
      model: 'gpt-5.5',
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    })
  })

  it('builds a turn command and matching optimistic user message', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const modelSelection: ModelSelection = {
      model: 'codex-test',
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    }
    const submission = createTurnSubmission({
      createdAt: '2026-05-24T12:00:00.000Z',
      interactionMode: DEFAULT_INTERACTION_MODE,
      modelSelection,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      text: 'Explain the workspace',
      threadId,
    })

    expect(submission.command.type).toBe('thread.turn.start')
    expect(submission.command.message.messageId).toBe(submission.optimisticMessage.id)
    expect(submission.optimisticMessage.turnId).toBe(submission.command.turnId)
    expect(submission.optimisticMessage.text).toBe('Explain the workspace')
  })

  it('builds a draft thread submission with one thread id and a prompt title', () => {
    const projectId = workspaceProjectId('/Users/test/workspace/platform')
    const submission = createDraftThreadSubmission({
      createdAt: '2026-05-24T12:00:00.000Z',
      projectId,
      rootPath: '/Users/test/workspace/platform',
      text: 'Fix the draft thread flow',
    })

    expect(submission.threadCommand.type).toBe('thread.create')
    expect(submission.threadCommand.threadId).toBe(submission.turnCommand.threadId)
    expect(submission.threadCommand.title).toBe('Fix the draft thread flow')
    expect(submission.turnCommand.message.messageId).toBe(submission.optimisticMessage.id)
  })

  it('keeps interrupt commands scoped to the active thread and turn', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const command = createThreadInterruptCommand({
      createdAt: '2026-05-24T12:00:00.000Z',
      threadId,
    })

    expect(command.type).toBe('thread.turn.interrupt')
    expect(command.threadId).toBe(threadId)
    expect(command.turnId).toBeUndefined()
  })

  it('formats workspace and prompt titles for compact sidebar use', () => {
    expect(workspaceProjectTitle('/Users/test/workspace/platform/')).toBe('platform')
    expect(threadTitleFromPrompt('  Fix the failing chat projection tests  ')).toBe(
      'Fix the failing chat projection tests',
    )
    expect(threadTitleFromPrompt('x'.repeat(80))).toHaveLength(50)
  })
})
