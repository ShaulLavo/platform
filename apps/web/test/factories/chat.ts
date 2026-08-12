import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_DRIVER_KIND,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  type OrchestrationMessage,
  type OrchestrationProjectShell,
  type OrchestrationShellSnapshot,
  type OrchestrationThreadActivity,
  type OrchestrationThreadShell,
  type ProviderModel,
  type ProviderSnapshot,
  eventIdSchema,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
} from '@workspace/contracts'
import * as v from 'valibot'

import type {
  ChatSidebarThreadSummary,
  ChatThread,
  ChatTurnDiffSummary,
} from '@/features/chat/state/chat-projection-store'

// Deterministic timestamps so factory output is stable across runs.
function timestamp(index: number) {
  return `2026-05-28T00:00:0${index}.000Z`
}

/**
 * Mirrors what `provider-runtime-ingestion` actually appends: the payload shape
 * is the contract the pending-request derivation reads, so tests that invent a
 * different one prove nothing.
 */
export function threadActivity(
  overrides: Partial<OrchestrationThreadActivity> = {},
): OrchestrationThreadActivity {
  return {
    createdAt: timestamp(3),
    id: v.parse(eventIdSchema, 'event-activity-1'),
    kind: 'approval.requested',
    payload: {},
    sequence: 1,
    summary: 'Approval requested',
    threadId: v.parse(threadIdSchema, 'thread-1'),
    tone: 'approval',
    turnId: v.parse(turnIdSchema, 'turn-1'),
    ...overrides,
  }
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
    modelSelection: { model: 'claude-opus-5', providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID },
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

export function chatProject(
  overrides: Partial<OrchestrationProjectShell> = {},
): OrchestrationProjectShell {
  return {
    createdAt: timestamp(0),
    defaultModelSelection: null,
    id: v.parse(projectIdSchema, 'project-1'),
    orderKey: null,
    scripts: [],
    title: 'platform',
    updatedAt: timestamp(1),
    workspaceRoot: '/repo/platform',
    ...overrides,
  }
}

export function sidebarThreadSummary(
  overrides: Partial<ChatSidebarThreadSummary> = {},
): ChatSidebarThreadSummary {
  const source = thread()

  return {
    archivedAt: source.archivedAt,
    branch: source.branch,
    createdAt: source.createdAt,
    hasActionableProposedPlan: source.hasActionableProposedPlan,
    id: source.id,
    interactionMode: source.interactionMode,
    latestTurn: source.latestTurn,
    latestUserMessageAt: source.latestUserMessageAt,
    pendingApprovalCount: source.pendingApprovalCount,
    pendingUserInputCount: source.pendingUserInputCount,
    projectId: source.projectId,
    session: source.session,
    title: source.title,
    updatedAt: source.updatedAt,
    worktreePath: source.worktreePath,
    ...overrides,
  }
}

export function threadShell(
  overrides: Partial<OrchestrationThreadShell> = {},
): OrchestrationThreadShell {
  const source = thread()

  return {
    ...sidebarThreadSummary(),
    modelSelection: source.modelSelection,
    runtimeMode: source.runtimeMode,
    ...overrides,
  }
}

export function shellSnapshot({
  projects = [chatProject()],
  threads = [threadShell()],
}: {
  projects?: OrchestrationProjectShell[]
  threads?: OrchestrationThreadShell[]
} = {}): OrchestrationShellSnapshot {
  return {
    projects,
    snapshotSequence: 1,
    threads,
    updatedAt: timestamp(2),
  }
}

export function providerModel(overrides: Partial<ProviderModel> = {}): ProviderModel {
  return {
    capabilities: null,
    isCustom: false,
    name: 'GPT-5.5 Codex',
    shortName: 'GPT-5.5',
    slug: 'gpt-5.5',
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
