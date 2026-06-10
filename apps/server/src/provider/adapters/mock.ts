import { createInternalError } from '../../observability/structured-errors'

import {
  DEFAULT_CODEX_PROVIDER_SETTINGS,
  type ProviderApprovalDecision,
  type ProviderInstanceId,
  type ProviderSnapshot,
  type ProviderUserInputAnswers,
  type ApprovalRequestId,
  type ThreadId,
} from '@workspace/contracts'
import { ProviderRuntimeEventStream } from '../provider-runtime-event-stream'
import type { ProviderAdapter, ProviderSessionStartInput, ProviderTurnInput } from '../types'

type MockProviderAdapterOptions = {
  approvalError?: string
  beforeComplete?: () => Promise<void> | void
  interruptError?: string
  responseText?: string
  shouldFail?: boolean
  stopError?: string
  userInputError?: string
}

export class MockProviderAdapter implements ProviderAdapter {
  readonly adapterKey = DEFAULT_CODEX_PROVIDER_SETTINGS.providerInstanceId
  readonly capabilities = {
    readThread: true,
    rollbackThread: true,
    sessionModelSwitch: 'in-session',
    stopAll: true,
  } satisfies ProviderAdapter['capabilities']
  readonly driverKind = DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind
  readonly approvalResponses: Array<{
    decision: ProviderApprovalDecision
    requestId: ApprovalRequestId
    threadId: ThreadId
  }> = []
  readonly interruptedThreads: ThreadId[] = []
  readonly rollbacks: Array<{ numTurns: number; threadId: ThreadId }> = []
  readonly startedTurns: ProviderTurnInput[] = []
  readonly userInputResponses: Array<{
    answers: ProviderUserInputAnswers
    requestId: ApprovalRequestId
    threadId: ThreadId
  }> = []
  private readonly events = new ProviderRuntimeEventStream()
  private readonly sessions = new Map<ThreadId, ProviderSessionStartInput>()
  private readonly approvalError: string | null
  private readonly beforeComplete: (() => Promise<void> | void) | null
  private readonly interruptError: string | null
  private readonly responseText: string
  private readonly shouldFail: boolean
  private readonly stopError: string | null
  private readonly userInputError: string | null

  constructor(options: MockProviderAdapterOptions = {}) {
    this.approvalError = options.approvalError ?? null
    this.beforeComplete = options.beforeComplete ?? null
    this.interruptError = options.interruptError ?? null
    this.responseText = options.responseText ?? 'Mock response'
    this.shouldFail = options.shouldFail ?? false
    this.stopError = options.stopError ?? null
    this.userInputError = options.userInputError ?? null
  }

  async snapshot(): Promise<ProviderSnapshot> {
    return {
      ...DEFAULT_CODEX_PROVIDER_SETTINGS,
      auth: { status: 'unknown' },
      checkedAt: new Date().toISOString(),
      installed: true,
      models: [
        {
          capabilities: null,
          isCustom: false,
          name: 'GPT-5.5',
          shortName: 'GPT-5.5',
          slug: 'gpt-5.5',
        },
      ],
      status: 'ready',
      version: 'mock',
    }
  }

  streamEvents() {
    return this.events.stream()
  }

  async startSession(input: ProviderSessionStartInput) {
    this.sessions.set(input.threadId, input)
    this.events.publish({
      createdAt: new Date().toISOString(),
      eventId: `mock-session-started:${input.threadId}`,
      payload: { resume: input.resumeCursor ?? null },
      provider: this.driverKind,
      providerInstanceId: input.providerInstanceId,
      providerSessionId: `mock:${input.threadId}`,
      raw: {
        payload: input,
        source: 'codex.sdk.thread-event',
      },
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
      type: 'session.started',
    })
    this.events.publish({
      createdAt: new Date().toISOString(),
      eventId: `mock-thread-started:${input.threadId}`,
      payload: { providerThreadId: `mock-thread:${input.threadId}` },
      provider: this.driverKind,
      providerInstanceId: input.providerInstanceId,
      providerSessionId: `mock:${input.threadId}`,
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
      type: 'thread.started',
    })

    return {
      cwd: input.cwd,
      model: input.modelSelection.model,
      providerInstanceId: input.providerInstanceId as ProviderInstanceId,
      providerSessionId: `mock:${input.threadId}`,
      providerThreadId: `mock-thread:${input.threadId}`,
      resumeCursor: input.resumeCursor ?? null,
      runtimeMode: input.runtimeMode,
      status: 'ready' as const,
      threadId: input.threadId,
    }
  }

  async sendTurn(input: ProviderTurnInput) {
    this.startedTurns.push(input)
    if (!this.sessions.has(input.thread.id)) await this.startSession(sessionInputFromTurn(input))
    if (this.shouldFail) throw createInternalError('Mock provider failed')
    await Promise.resolve(this.beforeComplete?.())

    const messageId = `assistant:${input.turnId}`
    this.events.publish({
      createdAt: new Date().toISOString(),
      eventId: `mock-turn-started:${input.turnId}`,
      payload: { model: input.modelSelection.model },
      provider: this.driverKind,
      providerInstanceId: input.providerInstanceId,
      providerSessionId: `mock:${input.thread.id}`,
      runtimeMode: input.runtimeMode,
      threadId: input.thread.id,
      turnId: input.turnId,
      type: 'turn.started',
    })
    this.events.publish({
      createdAt: new Date().toISOString(),
      delta: this.responseText,
      eventId: `mock-delta:${input.turnId}`,
      messageId,
      threadId: input.thread.id,
      turnId: input.turnId,
      type: 'assistant.delta',
    })
    this.events.publish({
      completedAt: new Date().toISOString(),
      eventId: `mock-complete:${input.turnId}`,
      messageId,
      threadId: input.thread.id,
      turnId: input.turnId,
      type: 'assistant.complete',
    })
    this.events.publish({
      createdAt: new Date().toISOString(),
      eventId: `mock-turn-completed:${input.turnId}`,
      payload: { state: 'completed' },
      provider: this.driverKind,
      providerInstanceId: input.providerInstanceId,
      providerSessionId: `mock:${input.thread.id}`,
      runtimeMode: input.runtimeMode,
      threadId: input.thread.id,
      turnId: input.turnId,
      type: 'turn.completed',
    })
  }

  async listSessions() {
    return Array.from(this.sessions.values()).map((input) => ({
      cwd: input.cwd,
      model: input.modelSelection.model,
      providerInstanceId: input.providerInstanceId as ProviderInstanceId,
      providerSessionId: `mock:${input.threadId}`,
      providerThreadId: `mock-thread:${input.threadId}`,
      resumeCursor: input.resumeCursor ?? null,
      runtimeMode: input.runtimeMode,
      status: 'ready' as const,
      threadId: input.threadId,
    }))
  }

  async hasSession({ threadId }: { threadId: ThreadId }) {
    return this.sessions.has(threadId)
  }

  async readThread({ threadId }: { threadId: ThreadId }) {
    if (!this.sessions.has(threadId))
      throw createInternalError(`Mock provider session not found: ${threadId}`)

    return { providerThreadId: `mock-thread:${threadId}`, threadId, turns: [] }
  }

  async rollbackThread({ numTurns, threadId }: { numTurns: number; threadId: ThreadId }) {
    if (!Number.isInteger(numTurns) || numTurns < 1) {
      throw createInternalError('Mock provider rollback requires numTurns >= 1.')
    }

    this.rollbacks.push({ numTurns, threadId })
    return this.readThread({ threadId })
  }

  async interruptTurn({ threadId }: { threadId: ThreadId }) {
    if (this.interruptError) throw createInternalError(this.interruptError)

    this.interruptedThreads.push(threadId)
  }

  async stopSession({ threadId }: { threadId: ThreadId }) {
    if (this.stopError) throw createInternalError(this.stopError)

    this.sessions.delete(threadId)
    this.interruptedThreads.push(threadId)
  }

  async stopAll() {
    this.sessions.clear()
  }

  async respondApproval(input: {
    decision: ProviderApprovalDecision
    requestId: ApprovalRequestId
    threadId: ThreadId
  }) {
    if (this.approvalError) throw createInternalError(this.approvalError)

    this.approvalResponses.push(input)
  }

  async respondUserInput(input: {
    answers: ProviderUserInputAnswers
    requestId: ApprovalRequestId
    threadId: ThreadId
  }) {
    if (this.userInputError) throw createInternalError(this.userInputError)

    this.userInputResponses.push(input)
  }
}

function sessionInputFromTurn(input: ProviderTurnInput): ProviderSessionStartInput {
  return {
    cwd: input.cwd,
    interactionMode: input.interactionMode,
    modelSelection: input.modelSelection,
    providerInstanceId: input.providerInstanceId,
    runtimeMode: input.runtimeMode,
    threadId: input.thread.id,
  }
}
