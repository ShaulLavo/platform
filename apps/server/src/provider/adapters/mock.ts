import {
  DEFAULT_CODEX_PROVIDER_SETTINGS,
  type ProviderApprovalDecision,
  type ProviderSnapshot,
  type ProviderUserInputAnswers,
  type ApprovalRequestId,
  type ThreadId,
} from '@workspace/contracts'
import type { ProviderAdapter, ProviderRuntimeSink, ProviderTurnInput } from '../types'

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
  private readonly responseText: string
  private readonly shouldFail: boolean

  constructor(options: { responseText?: string; shouldFail?: boolean } = {}) {
    this.responseText = options.responseText ?? 'Mock response'
    this.shouldFail = options.shouldFail ?? false
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
    this.interruptedThreads.push(threadId)
  }

  async stopSession({ threadId }: { threadId: ThreadId }) {
    this.interruptedThreads.push(threadId)
  }

  async respondApproval(input: {
    decision: ProviderApprovalDecision
    requestId: ApprovalRequestId
    threadId: ThreadId
  }) {
    this.approvalResponses.push(input)
  }

  async respondUserInput(input: {
    answers: ProviderUserInputAnswers
    requestId: ApprovalRequestId
    threadId: ThreadId
  }) {
    this.userInputResponses.push(input)
  }
}
