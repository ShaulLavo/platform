import {
  DEFAULT_CODEX_PROVIDER_SETTINGS,
  type ProviderApprovalDecision,
  type ProviderSnapshot,
  type ProviderUserInputAnswers,
  type ApprovalRequestId,
  type ThreadId,
} from '@workspace/contracts'
import type { ProviderAdapter, ProviderRuntimeSink, ProviderTurnInput } from '../types'

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
  readonly driverKind = DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind
  readonly approvalResponses: Array<{
    decision: ProviderApprovalDecision
    requestId: ApprovalRequestId
    threadId: ThreadId
  }> = []
  readonly interruptedThreads: ThreadId[] = []
  readonly startedTurns: ProviderTurnInput[] = []
  readonly userInputResponses: Array<{
    answers: ProviderUserInputAnswers
    requestId: ApprovalRequestId
    threadId: ThreadId
  }> = []
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

  async startTurn(input: ProviderTurnInput, sink: ProviderRuntimeSink) {
    this.startedTurns.push(input)
    if (this.shouldFail) throw new Error('Mock provider failed')
    await Promise.resolve(this.beforeComplete?.())

    const messageId = `assistant:${input.turnId}`
    await sink.ingest({
      createdAt: new Date().toISOString(),
      delta: this.responseText,
      eventId: `mock-delta:${input.turnId}`,
      messageId,
      threadId: input.thread.id,
      turnId: input.turnId,
      type: 'assistant.delta',
    })
    await sink.ingest({
      completedAt: new Date().toISOString(),
      eventId: `mock-complete:${input.turnId}`,
      messageId,
      threadId: input.thread.id,
      turnId: input.turnId,
      type: 'assistant.complete',
    })
  }

  async interruptTurn({ threadId }: { threadId: ThreadId }) {
    if (this.interruptError) throw new Error(this.interruptError)

    this.interruptedThreads.push(threadId)
  }

  async stopSession({ threadId }: { threadId: ThreadId }) {
    if (this.stopError) throw new Error(this.stopError)

    this.interruptedThreads.push(threadId)
  }

  async respondApproval(input: {
    decision: ProviderApprovalDecision
    requestId: ApprovalRequestId
    threadId: ThreadId
  }) {
    if (this.approvalError) throw new Error(this.approvalError)

    this.approvalResponses.push(input)
  }

  async respondUserInput(input: {
    answers: ProviderUserInputAnswers
    requestId: ApprovalRequestId
    threadId: ThreadId
  }) {
    if (this.userInputError) throw new Error(this.userInputError)

    this.userInputResponses.push(input)
  }
}
