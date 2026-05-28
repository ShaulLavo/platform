import type {
  ApprovalRequestId,
  ChatAttachment,
  InteractionMode,
  ModelSelection,
  OrchestrationProject,
  OrchestrationThread,
  ProviderApprovalDecision,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSnapshot,
  ProviderUserInputAnswers,
  RuntimeMode,
  ThreadId,
  TurnId,
} from '@workspace/contracts'

export type ProviderTurnInput = {
  attachments: ChatAttachment[]
  cwd: string
  interactionMode: InteractionMode
  messageText: string
  modelSelection: ModelSelection
  project: OrchestrationProject
  providerInstanceId: ProviderInstanceId
  runtimeMode: RuntimeMode
  thread: OrchestrationThread
  turnId: TurnId
}

export type ProviderTurnControlInput = {
  threadId: ThreadId
  turnId?: TurnId
}

export type ProviderApprovalResponseInput = {
  decision: ProviderApprovalDecision
  requestId: ApprovalRequestId
  threadId: ThreadId
}

export type ProviderUserInputResponseInput = {
  answers: ProviderUserInputAnswers
  requestId: ApprovalRequestId
  threadId: ThreadId
}

export type ProviderRuntimeEvent =
  | {
      createdAt: string
      eventId: string
      providerInstanceId: ProviderInstanceId
      providerName?: string
      providerSessionId: string | null
      runtimeMode?: RuntimeMode
      status: 'starting' | 'running' | 'ready' | 'interrupted' | 'stopped' | 'error'
      threadId: ThreadId
      turnId: TurnId | null
      type: 'session.set'
      lastError?: string | null
    }
  | {
      createdAt: string
      delta: string
      eventId: string
      messageId: string
      threadId: ThreadId
      turnId: TurnId
      type: 'assistant.delta'
    }
  | {
      completedAt: string
      eventId: string
      messageId: string
      threadId: ThreadId
      turnId: TurnId
      type: 'assistant.complete'
    }
  | {
      createdAt: string
      detail?: string
      eventId: string
      kind: string
      payload?: unknown
      summary: string
      threadId: ThreadId
      tone: 'info' | 'tool' | 'approval' | 'error'
      turnId: TurnId | null
      type: 'activity.append'
    }
  | {
      createdAt: string
      eventId: string
      planId?: string
      planMarkdown: string
      threadId: ThreadId
      turnId: TurnId | null
      type: 'proposed-plan.upsert'
      updatedAt?: string
    }

export type ProviderRuntimeSink = {
  ingest: (event: ProviderRuntimeEvent) => Promise<void>
}

export type ProviderAdapter = {
  adapterKey: string
  driverKind: ProviderDriverKind
  interruptTurn: (input: ProviderTurnControlInput) => Promise<void>
  respondApproval: (input: ProviderApprovalResponseInput) => Promise<void>
  respondUserInput: (input: ProviderUserInputResponseInput) => Promise<void>
  snapshot: () => Promise<ProviderSnapshot>
  startTurn: (input: ProviderTurnInput, sink: ProviderRuntimeSink) => Promise<void>
  stopSession: (input: { threadId: ThreadId }) => Promise<void>
}
