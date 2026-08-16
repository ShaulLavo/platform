import type {
  ApprovalRequestId,
  ChatAttachment,
  InteractionMode,
  ModelSelection,
  OrchestrationProject,
  OrchestrationThread,
  ProviderApprovalDecision,
  ProviderAuth,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderLoginAttempt,
  ProviderSignInMethod,
  ProviderSkill,
  ProviderSlashCommand,
  ProviderSnapshot,
  ProviderUserInputAnswers,
  RuntimeMode,
  ThreadId,
  TurnId,
  UserInputQuestions,
} from '@workspace/contracts'

export type ProviderTurnInput = {
  attachments: ChatAttachment[]
  cwd: string
  interactionMode: InteractionMode
  messageText: string
  modelSelection: ModelSelection
  project: OrchestrationProject
  providerInstanceId: ProviderInstanceId
  /**
   * Cursor of the conversation this turn continues, filled in by
   * `ProviderService` from the persisted binding. Without it a turn that has to
   * (re)start a session — after a restart, or after a model switch — would open
   * a brand-new provider conversation and lose the history.
   */
  resumeCursor?: unknown | null
  runtimeMode: RuntimeMode
  thread: OrchestrationThread
  turnId: TurnId
}

export type ProviderSessionStartInput = {
  cwd: string
  interactionMode?: InteractionMode
  modelSelection: ModelSelection
  providerInstanceId: ProviderInstanceId
  resumeCursor?: unknown | null
  runtimeMode: RuntimeMode
  threadId: ThreadId
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

type ProviderRuntimeBaseEvent = {
  createdAt: string
  eventId: string
  itemId?: string
  provider?: ProviderDriverKind
  providerInstanceId?: ProviderInstanceId
  providerName?: string
  providerRefs?: ProviderRefs
  providerSessionId?: string | null
  requestId?: string
  raw?: RuntimeEventRaw
  runtimeMode?: RuntimeMode
  threadId: ThreadId
  turnId?: TurnId
}

type RuntimeEventRawSource =
  | 'codex.app-server.notification'
  | 'codex.app-server.request'
  | 'codex.app-server.stderr'
  | 'codex.eventmsg'
  | 'codex.sdk.thread-event'
  | 'claude.sdk.message'
  | 'claude.sdk.permission'

type RuntimeEventRaw = {
  messageType?: string
  method?: string
  payload: unknown
  source: RuntimeEventRawSource
}

type ProviderRefs = {
  providerItemId?: string
  providerRequestId?: string
  providerTurnId?: string
}

type ProviderRuntimeContentStreamKind =
  | 'assistant_text'
  | 'reasoning_text'
  | 'reasoning_summary_text'
  | 'plan_text'
  | 'command_output'
  | 'file_change_output'
  | 'unknown'

type ProviderRuntimeItemStatus = 'inProgress' | 'completed' | 'failed' | 'declined'

type ProviderRuntimeSessionState =
  | 'starting'
  | 'ready'
  | 'running'
  | 'waiting'
  | 'stopped'
  | 'error'

type ProviderRuntimeThreadState = 'active' | 'idle' | 'archived' | 'closed' | 'compacted' | 'error'

type ProviderRuntimeTurnState = 'completed' | 'failed' | 'interrupted' | 'cancelled'

type ProviderRuntimePlanStepStatus = 'pending' | 'inProgress' | 'completed'

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
      tone: 'info' | 'tool' | 'thinking' | 'approval' | 'error'
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
  | (ProviderRuntimeBaseEvent & {
      type: 'content.delta'
      payload: {
        contentIndex?: number
        delta: string
        streamKind: ProviderRuntimeContentStreamKind
        summaryIndex?: number
      }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'item.started'
      payload: {
        data?: unknown
        detail?: string
        itemType: string
        status?: ProviderRuntimeItemStatus
        title?: string
      }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'item.completed'
      payload: {
        data?: unknown
        detail?: string
        itemType: string
        status?: ProviderRuntimeItemStatus
        title?: string
      }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'request.opened'
      payload: {
        args?: unknown
        detail?: string
        requestType: string
      }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'request.resolved'
      payload: {
        decision?: string
        requestType: string
        resolution?: unknown
      }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'user-input.requested'
      /**
       * Adapters build these out of untyped provider JSON, so the contract here
       * states the target shape rather than a guarantee: ingestion re-parses
       * every question and drops the ones that miss it.
       */
      payload: { questions: UserInputQuestions }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'user-input.resolved'
      payload: { answers: Record<string, unknown> }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'task.started'
      payload: {
        description?: string
        taskId: string
        taskType?: string
      }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'task.progress'
      payload: {
        description: string
        lastToolName?: string
        summary?: string
        taskId: string
        usage?: unknown
      }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'task.completed'
      payload: {
        status: 'completed' | 'failed' | 'stopped'
        summary?: string
        taskId: string
        usage?: unknown
      }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'runtime.warning'
      payload: { detail?: unknown; message: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'runtime.error'
      payload: { class?: string; detail?: unknown; message: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'session.started'
      payload: { message?: string; resume?: unknown }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'session.configured'
      payload: { config: Record<string, unknown> }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'session.state.changed'
      payload: { detail?: unknown; reason?: string; state: ProviderRuntimeSessionState }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'session.exited'
      payload: { exitKind?: 'graceful' | 'error'; reason?: string; recoverable?: boolean }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'thread.started'
      payload: { providerThreadId?: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'thread.state.changed'
      payload: { detail?: unknown; state: ProviderRuntimeThreadState }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'thread.metadata.updated'
      payload: { metadata?: Record<string, unknown>; name?: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'thread.token-usage.updated'
      payload: { usage: Record<string, unknown> & { usedTokens?: number } }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'thread.realtime.started'
      payload: { realtimeSessionId?: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'thread.realtime.item-added'
      payload: { item: unknown }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'thread.realtime.audio.delta'
      payload: { audio: unknown }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'thread.realtime.error'
      payload: { message: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'thread.realtime.closed'
      payload: { reason?: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'turn.started'
      payload: { effort?: string; model?: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'turn.completed'
      payload: {
        errorMessage?: string
        state: ProviderRuntimeTurnState
        stopReason?: string | null
        usage?: unknown
      }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'turn.plan.updated'
      payload: {
        explanation?: string | null
        plan: Array<{ status: ProviderRuntimePlanStepStatus; step: string }>
      }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'turn.diff.updated'
      payload: { unifiedDiff: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'hook.started'
      payload: { hookEvent: string; hookId: string; hookName: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'hook.progress'
      payload: { hookId: string; output?: string; stderr?: string; stdout?: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'hook.completed'
      payload: {
        exitCode?: number
        hookId: string
        outcome: 'success' | 'error' | 'cancelled'
        output?: string
        stderr?: string
        stdout?: string
      }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'tool.progress'
      payload: {
        elapsedSeconds?: number
        summary?: string
        toolName?: string
        toolUseId?: string
      }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'tool.summary'
      payload: { precedingToolUseIds?: string[]; summary: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'auth.status'
      payload: { error?: string; isAuthenticating?: boolean; output?: string[] }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'account.updated'
      payload: { account: unknown }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'account.rate-limits.updated'
      payload: { rateLimits: unknown }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'mcp.status.updated'
      payload: { status: unknown }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'mcp.oauth.completed'
      payload: { error?: string; name?: string; success: boolean }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'model.rerouted'
      payload: { fromModel: string; reason: string; toModel: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'config.warning'
      payload: { details?: string; path?: string; range?: unknown; summary: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'deprecation.notice'
      payload: { details?: string; summary: string }
    })
  | (ProviderRuntimeBaseEvent & {
      type: 'files.persisted'
      payload: {
        failed?: Array<{ error: string; filename: string }>
        files: Array<{ fileId: string; filename: string }>
      }
    })

type ProviderAdapterCapabilities = {
  /**
   * Whether the adapter implements `listCommands`. Optional so adapters whose
   * protocol has no listing request (codex, today) stay untouched.
   */
  listCommands?: boolean
  sessionModelSwitch: 'in-session' | 'unsupported'
  /**
   * Whether the adapter implements the optional auth members below. Optional so
   * adapters that cannot drive a sign-in flow (codex, mock) stay untouched.
   */
  signIn?: boolean
}

export type ProviderSignInInput = {
  email?: string
  method: ProviderSignInMethod
}

export type ProviderCommandCatalogInput = {
  /**
   * Directory to discover from. Skills and project commands are files on the
   * user's disk under the working directory, so the same provider answers
   * differently per project and a catalog read without a `cwd` sees only the
   * user-level ones.
   */
  cwd?: string
}

export type ProviderCommandCatalogResult = {
  commands: ProviderSlashCommand[]
  skills: ProviderSkill[]
}

export type ProviderAdapterSession = {
  cwd: string
  model: string
  providerInstanceId: ProviderInstanceId
  providerSessionId: string
  providerThreadId?: string
  resumeCursor?: unknown | null
  runtimeMode: RuntimeMode
  status: ProviderRuntimeSessionState
  threadId: ThreadId
}

export type ProviderAdapter = {
  adapterKey: string
  /**
   * Current account state, read from the provider CLI rather than from a cached
   * snapshot. Present only when `capabilities.signIn` is true.
   */
  authStatus?: () => Promise<ProviderAuth>
  cancelSignIn?: (input: { attemptId: string }) => Promise<ProviderLoginAttempt | null>
  capabilities: ProviderAdapterCapabilities
  driverKind: ProviderDriverKind
  hasSession: (input: { threadId: ThreadId }) => Promise<boolean>
  interruptTurn: (input: ProviderTurnControlInput) => Promise<void>
  /**
   * The `/command` and `$skill` catalog for one working directory. Present only
   * when `capabilities.listCommands` is true.
   */
  listCommands?: (input: ProviderCommandCatalogInput) => Promise<ProviderCommandCatalogResult>
  respondApproval: (input: ProviderApprovalResponseInput) => Promise<void>
  respondUserInput: (input: ProviderUserInputResponseInput) => Promise<void>
  rollbackThread: (input: { numTurns: number; threadId: ThreadId }) => Promise<void>
  /**
   * Starts an interactive sign-in. Returns as soon as the flow is running — the
   * user still has a browser round trip to finish — so callers poll
   * `signInAttempt` with the returned id until it leaves `pending`.
   */
  signIn?: (input: ProviderSignInInput) => Promise<ProviderLoginAttempt>
  signInAttempt?: (input: { attemptId: string }) => Promise<ProviderLoginAttempt | null>
  signOut?: () => Promise<void>
  snapshot: () => Promise<ProviderSnapshot>
  startSession: (input: ProviderSessionStartInput) => Promise<ProviderAdapterSession>
  sendTurn: (input: ProviderTurnInput) => Promise<void>
  streamEvents: () => AsyncIterable<ProviderRuntimeEvent>
  stopAll: () => Promise<void>
  stopSession: (input: { threadId: ThreadId }) => Promise<void>
}
