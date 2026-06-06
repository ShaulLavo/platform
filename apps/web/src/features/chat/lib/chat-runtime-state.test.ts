import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_DRIVER_KIND,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
  type ProviderSnapshot,
} from '@workspace/contracts'
import * as v from 'valibot'

import type { ChatThread } from '../state/chat-projection-store'
import { chatRuntimeAlerts } from './chat-runtime-state'

describe('chat runtime state', () => {
  it('renders only attention-worthy command, provider, and pending action states', () => {
    const alerts = chatRuntimeAlerts({
      commandState: {
        commandFailure: 'Dispatch rejected',
        interruptPending: true,
        sendPending: false,
        stopPending: false,
      },
      provider: provider({ auth: { status: 'unauthenticated' }, status: 'error' }),
      providerError: null,
      thread: thread({
        hasActionableProposedPlan: true,
        pendingApprovalCount: 1,
        pendingUserInputCount: 2,
      }),
    })

    expect(alerts.map((alert) => [alert.id, alert.title, alert.tone])).toEqual([
      ['command:failure', 'Command failed', 'error'],
      ['provider', 'Codex authentication required', 'error'],
      ['approval', 'Approval requested', 'warning'],
      ['user-input', 'User input requested', 'warning'],
    ])
  })

  it('hides ready provider, running session, running turn, and available plan states', () => {
    const alerts = chatRuntimeAlerts({
      commandState: {
        commandFailure: null,
        interruptPending: false,
        sendPending: false,
        stopPending: false,
      },
      provider: provider(),
      providerError: null,
      thread: thread({ hasActionableProposedPlan: true }),
    })

    expect(alerts).toEqual([])
  })
})

function thread(overrides: Partial<ChatThread> = {}): ChatThread {
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
    modelSelection: {
      model: 'gpt-5.5',
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    },
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

function provider(overrides: Partial<ProviderSnapshot> = {}): ProviderSnapshot {
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

function timestamp(index: number) {
  return `2026-05-28T00:00:0${index}.000Z`
}
