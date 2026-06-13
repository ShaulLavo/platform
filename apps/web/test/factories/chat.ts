import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_DRIVER_KIND,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  type OrchestrationMessage,
  type ProviderSnapshot,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
} from '@workspace/contracts'
import * as v from 'valibot'

import type { ChatThread, ChatTurnDiffSummary } from '@/features/chat/state/chat-projection-store'

// Deterministic timestamps so factory output is stable across runs.
function timestamp(index: number) {
  return `2026-05-28T00:00:0${index}.000Z`
}

export function chatMessage(overrides: Partial<OrchestrationMessage> = {}): OrchestrationMessage {
  return {
    attachments: [],
    createdAt: timestamp(0),
    id: 'message-1',
    role: 'assistant',
    streaming: false,
    text: 'Hello from the assistant.',
    threadId: 'thread-1',
    turnId: null,
    updatedAt: timestamp(0),
    ...overrides,
  } as OrchestrationMessage
}

function userMessage(overrides: Partial<OrchestrationMessage> = {}): OrchestrationMessage {
  return chatMessage({
    id: 'message-user-1',
    role: 'user',
    text: 'Please update the chat view.',
    turnId: 'turn-1',
    ...overrides,
  })
}

export function turnDiffSummary(overrides: Partial<ChatTurnDiffSummary> = {}): ChatTurnDiffSummary {
  return {
    assistantMessageId: 'message-1',
    checkpointRef: 'checkpoint-1',
    checkpointTurnCount: 1,
    completedAt: timestamp(2),
    files: [
      { additions: 12, deletions: 4, kind: 'modified', path: 'src/a.ts' },
      { additions: 6, deletions: 0, kind: 'modified', path: 'src/b.ts' },
    ],
    status: 'ready',
    threadId: 'thread-1',
    turnId: 'turn-1',
    ...overrides,
  } as ChatTurnDiffSummary
}

export function thread(overrides: Partial<ChatThread> = {}): ChatThread {
  const threadId = v.parse(threadIdSchema, 'thread-1')
  const turnId = v.parse(turnIdSchema, 'turn-1')

  return {
    activities: [],
    archivedAt: null,
    branch: null,
    createdAt: timestamp(1),
    hasActionableProposedPlan: false,
    id: threadId,
    interactionMode: DEFAULT_INTERACTION_MODE,
    latestTurn: {
      assistantMessageId: null,
      completedAt: null,
      requestedAt: timestamp(1),
      startedAt: timestamp(2),
      state: 'running',
      turnId,
    },
    latestUserMessageAt: timestamp(1),
    messages: [],
    modelSelection: { model: 'gpt-5.5', providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID },
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
    projectId: v.parse(projectIdSchema, 'project-1'),
    proposedPlans: [],
    runtimeMode: DEFAULT_RUNTIME_MODE,
    session: {
      activeTurnId: turnId,
      lastError: null,
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
      providerName: 'Codex',
      providerSessionId: 'provider-session-1',
      runtimeMode: DEFAULT_RUNTIME_MODE,
      status: 'running',
      threadId,
      updatedAt: timestamp(2),
    },
    title: 'Thread',
    turnDiffSummaries: [],
    updatedAt: timestamp(2),
    worktreePath: null,
    ...overrides,
  }
}

export function providerSnapshot(overrides: Partial<ProviderSnapshot> = {}): ProviderSnapshot {
  return {
    auth: { status: 'authenticated' },
    checkedAt: timestamp(1),
    displayLabel: 'Codex',
    driverKind: DEFAULT_PROVIDER_DRIVER_KIND,
    enabled: true,
    installed: true,
    models: [],
    providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    runtimeModes: [DEFAULT_RUNTIME_MODE],
    status: 'ready',
    traits: {
      supportsApprovals: false,
      supportsFullAccess: true,
      supportsInterrupt: true,
      supportsSessionStop: true,
      supportsStreaming: true,
      supportsUserInput: false,
    },
    version: '1.0.0',
    ...overrides,
  }
}
