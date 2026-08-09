import { createInternalError } from '../../observability/structured-errors'

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import {
  DEFAULT_CODEX_PROVIDER_SETTINGS,
  approvalRequestIdSchema,
  messageIdSchema,
  type ApprovalRequestId,
  type ModelReasoningEffortOption,
  type ProviderModel,
  type ProviderModelCapabilities,
  type ProviderSnapshot,
  type RuntimeMode,
  type ThreadId,
  type TurnId,
} from '@workspace/contracts'
import * as v from 'valibot'
import type {
  ProviderAdapter,
  ProviderAdapterSession,
  ProviderApprovalResponseInput,
  ProviderRuntimeEvent,
  ProviderThreadSnapshot,
  ProviderSessionStartInput,
  ProviderTurnInput,
  ProviderUserInputResponseInput,
} from '../types'
import { ProviderRuntimeEventStream } from '../provider-runtime-event-stream'
import {
  providerTurnSummary,
  recordChatPipelineInfo,
  recordChatPipelineWarning,
} from '../../orchestration/orchestration-logging'
import {
  CODEX_CLIENT_REQUEST_METHODS,
  V2ThreadTokenUsageUpdatedNotificationSchema,
  codexServerNotification,
  parseCodexClientRequestParams,
  parseCodexClientRequestResult,
  type CodexClientRequestMethod,
  type CodexClientRequestParamsByMethod,
  type CodexClientRequestResultByMethod,
  type CodexServerNotificationParamsByMethod,
} from './codex-protocol'
import { providerErrorMessage } from './utils/adapters'
import { activeProviderTurn, type ActiveProviderTurn } from './utils/active-turn'
import { modelOptionValue, type ModelOptions } from './utils/model-options'
import { asRecord, numberField, stringField } from './utils/records'
import { isPresent, noop, runtimeEventId } from './utils/runtime-ids'
import { sessionInputFromTurn } from './utils/session-input'
import { normalizeWorkspaceCwd } from './utils/workspace-cwd'
import { canonicalTurnId, parseOptionalTurnId } from './utils/turn-ids'

const DEFAULT_CODEX_BINARY = 'codex'
const DEFAULT_CODEX_MODEL = 'gpt-5.5'
const REQUEST_TIMEOUT_MS = 30_000
const PROVIDER_PROBE_TIMEOUT_MS = 8_000
const ANSI_ESCAPE_CHAR = String.fromCharCode(27)
const ANSI_ESCAPE_REGEX = new RegExp(`${ANSI_ESCAPE_CHAR}\\[[0-9;]*m`, 'g')
const CODEX_STDERR_LOG_REGEX =
  /^\d{4}-\d{2}-\d{2}T\S+\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+\S+:\s+(.*)$/
const BENIGN_CODEX_STDERR_ERROR_SNIPPETS = [
  'state db missing rollout path for thread',
  'state db record_discrepancy: find_thread_path_by_id_str_in_subdir, falling_back',
]
const CODEX_ADAPTER_CAPABILITIES = {
  readThread: true,
  rollbackThread: true,
  sessionModelSwitch: 'in-session',
  stopAll: true,
} satisfies ProviderAdapter['capabilities']

type JsonRpcId = number | string
type JsonRpcMessage = {
  error?: { code?: number; message?: string } | unknown
  id?: JsonRpcId
  method?: CodexClientRequestMethod | string
  params?: unknown
  result?: unknown
}

type CodexReasoningState = {
  contentParts: Map<number, string>
  itemId: string
  lastEmittedSummary: string | null
  providerTurnId: string
  summaryParts: Map<number, string>
  threadId: ThreadId
  turnId: TurnId
}

type PendingCodexApproval = {
  id: JsonRpcId
  requestType:
    | 'apply_patch_approval'
    | 'command_execution_approval'
    | 'exec_command_approval'
    | 'file_change_approval'
  turnId?: TurnId
}

type PendingCodexUserInput = {
  id: JsonRpcId
  turnId?: TurnId
}

type CodexReasoningItem = {
  content?: unknown
  id: string
  summary?: unknown
  type: 'reasoning'
}

type CodexModelOptions = {
  effort?: CodexReasoningEffort
  serviceTier?: 'fast'
}

type CodexReasoningEffort = NonNullable<CodexClientRequestParamsByMethod['turn/start']['effort']>

type CodexTurnInputItem =
  | { text: string; text_elements: unknown[]; type: 'text' }
  | { type: 'image'; url: string }

export class CodexProviderAdapter implements ProviderAdapter {
  readonly adapterKey = DEFAULT_CODEX_PROVIDER_SETTINGS.providerInstanceId
  readonly capabilities = CODEX_ADAPTER_CAPABILITIES
  readonly driverKind = DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind
  private readonly events = new ProviderRuntimeEventStream()
  private readonly sessions = new Map<ThreadId, CodexAppServerSession>()

  async snapshot(): Promise<ProviderSnapshot> {
    const checkedAt = new Date().toISOString()
    recordChatPipelineInfo('chat.pipeline.codex_adapter.snapshot.start')

    try {
      const probe = await probeCodexProvider()
      recordChatPipelineInfo('chat.pipeline.codex_adapter.snapshot.complete', {
        installed: true,
        modelCount: probe.models.length,
        status: probe.status,
        version: probe.version,
      })

      return {
        ...DEFAULT_CODEX_PROVIDER_SETTINGS,
        auth: probe.auth,
        checkedAt,
        installed: true,
        models: probe.models,
        status: probe.status,
        version: probe.version,
        ...(probe.message ? { message: probe.message } : {}),
      }
    } catch (error) {
      if (isMissingCodexBinaryError(error)) return unavailableCodexSnapshot(checkedAt)

      recordChatPipelineWarning('chat.pipeline.codex_adapter.snapshot.failed', { error })
      return {
        ...DEFAULT_CODEX_PROVIDER_SETTINGS,
        auth: { status: 'unknown' },
        checkedAt,
        installed: true,
        message: providerErrorMessage(error),
        models: [],
        status: 'error',
        version: null,
      }
    }
  }

  async listSessions() {
    return Array.from(this.sessions.values())
      .filter((session) => session.isActive())
      .map((session) => session.snapshot())
  }

  async hasSession({ threadId }: { threadId: ThreadId }) {
    return Boolean(this.sessions.get(threadId)?.isActive())
  }

  async readThread({ threadId }: { threadId: ThreadId }) {
    return this.requireSession(threadId, 'thread/read').readThread()
  }

  async rollbackThread({ numTurns, threadId }: { numTurns: number; threadId: ThreadId }) {
    if (!Number.isInteger(numTurns) || numTurns < 1) {
      throw createInternalError('Codex thread rollback requires numTurns to be an integer >= 1.')
    }

    return this.requireSession(threadId, 'thread/rollback').rollbackThread(numTurns)
  }

  streamEvents() {
    return this.events.stream()
  }

  async startSession(input: ProviderSessionStartInput) {
    const session = await this.ensureRuntimeSession(input)
    return session.snapshot()
  }

  async sendTurn(input: ProviderTurnInput) {
    recordChatPipelineInfo('chat.pipeline.codex_adapter.start_turn.start', {
      ...providerTurnSummary(input),
    })
    const session = await this.ensureRuntimeSession(sessionInputFromTurn(input))
    await session.sendTurn({
      input,
      messageId: v.parse(messageIdSchema, `assistant:${input.turnId}`),
    })
    recordChatPipelineInfo('chat.pipeline.codex_adapter.start_turn.complete', {
      ...providerTurnSummary(input),
    })
  }

  async interruptTurn({ threadId, turnId }: { threadId: ThreadId; turnId?: TurnId }) {
    recordChatPipelineInfo('chat.pipeline.codex_adapter.interrupt', { threadId, turnId })
    await this.sessions.get(threadId)?.interruptTurn(turnId)
  }

  async stopSession({ threadId }: { threadId: ThreadId }) {
    recordChatPipelineInfo('chat.pipeline.codex_adapter.stop', { threadId })
    const session = this.sessions.get(threadId)
    if (!session) return

    this.sessions.delete(threadId)
    await session.close()
  }

  async stopAll() {
    recordChatPipelineInfo('chat.pipeline.codex_adapter.stop_all', {
      sessionCount: this.sessions.size,
    })
    const sessions = Array.from(this.sessions.values())
    this.sessions.clear()
    for (const session of sessions) {
      await session.close()
    }
  }

  async respondApproval(input: ProviderApprovalResponseInput) {
    await this.requireSession(input.threadId, 'approval/respond').respondApproval(input)
  }

  async respondUserInput(input: ProviderUserInputResponseInput) {
    await this.requireSession(input.threadId, 'user-input/respond').respondUserInput(input)
  }

  private async ensureRuntimeSession(input: ProviderSessionStartInput) {
    const existing = this.sessions.get(input.threadId)
    const cwd = normalizeWorkspaceCwd(input.cwd)
    const model = normalizeCodexModel(input.modelSelection.model)
    const modelOptions = codexModelOptions(input)
    if (existing?.matches({ cwd, model, runtimeMode: input.runtimeMode })) {
      recordChatPipelineInfo('chat.pipeline.codex_adapter.session.reuse', {
        model,
        runtimeMode: input.runtimeMode,
        threadId: input.threadId,
      })
      return existing
    }

    if (existing) {
      recordChatPipelineInfo('chat.pipeline.codex_adapter.session.replace', {
        model,
        runtimeMode: input.runtimeMode,
        threadId: input.threadId,
      })
      this.sessions.delete(input.threadId)
      await existing.close()
    }

    recordChatPipelineInfo('chat.pipeline.codex_adapter.session.start', {
      model,
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
    })
    const session = await CodexAppServerSession.start({
      cwd,
      emit: (event) => this.events.publish(event),
      model,
      modelOptions,
      providerInstanceId: input.providerInstanceId,
      resumeCursor: input.resumeCursor,
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
    })
    this.sessions.set(input.threadId, session)
    recordChatPipelineInfo('chat.pipeline.codex_adapter.session.started', {
      model,
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
    })

    return session
  }

  private requireSession(threadId: ThreadId, operation: string) {
    const session = this.sessions.get(threadId)
    if (session?.isActive()) return session

    throw createInternalError(
      `Codex ${operation} requires an active session for thread ${threadId}.`,
    )
  }
}

class CodexAppServerSession {
  private readonly canonicalTurnByProviderTurnId = new Map<string, TurnId>()
  private readonly client: CodexAppServerRpcClient
  private readonly cwd: string
  private readonly emit: (event: ProviderRuntimeEvent) => void
  private readonly model: string
  private readonly pendingApprovals = new Map<ApprovalRequestId, PendingCodexApproval>()
  private readonly pendingUserInputs = new Map<ApprovalRequestId, PendingCodexUserInput>()
  private readonly providerInstanceId: ProviderTurnInput['providerInstanceId']
  private readonly providerSessionId: string
  private readonly providerThreadId: string
  private readonly resumeCursor: unknown | null
  private readonly reasoningItems = new Map<string, CodexReasoningState>()
  private readonly runtimeMode: RuntimeMode
  private readonly threadId: ThreadId
  private readonly turns = new Map<string, ActiveProviderTurn>()
  private activeProviderTurnId: string | null = null
  private pendingTurn: ActiveProviderTurn | null = null
  private status: ProviderAdapterSession['status'] = 'ready'

  private constructor(input: {
    client: CodexAppServerRpcClient
    cwd: string
    emit: (event: ProviderRuntimeEvent) => void
    model: string
    providerInstanceId: ProviderTurnInput['providerInstanceId']
    providerThreadId: string
    resumeCursor: unknown | null
    runtimeMode: RuntimeMode
    threadId: ThreadId
  }) {
    this.client = input.client
    this.cwd = input.cwd
    this.emit = input.emit
    this.model = input.model
    this.providerInstanceId = input.providerInstanceId
    this.providerSessionId = `codex:${input.providerThreadId}`
    this.providerThreadId = input.providerThreadId
    this.resumeCursor = input.resumeCursor
    this.runtimeMode = input.runtimeMode
    this.threadId = input.threadId
    this.client.onMessage((message) => this.handleMessage(message))
  }

  static async start(input: {
    cwd: string
    emit: (event: ProviderRuntimeEvent) => void
    model: string
    modelOptions: CodexModelOptions
    providerInstanceId: ProviderTurnInput['providerInstanceId']
    resumeCursor?: unknown | null
    runtimeMode: RuntimeMode
    threadId: ThreadId
  }) {
    recordChatPipelineInfo('chat.pipeline.codex_session.start', {
      model: input.model,
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
    })
    const client = CodexAppServerRpcClient.start()
    try {
      await initializeCodexClient(client)
      const response = await openCodexThread(client, input)
      const providerThreadId = readThreadIdFromThreadResponse(response)
      recordChatPipelineInfo('chat.pipeline.codex_session.started', {
        providerThreadId,
        threadId: input.threadId,
      })

      const session = new CodexAppServerSession({
        client,
        cwd: input.cwd,
        emit: input.emit,
        model: input.model,
        providerInstanceId: input.providerInstanceId,
        providerThreadId,
        resumeCursor: providerThreadId,
        runtimeMode: input.runtimeMode,
        threadId: input.threadId,
      })
      session.emitSessionStarted(input.resumeCursor ?? null)
      session.emitThreadStarted()

      return session
    } catch (error) {
      recordChatPipelineWarning('chat.pipeline.codex_session.start.failed', {
        error,
        threadId: input.threadId,
      })
      client.close()
      throw error
    }
  }

  matches(input: { cwd: string; model: string; runtimeMode: RuntimeMode }) {
    if (this.client.isClosed()) return false
    if (this.cwd !== input.cwd) return false
    if (this.model !== input.model) return false

    return this.runtimeMode === input.runtimeMode
  }

  isActive() {
    return !this.client.isClosed() && this.status !== 'stopped'
  }

  snapshot(): ProviderAdapterSession {
    return {
      cwd: this.cwd,
      model: this.model,
      providerInstanceId: this.providerInstanceId,
      providerSessionId: this.providerSessionId,
      providerThreadId: this.providerThreadId,
      resumeCursor: this.resumeCursor,
      runtimeMode: this.runtimeMode,
      status: this.status,
      threadId: this.threadId,
    }
  }

  async readThread(): Promise<ProviderThreadSnapshot> {
    const response = await this.client.request('thread/read', {
      includeTurns: true,
      threadId: this.providerThreadId,
    })

    return providerThreadSnapshot(this.threadId, response)
  }

  async rollbackThread(numTurns: number): Promise<ProviderThreadSnapshot> {
    const response = await this.client.request('thread/rollback', {
      numTurns,
      threadId: this.providerThreadId,
    })
    this.status = 'ready'

    return providerThreadSnapshot(this.threadId, response)
  }

  async sendTurn({ input, messageId }: { input: ProviderTurnInput; messageId: string }) {
    recordChatPipelineInfo('chat.pipeline.codex_session.send_turn.start', {
      ...providerTurnSummary(input),
      messageId,
      providerSessionId: this.providerSessionId,
      providerThreadId: this.providerThreadId,
    })
    const activeTurn = activeProviderTurn({
      canonicalTurnId: input.turnId,
      messageId,
    })
    this.pendingTurn = activeTurn
    void activeTurn.promise.catch(noop)

    this.ingestSession('running', input.turnId)
    try {
      recordChatPipelineInfo('chat.pipeline.codex_session.turn_start_request', {
        providerThreadId: this.providerThreadId,
        threadId: this.threadId,
        turnId: input.turnId,
      })
      const response = await this.client.request('turn/start', turnStartParams(this, input))
      const providerTurnId = readTurnIdFromTurnResponse(response)
      recordChatPipelineInfo('chat.pipeline.codex_session.turn_start_response', {
        providerThreadId: this.providerThreadId,
        providerTurnId,
        threadId: this.threadId,
        turnId: input.turnId,
      })
      if (activeTurn.settled()) {
        await activeTurn.promise
        return
      }

      this.attachProviderTurn(providerTurnId, activeTurn)
      await this.settleIfTurnAlreadyTerminal(response, providerTurnId)
    } catch (error) {
      if (activeTurn.settled()) {
        await activeTurn.promise
        return
      }

      this.clearPendingTurn(activeTurn)
      this.rejectUnmappedTurn(activeTurn, error)
      recordChatPipelineWarning('chat.pipeline.codex_session.send_turn.failed', {
        error,
        threadId: this.threadId,
        turnId: input.turnId,
      })
      this.status = 'error'
      throw error
    }

    await activeTurn.promise
    recordChatPipelineInfo('chat.pipeline.codex_session.send_turn.complete', {
      threadId: this.threadId,
      turnId: input.turnId,
    })
  }

  providerThreadIdForTurn() {
    return this.providerThreadId
  }

  async interruptTurn(turnId: TurnId | undefined) {
    const providerTurnId = this.providerTurnIdForCanonical(turnId)
    if (!providerTurnId) {
      recordChatPipelineWarning('chat.pipeline.codex_session.interrupt.missing_provider_turn', {
        threadId: this.threadId,
        turnId,
      })
      return
    }

    recordChatPipelineInfo('chat.pipeline.codex_session.interrupt_request', {
      providerTurnId,
      threadId: this.threadId,
      turnId,
    })
    await this.client.request('turn/interrupt', {
      threadId: this.providerThreadId,
      turnId: providerTurnId,
    })
  }

  async close() {
    recordChatPipelineInfo('chat.pipeline.codex_session.close', {
      providerSessionId: this.providerSessionId,
      threadId: this.threadId,
    })
    this.status = 'stopped'
    this.rejectAllTurns(createInternalError('Codex session stopped.'))
    this.client.close()
  }

  private emitSessionStarted(resumeCursor: unknown | null) {
    this.status = 'ready'
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-session-started'),
      payload: { resume: resumeCursor ?? this.resumeCursor },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerName: DEFAULT_CODEX_PROVIDER_SETTINGS.displayLabel,
      providerSessionId: this.providerSessionId,
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      type: 'session.started',
    })
  }

  private emitThreadStarted() {
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-thread-started'),
      payload: { providerThreadId: this.providerThreadId },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerName: DEFAULT_CODEX_PROVIDER_SETTINGS.displayLabel,
      providerSessionId: this.providerSessionId,
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      type: 'thread.started',
    })
  }

  async respondApproval(input: ProviderApprovalResponseInput) {
    const pending = this.pendingApprovals.get(input.requestId)
    if (!pending) throw createInternalError(`Unknown pending approval request: ${input.requestId}`)

    this.pendingApprovals.delete(input.requestId)
    this.client.respondSuccess(pending.id, { decision: input.decision })
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-request-resolved'),
      payload: {
        decision: input.decision,
        requestType: pending.requestType,
        resolution: { decision: input.decision },
      },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerSessionId: this.providerSessionId,
      requestId: input.requestId,
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId: pending.turnId,
      type: 'request.resolved',
    })
  }

  async respondUserInput(input: ProviderUserInputResponseInput) {
    const pending = this.pendingUserInputs.get(input.requestId)
    if (!pending)
      throw createInternalError(`Unknown pending user-input request: ${input.requestId}`)

    this.pendingUserInputs.delete(input.requestId)
    this.client.respondSuccess(pending.id, { answers: input.answers })
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-user-input-resolved'),
      payload: { answers: input.answers },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerSessionId: this.providerSessionId,
      requestId: input.requestId,
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId: pending.turnId,
      type: 'user-input.resolved',
    })
  }

  private handleMessage(message: JsonRpcMessage) {
    if (!message.method) return
    recordChatPipelineInfo('chat.pipeline.codex_session.message', {
      hasId: message.id !== undefined,
      method: message.method,
      threadId: this.threadId,
    })
    if (message.id !== undefined) {
      void this.handleServerRequest(message).catch((error) => {
        this.client.respondError(message.id as JsonRpcId, -32000, providerErrorMessage(error))
      })
      return
    }
    void this.handleNotification(message).catch((error) => this.rejectActiveTurn(error))
  }

  private async handleServerRequest(message: JsonRpcMessage) {
    if (!message.method || message.id === undefined) return
    if (this.handleApprovalRequest(message)) return
    if (this.handleUserInputRequest(message)) return

    this.client.respondError(message.id, -32601, `Unsupported Codex request: ${message.method}`)
  }

  private handleApprovalRequest(message: JsonRpcMessage) {
    const method = message.method
    if (!method) return false

    const requestType = approvalRequestType(method)
    if (!requestType) return false

    const requestId = v.parse(approvalRequestIdSchema, `codex:${crypto.randomUUID()}`)
    const params = asRecord(message.params)
    const turnId = parseOptionalTurnId(stringField(params, 'turnId'))
    const itemId = stringField(params, 'itemId') ?? stringField(params, 'approvalId') ?? undefined
    this.pendingApprovals.set(requestId, { id: message.id as JsonRpcId, requestType, turnId })
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-request-opened'),
      itemId,
      payload: {
        args: message.params,
        detail: approvalRequestDetail(requestType, params),
        requestType,
      },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerRefs: {
        providerItemId: itemId,
        providerRequestId: stringField(params, 'approvalId') ?? String(message.id),
        providerTurnId: stringField(params, 'turnId') ?? undefined,
      },
      providerSessionId: this.providerSessionId,
      raw: rawRequest(method, message.params),
      requestId,
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId,
      type: 'request.opened',
    })

    return true
  }

  private handleUserInputRequest(message: JsonRpcMessage) {
    if (message.method !== 'item/tool/requestUserInput') return false

    const requestId = v.parse(approvalRequestIdSchema, `codex:${crypto.randomUUID()}`)
    const params = asRecord(message.params)
    const turnId = parseOptionalTurnId(stringField(params, 'turnId'))
    const itemId = stringField(params, 'itemId') ?? undefined
    this.pendingUserInputs.set(requestId, { id: message.id as JsonRpcId, turnId })
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-user-input-requested'),
      itemId,
      payload: { questions: userInputQuestions(params) },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerRefs: {
        providerItemId: itemId,
        providerRequestId: String(message.id),
        providerTurnId: stringField(params, 'turnId') ?? undefined,
      },
      providerSessionId: this.providerSessionId,
      raw: rawRequest('item/tool/requestUserInput', message.params),
      requestId,
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId,
      type: 'user-input.requested',
    })

    return true
  }

  private async handleNotification(message: JsonRpcMessage) {
    if (!message.method) return

    if (await this.handleManualNotification(message.method, message.params)) return

    const notification = codexServerNotification(message.method, message.params)
    if (!notification) return

    switch (notification.method) {
      case 'thread/started':
        this.handleThreadStartedNotification(notification.params)
        return
      case 'turn/started':
        this.handleTurnStarted(notification.params)
        return
      case 'item/agentMessage/delta':
        await this.handleAgentMessageDelta(notification.params)
        return
      case 'turn/completed':
        await this.handleTurnCompleted(notification.params)
        return
      case 'error':
        this.handleErrorNotification(notification.params)
        return
    }
  }

  private handleThreadStartedNotification(
    params: CodexServerNotificationParamsByMethod['thread/started'],
  ) {
    const providerThreadId = readProviderThreadId(params.thread)
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-thread-started-notification'),
      payload: { providerThreadId },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerName: DEFAULT_CODEX_PROVIDER_SETTINGS.displayLabel,
      providerSessionId: this.providerSessionId,
      raw: rawNotification('thread/started', params),
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      type: 'thread.started',
    })
  }

  private async handleManualNotification(method: string, params: unknown) {
    switch (method) {
      case 'process/stderr':
        return this.handleProcessStderrNotification(params)
      case 'thread/status/changed':
        return this.handleThreadStatusChangedNotification(params)
      case 'thread/name/updated':
        return this.handleThreadNameUpdatedNotification(params)
      case 'thread/tokenUsage/updated':
        return this.handleThreadTokenUsageUpdatedNotification(params)
      case 'turn/diff/updated':
        return this.handleTurnDiffUpdatedNotification(params)
      case 'turn/plan/updated':
        return this.handleTurnPlanUpdatedNotification(params)
      case 'item/plan/delta':
        return this.handlePlanDeltaNotification(params)
      case 'command/exec/outputDelta':
      case 'item/commandExecution/outputDelta':
        return this.handleCommandOutputDeltaNotification(method, params)
      case 'item/fileChange/outputDelta':
        return this.handleFileChangeOutputDeltaNotification(params)
      case 'serverRequest/resolved':
        return this.handleServerRequestResolvedNotification(params)
      case 'hook/started':
        return this.handleHookStartedNotification(params)
      case 'hook/completed':
        return this.handleHookCompletedNotification(params)
      case 'item/mcpToolCall/progress':
        return this.handleMcpToolCallProgressNotification(params)
      case 'mcpServer/oauthLogin/completed':
        return this.handleMcpOauthCompletedNotification(params)
      case 'mcpServer/startupStatus/updated':
        return this.handleMcpStatusUpdatedNotification(params)
      case 'account/updated':
        return this.handleAccountUpdatedNotification(params)
      case 'account/rateLimits/updated':
        return this.handleAccountRateLimitsUpdatedNotification(params)
      case 'model/rerouted':
        return this.handleModelReroutedNotification(params)
      case 'warning':
      case 'configWarning':
      case 'deprecationNotice':
        return this.handleWarningLikeNotification(method, params)
      case 'thread/compacted':
        return this.handleThreadCompactedNotification(params)
      case 'thread/realtime/started':
      case 'thread/realtime/itemAdded':
      case 'thread/realtime/outputAudio/delta':
      case 'thread/realtime/error':
      case 'thread/realtime/closed':
        return this.handleRealtimeNotification(method, params)
      case 'item/started':
        return this.handleItemStartedNotification(params)
      case 'item/completed':
        return this.handleItemCompletedNotification(params)
      case 'item/reasoning/summaryPartAdded':
        this.handleReasoningSummaryPartAddedNotification(params)
        return true
      case 'item/reasoning/summaryTextDelta':
        await this.handleReasoningSummaryTextDeltaNotification(params)
        return true
      case 'item/reasoning/textDelta':
        await this.handleReasoningTextDeltaNotification(params)
        return true
      default:
        return false
    }
  }

  private handleProcessStderrNotification(params: unknown) {
    const message = stringField(asRecord(params), 'message')
    if (!message) return true

    this.emitRuntimeNotification(
      'runtime.warning',
      { detail: params, message },
      'process/stderr',
      params,
    )
    return true
  }

  private handleThreadStatusChangedNotification(params: unknown) {
    const state = threadStateFromValue(stringField(asRecord(params), 'status'))
    this.emitRuntimeNotification(
      'thread.state.changed',
      { detail: params, state },
      'thread/status/changed',
      params,
    )
    return true
  }

  private handleThreadNameUpdatedNotification(params: unknown) {
    const name = stringField(asRecord(params), 'name') ?? stringField(asRecord(params), 'title')
    this.emitRuntimeNotification(
      'thread.metadata.updated',
      { metadata: asRecord(params), ...(name ? { name } : {}) },
      'thread/name/updated',
      params,
    )
    return true
  }

  private handleThreadTokenUsageUpdatedNotification(params: unknown) {
    this.emitRuntimeNotification(
      'thread.token-usage.updated',
      { usage: tokenUsageSnapshot(params) },
      'thread/tokenUsage/updated',
      params,
    )
    return true
  }

  private handleTurnDiffUpdatedNotification(params: unknown) {
    this.emitRuntimeNotification(
      'turn.diff.updated',
      { unifiedDiff: stringField(asRecord(params), 'unifiedDiff') ?? '' },
      'turn/diff/updated',
      params,
    )
    return true
  }

  private handleTurnPlanUpdatedNotification(params: unknown) {
    this.emitRuntimeNotification(
      'turn.plan.updated',
      turnPlanPayload(params),
      'turn/plan/updated',
      params,
    )
    return true
  }

  private handlePlanDeltaNotification(params: unknown) {
    const record = asRecord(params)
    this.emitRuntimeNotification(
      'content.delta',
      {
        delta: stringField(record, 'delta') ?? '',
        streamKind: 'plan_text',
      },
      'item/plan/delta',
      params,
      { itemId: stringField(record, 'itemId') ?? undefined },
    )
    return true
  }

  private handleCommandOutputDeltaNotification(method: string, params: unknown) {
    const record = asRecord(params)
    this.emitRuntimeNotification(
      'content.delta',
      {
        delta: stringField(record, 'delta') ?? stringField(record, 'output') ?? '',
        streamKind: 'command_output',
      },
      method,
      params,
      { itemId: stringField(record, 'itemId') ?? undefined },
    )
    return true
  }

  private handleFileChangeOutputDeltaNotification(params: unknown) {
    const record = asRecord(params)
    this.emitRuntimeNotification(
      'content.delta',
      {
        delta: stringField(record, 'delta') ?? stringField(record, 'output') ?? '',
        streamKind: 'file_change_output',
      },
      'item/fileChange/outputDelta',
      params,
      { itemId: stringField(record, 'itemId') ?? undefined },
    )
    return true
  }

  private handleServerRequestResolvedNotification(params: unknown) {
    const record = asRecord(params)
    this.emitRuntimeNotification(
      'request.resolved',
      {
        decision: stringField(record, 'decision') ?? undefined,
        requestType: requestTypeFromRecord(record),
        resolution: params,
      },
      'serverRequest/resolved',
      params,
      { requestId: stringField(record, 'requestId') ?? undefined },
    )
    return true
  }

  private handleHookStartedNotification(params: unknown) {
    const record = asRecord(params)
    this.emitRuntimeNotification(
      'hook.started',
      {
        hookEvent: stringField(record, 'hookEvent') ?? 'unknown',
        hookId: stringField(record, 'hookId') ?? `hook:${crypto.randomUUID()}`,
        hookName: stringField(record, 'hookName') ?? 'Hook',
      },
      'hook/started',
      params,
    )
    return true
  }

  private handleHookCompletedNotification(params: unknown) {
    const record = asRecord(params)
    this.emitRuntimeNotification(
      'hook.completed',
      {
        exitCode: numberField(record, 'exitCode') ?? undefined,
        hookId: stringField(record, 'hookId') ?? `hook:${crypto.randomUUID()}`,
        outcome: hookOutcome(record),
        output: stringField(record, 'output') ?? undefined,
        stderr: stringField(record, 'stderr') ?? undefined,
        stdout: stringField(record, 'stdout') ?? undefined,
      },
      'hook/completed',
      params,
    )
    return true
  }

  private handleMcpToolCallProgressNotification(params: unknown) {
    const record = asRecord(params)
    this.emitRuntimeNotification(
      'tool.progress',
      {
        summary: stringField(record, 'summary') ?? stringField(record, 'message') ?? undefined,
        toolName: stringField(record, 'toolName') ?? undefined,
        toolUseId: stringField(record, 'toolUseId') ?? undefined,
      },
      'item/mcpToolCall/progress',
      params,
    )
    return true
  }

  private handleMcpOauthCompletedNotification(params: unknown) {
    const record = asRecord(params)
    this.emitRuntimeNotification(
      'mcp.oauth.completed',
      {
        error: stringField(record, 'error') ?? undefined,
        name: stringField(record, 'name') ?? undefined,
        success: Boolean(record.success),
      },
      'mcpServer/oauthLogin/completed',
      params,
    )
    return true
  }

  private handleMcpStatusUpdatedNotification(params: unknown) {
    this.emitRuntimeNotification(
      'mcp.status.updated',
      { status: params },
      'mcpServer/startupStatus/updated',
      params,
    )
    return true
  }

  private handleAccountUpdatedNotification(params: unknown) {
    this.emitRuntimeNotification('account.updated', { account: params }, 'account/updated', params)
    return true
  }

  private handleAccountRateLimitsUpdatedNotification(params: unknown) {
    this.emitRuntimeNotification(
      'account.rate-limits.updated',
      { rateLimits: params },
      'account/rateLimits/updated',
      params,
    )
    return true
  }

  private handleModelReroutedNotification(params: unknown) {
    const record = asRecord(params)
    this.emitRuntimeNotification(
      'model.rerouted',
      {
        fromModel: stringField(record, 'fromModel') ?? this.model,
        reason: stringField(record, 'reason') ?? 'Model rerouted',
        toModel: stringField(record, 'toModel') ?? this.model,
      },
      'model/rerouted',
      params,
    )
    return true
  }

  private handleWarningLikeNotification(method: string, params: unknown) {
    const record = asRecord(params)
    const summary = stringField(record, 'summary') ?? stringField(record, 'message') ?? method
    if (method === 'configWarning') {
      this.emitRuntimeNotification(
        'config.warning',
        {
          details: stringField(record, 'details') ?? undefined,
          path: stringField(record, 'path') ?? undefined,
          range: record.range,
          summary,
        },
        method,
        params,
      )
      return true
    }
    if (method === 'deprecationNotice') {
      this.emitRuntimeNotification(
        'deprecation.notice',
        { details: stringField(record, 'details') ?? undefined, summary },
        method,
        params,
      )
      return true
    }

    this.emitRuntimeNotification(
      'runtime.warning',
      { detail: params, message: summary },
      method,
      params,
    )
    return true
  }

  private handleThreadCompactedNotification(params: unknown) {
    this.emitRuntimeNotification(
      'thread.state.changed',
      { detail: params, state: 'compacted' },
      'thread/compacted',
      params,
    )
    return true
  }

  private handleRealtimeNotification(method: string, params: unknown) {
    this.emitRuntimeNotification(
      realtimeEventType(method),
      realtimePayload(method, params),
      method,
      params,
    )
    return true
  }

  private emitRuntimeNotification(
    type: ProviderRuntimeEvent['type'],
    payload: unknown,
    method: string,
    params: unknown,
    options: { itemId?: string; requestId?: string } = {},
  ) {
    const record = asRecord(params)
    const providerTurnId = stringField(record, 'turnId') ?? undefined
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId(`codex-${type}`),
      itemId: options.itemId ?? stringField(record, 'itemId') ?? undefined,
      payload,
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerRefs: {
        providerItemId: options.itemId ?? stringField(record, 'itemId') ?? undefined,
        providerRequestId: options.requestId,
        providerTurnId,
      },
      providerSessionId: this.providerSessionId,
      raw: rawNotification(method, params),
      requestId: options.requestId,
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId: canonicalTurnId(this.canonicalTurnByProviderTurnId, providerTurnId),
      type,
    } as ProviderRuntimeEvent)
  }

  private async handleItemStartedNotification(params: unknown) {
    const item = notificationItem(params)
    if (!isReasoningItem(item)) return this.handleGenericItemLifecycle('item.started', params, item)

    const context = codexItemNotificationContext(params, 'startedAtMs')
    if (!context) return true

    const turn = this.turnForProviderTurnId(context.providerTurnId)
    if (!turn) {
      this.recordMissingReasoningTurn(context.providerTurnId, 'item_started')
      return true
    }

    const state = this.getOrCreateReasoningState(context.providerTurnId, item.id, turn)
    await this.emitReasoningProgress({
      createdAt: context.createdAt,
      eventId: reasoningRuntimeEventId('start', context.providerTurnId, item.id),
      state,
      summary: 'Thinking',
      updateLastEmitted: false,
    })
    return true
  }

  private async handleItemCompletedNotification(params: unknown) {
    const item = notificationItem(params)
    if (!isReasoningItem(item)) {
      const handled = await this.handleAssistantMessageItemCompleted(params, item)
      if (handled) return true

      return this.handleGenericItemLifecycle('item.completed', params, item)
    }

    const context = codexItemNotificationContext(params, 'completedAtMs')
    if (!context) return true

    const turn = this.turnForProviderTurnId(context.providerTurnId)
    if (!turn) {
      this.recordMissingReasoningTurn(context.providerTurnId, 'item_completed')
      return true
    }

    await this.emitCompletedReasoningItem(context.providerTurnId, item, turn, context.createdAt)
    return true
  }

  private handleGenericItemLifecycle(
    type: 'item.completed' | 'item.started',
    params: unknown,
    item: unknown,
  ) {
    const record = asRecord(item)
    const context = codexItemNotificationContext(
      params,
      type === 'item.started' ? 'startedAtMs' : 'completedAtMs',
    )
    if (!context) return true

    this.emit({
      createdAt: context.createdAt,
      eventId: runtimeEventId(`codex-${type}`),
      itemId: stringField(record, 'id') ?? undefined,
      payload: {
        data: item,
        detail: itemDetail(record),
        itemType: canonicalItemType(stringField(record, 'type')),
        status: type === 'item.started' ? 'inProgress' : 'completed',
        title: itemTitle(record),
      },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerRefs: {
        providerItemId: stringField(record, 'id') ?? undefined,
        providerTurnId: context.providerTurnId,
      },
      providerSessionId: this.providerSessionId,
      raw: rawNotification(type.replace('.', '/'), params),
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId: canonicalTurnId(this.canonicalTurnByProviderTurnId, context.providerTurnId),
      type,
    })
    return true
  }

  private async handleAssistantMessageItemCompleted(params: unknown, item: unknown) {
    if (!isAssistantMessageItem(item)) return false

    const context = codexItemNotificationContext(params, 'completedAtMs')
    if (!context) return true

    const turn = this.turnForProviderTurnId(context.providerTurnId)
    if (!turn) {
      recordChatPipelineWarning('chat.pipeline.codex_session.assistant_item.missing_turn', {
        itemId: item.id,
        providerTurnId: context.providerTurnId,
        threadId: this.threadId,
      })
      return true
    }

    this.emit({
      createdAt: context.createdAt,
      eventId: runtimeEventId('codex-assistant-item-complete'),
      itemId: item.id,
      payload: {
        detail: item.text,
        itemType: 'assistant_message',
        status: 'completed',
        title: 'Assistant message',
      },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerRefs: { providerItemId: item.id, providerTurnId: context.providerTurnId },
      providerSessionId: this.providerSessionId,
      raw: rawNotification('item/completed', params),
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
      type: 'item.completed',
    })
    return true
  }

  private handleReasoningSummaryPartAddedNotification(params: unknown) {
    const context = codexReasoningPartContext(params)
    if (!context) return

    const turn = this.turnForProviderTurnId(context.providerTurnId)
    if (!turn) {
      this.recordMissingReasoningTurn(context.providerTurnId, 'summary_part_added')
      return
    }

    const state = this.getOrCreateReasoningState(context.providerTurnId, context.itemId, turn)
    if (!state.summaryParts.has(context.summaryIndex)) {
      state.summaryParts.set(context.summaryIndex, '')
    }
  }

  private async handleReasoningSummaryTextDeltaNotification(params: unknown) {
    const context = codexReasoningDeltaContext(params)
    if (!context) return

    const turn = this.turnForProviderTurnId(context.providerTurnId)
    if (!turn) {
      this.recordMissingReasoningTurn(context.providerTurnId, 'summary_text_delta')
      return
    }

    const state = this.getOrCreateReasoningState(context.providerTurnId, context.itemId, turn)
    appendReasoningPart(state.summaryParts, context.summaryIndex, context.delta)
    await this.emitBufferedReasoningProgress(state, context.createdAt)
  }

  private async handleReasoningTextDeltaNotification(params: unknown) {
    const context = codexReasoningDeltaContext(params, 'contentIndex')
    if (!context) return

    const turn = this.turnForProviderTurnId(context.providerTurnId)
    if (!turn) {
      this.recordMissingReasoningTurn(context.providerTurnId, 'text_delta')
      return
    }

    const state = this.getOrCreateReasoningState(context.providerTurnId, context.itemId, turn)
    appendReasoningPart(state.contentParts, context.contentIndex, context.delta)
    await this.emitBufferedReasoningProgress(state, context.createdAt)
  }

  private async handleAgentMessageDelta(
    params: CodexServerNotificationParamsByMethod['item/agentMessage/delta'],
  ) {
    if (!params.delta || !params.turnId) {
      recordChatPipelineWarning('chat.pipeline.codex_session.delta.ignored', {
        deltaLength: params.delta.length,
        hasProviderTurnId: Boolean(params.turnId),
        threadId: this.threadId,
      })
      return
    }

    const turn = this.turnForProviderTurnId(params.turnId)
    if (!turn) {
      recordChatPipelineWarning('chat.pipeline.codex_session.delta.missing_turn', {
        providerTurnId: params.turnId,
        threadId: this.threadId,
      })
      return
    }

    recordChatPipelineInfo('chat.pipeline.codex_session.delta.ingest', {
      deltaLength: params.delta.length,
      messageId: turn.messageId,
      providerTurnId: params.turnId,
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
    })
    this.emit({
      createdAt: new Date().toISOString(),
      itemId: params.itemId,
      eventId: runtimeEventId('codex-assistant-delta'),
      payload: {
        delta: params.delta,
        streamKind: 'assistant_text',
      },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerRefs: { providerItemId: params.itemId, providerTurnId: params.turnId },
      providerSessionId: this.providerSessionId,
      raw: rawNotification('item/agentMessage/delta', params),
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
      type: 'content.delta',
    })
  }

  private handleTurnStarted(params: CodexServerNotificationParamsByMethod['turn/started']) {
    if (!params.turn.id) {
      recordChatPipelineWarning('chat.pipeline.codex_session.turn_started.ignored', {
        threadId: this.threadId,
      })
      return
    }

    recordChatPipelineInfo('chat.pipeline.codex_session.turn_started', {
      providerTurnId: params.turn.id,
      threadId: this.threadId,
    })
    this.attachPendingTurn(params.turn.id)
    const turn = this.turnForProviderTurnId(params.turn.id)
    if (!turn) return

    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-turn-started'),
      payload: { model: this.model },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerRefs: { providerTurnId: params.turn.id },
      providerSessionId: this.providerSessionId,
      raw: rawNotification('turn/started', params),
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
      type: 'turn.started',
    })
  }

  private async handleTurnCompleted(
    params: CodexServerNotificationParamsByMethod['turn/completed'],
  ) {
    if (!params.turn.id) {
      recordChatPipelineWarning('chat.pipeline.codex_session.turn_completed.ignored', {
        threadId: this.threadId,
      })
      return
    }

    const activeTurn = this.turnForProviderTurnId(params.turn.id)
    if (!activeTurn) {
      recordChatPipelineWarning('chat.pipeline.codex_session.turn_completed.missing_turn', {
        providerTurnId: params.turn.id,
        threadId: this.threadId,
      })
      return
    }

    recordChatPipelineInfo('chat.pipeline.codex_session.turn_completed', {
      providerTurnId: params.turn.id,
      status: params.turn.status,
      threadId: this.threadId,
      turnId: activeTurn.canonicalTurnId,
    })
    await this.emitReasoningItemsFromTurn(params.turn, activeTurn)
    if (params.turn.status === 'completed') {
      await this.completeTurn(params.turn.id, activeTurn)
      return
    }
    if (params.turn.status === 'interrupted') {
      this.ingestSession('ready', null)
      this.resolveTurn(params.turn.id, activeTurn)
      return
    }

    this.rejectTurn(params.turn.id, activeTurn, turnErrorMessage(params.turn))
  }

  private handleErrorNotification(params: CodexServerNotificationParamsByMethod['error']) {
    if (params.willRetry === true) return

    const message = errorNotificationMessage(params.error)
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-error-notification'),
      payload: { class: 'provider_error', detail: params.error, message },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerSessionId: this.providerSessionId,
      raw: rawNotification('error', params),
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId: canonicalTurnId(this.canonicalTurnByProviderTurnId, params.turnId ?? undefined),
      type: 'runtime.error',
    })
    if (!params.turnId) {
      this.rejectActiveTurn(createInternalError(message))
      return
    }

    const turn = this.turnForProviderTurnId(params.turnId)
    if (turn) this.rejectTurn(params.turnId, turn, message)
  }

  private async completeTurn(providerTurnId: string, turn: ActiveProviderTurn) {
    const completedAt = new Date().toISOString()
    recordChatPipelineInfo('chat.pipeline.codex_session.complete_turn', {
      messageId: turn.messageId,
      providerTurnId,
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
    })
    this.emit({
      createdAt: completedAt,
      eventId: runtimeEventId('codex-turn-completed'),
      payload: { state: 'completed' },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerRefs: { providerTurnId },
      providerSessionId: this.providerSessionId,
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
      type: 'turn.completed',
    })
    this.emit({
      completedAt,
      eventId: runtimeEventId('codex-assistant-complete'),
      messageId: turn.messageId,
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
      type: 'assistant.complete',
    })
    this.ingestSession('ready', null)
    this.resolveTurn(providerTurnId, turn)
  }

  private async settleIfTurnAlreadyTerminal(
    response: CodexClientRequestResultByMethod['turn/start'],
    providerTurnId: string,
  ) {
    const activeTurn = this.turns.get(providerTurnId)
    if (!activeTurn) return
    if (response.turn.status === 'inProgress') return
    await this.emitReasoningItemsFromTurn(response.turn, activeTurn)
    if (response.turn.status === 'completed') {
      await this.completeTurn(providerTurnId, activeTurn)
      return
    }
    if (response.turn.status === 'interrupted') {
      this.ingestSession('ready', null)
      this.resolveTurn(providerTurnId, activeTurn)
      return
    }

    this.rejectTurn(providerTurnId, activeTurn, turnErrorMessage(response.turn))
  }

  private attachProviderTurn(providerTurnId: string, turn: ActiveProviderTurn) {
    const existing = this.turns.get(providerTurnId)
    if (existing === turn) return
    if (existing) return

    this.clearPendingTurn(turn)
    this.activeProviderTurnId = providerTurnId
    this.canonicalTurnByProviderTurnId.set(providerTurnId, turn.canonicalTurnId)
    this.turns.set(providerTurnId, turn)
  }

  private attachPendingTurn(providerTurnId: string) {
    const turn = this.pendingTurn
    if (!turn) return

    this.attachProviderTurn(providerTurnId, turn)
  }

  private turnForProviderTurnId(providerTurnId: string) {
    const turn = this.turns.get(providerTurnId)
    if (turn) return turn

    this.attachPendingTurn(providerTurnId)
    return this.turns.get(providerTurnId)
  }

  private clearPendingTurn(turn: ActiveProviderTurn) {
    if (this.pendingTurn === turn) this.pendingTurn = null
  }

  private ingestSession(status: 'running' | 'ready', turnId: TurnId | null) {
    this.status = status
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-session'),
      payload: { state: status },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerName: DEFAULT_CODEX_PROVIDER_SETTINGS.displayLabel,
      providerSessionId: this.providerSessionId,
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      ...(turnId ? { turnId } : {}),
      type: 'session.state.changed',
    })
  }

  private providerTurnIdForCanonical(turnId: TurnId | undefined) {
    if (!turnId) return this.activeProviderTurnId

    for (const [providerTurnId, canonicalTurnId] of this.canonicalTurnByProviderTurnId) {
      if (canonicalTurnId === turnId) return providerTurnId
    }

    return this.activeProviderTurnId
  }

  private rejectActiveTurn(error: unknown) {
    const message = providerErrorMessage(error)
    const providerTurnId = this.activeProviderTurnId
    const turn = providerTurnId ? this.turns.get(providerTurnId) : null
    if (providerTurnId && turn) {
      this.rejectTurn(providerTurnId, turn, message)
      return
    }

    if (this.pendingTurn) this.rejectPendingTurn(this.pendingTurn, message)
  }

  private rejectUnmappedTurn(turn: ActiveProviderTurn, error: unknown) {
    if (this.turnsForCanonical(turn.canonicalTurnId).length > 0) return

    turn.reject(createInternalError(providerErrorMessage(error)))
  }

  private rejectAllTurns(error: Error) {
    for (const [providerTurnId, turn] of this.turns) {
      this.turns.delete(providerTurnId)
      turn.reject(error)
    }
    const pendingTurn = this.pendingTurn
    this.pendingTurn = null
    if (pendingTurn) pendingTurn.reject(error)
  }

  private turnsForCanonical(turnId: TurnId) {
    return Array.from(this.canonicalTurnByProviderTurnId.values()).filter(
      (canonicalTurnId) => canonicalTurnId === turnId,
    )
  }

  private rejectTurn(providerTurnId: string, turn: ActiveProviderTurn, message: string) {
    this.turns.delete(providerTurnId)
    this.canonicalTurnByProviderTurnId.delete(providerTurnId)
    this.clearReasoningForProviderTurn(providerTurnId)
    if (this.activeProviderTurnId === providerTurnId) this.activeProviderTurnId = null
    this.status = 'error'
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-turn-failed'),
      payload: { errorMessage: message, state: 'failed' },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerRefs: { providerTurnId },
      providerSessionId: this.providerSessionId,
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
      type: 'turn.completed',
    })
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-runtime-error'),
      payload: { class: 'provider_error', message },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerRefs: { providerTurnId },
      providerSessionId: this.providerSessionId,
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
      type: 'runtime.error',
    })
    turn.reject(createInternalError(message))
  }

  private rejectPendingTurn(turn: ActiveProviderTurn, message: string) {
    this.clearPendingTurn(turn)
    this.status = 'error'
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-turn-failed'),
      payload: { errorMessage: message, state: 'failed' },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerSessionId: this.providerSessionId,
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
      type: 'turn.completed',
    })
    this.emit({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-runtime-error'),
      payload: { class: 'provider_error', message },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerSessionId: this.providerSessionId,
      runtimeMode: this.runtimeMode,
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
      type: 'runtime.error',
    })
    turn.reject(createInternalError(message))
  }

  private resolveTurn(providerTurnId: string, turn: ActiveProviderTurn) {
    this.turns.delete(providerTurnId)
    this.canonicalTurnByProviderTurnId.delete(providerTurnId)
    this.clearReasoningForProviderTurn(providerTurnId)
    if (this.activeProviderTurnId === providerTurnId) this.activeProviderTurnId = null
    turn.resolve()
  }

  private getOrCreateReasoningState(
    providerTurnId: string,
    itemId: string,
    turn: ActiveProviderTurn,
  ) {
    const key = reasoningStateKey(providerTurnId, itemId)
    const existing = this.reasoningItems.get(key)
    if (existing) return existing

    const state: CodexReasoningState = {
      contentParts: new Map(),
      itemId,
      lastEmittedSummary: null,
      providerTurnId,
      summaryParts: new Map(),
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
    }
    this.reasoningItems.set(key, state)

    return state
  }

  private async emitBufferedReasoningProgress(state: CodexReasoningState, createdAt: string) {
    const summary = reasoningStateSummary(state)
    if (!summary) return
    if (!shouldEmitReasoningSummary(state.lastEmittedSummary, summary)) return

    await this.emitReasoningProgress({
      createdAt,
      eventId: runtimeEventId('codex-reasoning-progress'),
      state,
      summary,
      updateLastEmitted: true,
    })
  }

  private async emitCompletedReasoningItem(
    providerTurnId: string,
    item: CodexReasoningItem,
    turn: ActiveProviderTurn,
    createdAt: string,
  ) {
    const state = this.getOrCreateReasoningState(providerTurnId, item.id, turn)
    const summary = reasoningItemSummary(item) ?? reasoningStateSummary(state)
    if (!summary) return
    if (summary === state.lastEmittedSummary) return

    await this.emitReasoningProgress({
      createdAt,
      eventId: reasoningRuntimeEventId('complete', providerTurnId, item.id),
      state,
      summary,
      updateLastEmitted: true,
    })
  }

  private async emitReasoningItemsFromTurn(
    turnValue: {
      readonly completedAt?: number | null
      readonly id: string
      readonly items: readonly unknown[]
    },
    activeTurn: ActiveProviderTurn,
  ) {
    const createdAt = isoFromUnixMs(turnValue.completedAt) ?? new Date().toISOString()
    for (const item of turnValue.items) {
      if (!isReasoningItem(item)) continue
      await this.emitCompletedReasoningItem(turnValue.id, item, activeTurn, createdAt)
    }
  }

  private async emitReasoningProgress(input: {
    createdAt: string
    eventId: string
    state: CodexReasoningState
    summary: string
    updateLastEmitted: boolean
  }) {
    if (input.updateLastEmitted) input.state.lastEmittedSummary = input.summary
    this.emit({
      createdAt: input.createdAt,
      eventId: input.eventId,
      payload: {
        description: input.summary,
        summary: input.summary,
        taskId: `reasoning:${input.state.itemId}`,
      },
      provider: DEFAULT_CODEX_PROVIDER_SETTINGS.driverKind,
      providerInstanceId: this.providerInstanceId,
      providerRefs: {
        providerItemId: input.state.itemId,
        providerTurnId: input.state.providerTurnId,
      },
      providerSessionId: this.providerSessionId,
      runtimeMode: this.runtimeMode,
      threadId: input.state.threadId,
      turnId: input.state.turnId,
      type: 'task.progress',
    })
  }

  private recordMissingReasoningTurn(providerTurnId: string, stage: string) {
    recordChatPipelineWarning('chat.pipeline.codex_session.reasoning.missing_turn', {
      providerTurnId,
      stage,
      threadId: this.threadId,
    })
  }

  private clearReasoningForProviderTurn(providerTurnId: string) {
    for (const key of this.reasoningItems.keys()) {
      if (!key.startsWith(`${providerTurnId}:`)) continue
      this.reasoningItems.delete(key)
    }
  }
}

class CodexAppServerRpcClient {
  private readonly handlers = new Set<(message: JsonRpcMessage) => void>()
  private readonly pending = new Map<
    string,
    {
      method: CodexClientRequestMethod
      reject: (error: Error) => void
      resolve: (value: unknown) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private readonly process: ChildProcessWithoutNullStreams
  private buffer = ''
  private closed = false
  private nextId = 1
  private stderrBuffer = ''

  private constructor(process: ChildProcessWithoutNullStreams) {
    this.process = process
    this.process.stdout.setEncoding('utf8')
    this.process.stderr.setEncoding('utf8')
    this.process.stdout.on('data', (chunk: string) => this.readStdout(chunk))
    this.process.stderr.on('data', (chunk: string) => this.readStderr(chunk))
    this.process.on('error', (error) => this.closeWithError(error))
    this.process.on('exit', (code) => {
      if (!this.closed)
        this.closeWithError(createInternalError(`Codex app-server exited with ${code}.`))
    })
  }

  static start() {
    return new CodexAppServerRpcClient(
      spawn(codexBinary(), ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] }),
    )
  }

  onMessage(handler: (message: JsonRpcMessage) => void) {
    this.handlers.add(handler)
  }

  isClosed() {
    return this.closed
  }

  request<Method extends CodexClientRequestMethod>(
    method: Method,
    params: CodexClientRequestParamsByMethod[Method],
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<CodexClientRequestResultByMethod[Method]> {
    if (this.closed) return Promise.reject(createInternalError('Codex app-server is closed.'))

    const id = this.nextId
    this.nextId += 1
    const parsedParams = parseCodexClientRequestParams(method, params)
    const promise = new Promise<CodexClientRequestResultByMethod[Method]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id))
        reject(createInternalError(`Codex app-server request timed out: ${method}`))
      }, timeoutMs)
      this.pending.set(String(id), {
        method,
        reject,
        resolve: resolve as (value: unknown) => void,
        timer,
      })
    })
    try {
      this.write({ id, method, params: parsedParams })
    } catch (error) {
      this.rejectRequest(id, error)
    }

    return promise
  }

  requestRaw<Result = unknown>(
    method: string,
    params: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<Result> {
    if (this.closed) return Promise.reject(createInternalError('Codex app-server is closed.'))

    const id = this.nextId
    this.nextId += 1
    const promise = new Promise<Result>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id))
        reject(createInternalError(`Codex app-server request timed out: ${method}`))
      }, timeoutMs)
      this.pending.set(String(id), {
        method: method as CodexClientRequestMethod,
        reject,
        resolve: resolve as (value: unknown) => void,
        timer,
      })
    })
    try {
      this.write({ id, method, params })
    } catch (error) {
      this.rejectRequest(id, error)
    }

    return promise
  }

  notify(method: string, params?: unknown) {
    this.write(params === undefined ? { method } : { method, params })
  }

  respondError(id: JsonRpcId, code: number, message: string) {
    this.write({ error: { code, message }, id })
  }

  respondSuccess(id: JsonRpcId, result: unknown) {
    this.write({ id, result })
  }

  close() {
    if (this.closed) return

    this.closed = true
    this.process.kill()
    this.closeWithError(createInternalError('Codex app-server closed.'))
  }

  private write(message: JsonRpcMessage) {
    this.process.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private readStdout(chunk: string) {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      this.handleLine(line)
    }
  }

  private readStderr(chunk: string) {
    this.stderrBuffer += chunk
    const lines = this.stderrBuffer.split('\n')
    this.stderrBuffer = lines.pop() ?? ''
    for (const line of lines) {
      this.handleStderrLine(line)
    }
  }

  private handleLine(line: string) {
    if (!line.trim()) return

    let message: JsonRpcMessage
    try {
      message = parseJsonRpcMessage(line)
    } catch (error) {
      this.closeWithError(createInternalError(providerErrorMessage(error)))
      return
    }
    if (isJsonRpcResponse(message)) {
      this.resolveResponse(message)
      return
    }
    for (const handler of this.handlers) {
      handler(message)
    }
  }

  private resolveResponse(message: JsonRpcMessage) {
    const id = String(message.id)
    const pending = this.pending.get(id)
    if (!pending) return

    clearTimeout(pending.timer)
    this.pending.delete(id)
    if (message.error) {
      pending.reject(createInternalError(jsonRpcErrorMessage(message.error)))
      return
    }

    if (pending.method in CODEX_CLIENT_REQUEST_METHODS) {
      try {
        pending.resolve(parseCodexClientRequestResult(pending.method, message.result))
      } catch (error) {
        pending.reject(createInternalError(providerErrorMessage(error)))
      }
      return
    }

    pending.resolve(message.result)
  }

  private handleStderrLine(line: string) {
    const classified = classifyCodexStderrLine(line)
    if (!classified) return

    for (const handler of this.handlers) {
      handler({ method: 'process/stderr', params: { message: classified.message } })
    }
  }

  private rejectRequest(id: JsonRpcId, error: unknown) {
    const pending = this.pending.get(String(id))
    if (!pending) return

    clearTimeout(pending.timer)
    this.pending.delete(String(id))
    pending.reject(createInternalError(providerErrorMessage(error)))
  }

  private closeWithError(error: Error) {
    this.closed = true
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      this.pending.delete(id)
      pending.reject(error)
    }
  }
}

async function probeCodexProvider() {
  const client = CodexAppServerRpcClient.start()
  try {
    const initialize = await initializeCodexClient(client, PROVIDER_PROBE_TIMEOUT_MS)
    const [account, models] = await Promise.all([
      client.request('account/read', {}, PROVIDER_PROBE_TIMEOUT_MS),
      requestCodexModels(client),
    ])

    return {
      ...accountProbeStatus(account),
      models,
      version: codexVersionFromInitialize(initialize),
    }
  } finally {
    client.close()
  }
}

async function initializeCodexClient(
  client: CodexAppServerRpcClient,
  timeoutMs = REQUEST_TIMEOUT_MS,
) {
  const response = await client.request(
    'initialize',
    {
      capabilities: { experimentalApi: true },
      clientInfo: {
        name: 'platform',
        title: 'Platform',
        version: '0.0.0',
      },
    },
    timeoutMs,
  )
  client.notify('initialized')

  return response
}

async function openCodexThread(
  client: CodexAppServerRpcClient,
  input: {
    cwd: string
    model: string
    modelOptions: CodexModelOptions
    resumeCursor?: unknown | null
    runtimeMode: RuntimeMode
  },
) {
  const resumeThreadId = typeof input.resumeCursor === 'string' ? input.resumeCursor : null
  if (!resumeThreadId) return client.request('thread/start', threadStartParams(input))

  return client.requestRaw<CodexClientRequestResultByMethod['thread/start']>('thread/resume', {
    ...threadResumeParams(input),
    threadId: resumeThreadId,
  })
}

async function requestCodexModels(client: CodexAppServerRpcClient) {
  const models: ProviderModel[] = []
  let cursor: string | null = null

  do {
    const response: CodexClientRequestResultByMethod['model/list'] = cursor
      ? await client.request('model/list', { cursor }, PROVIDER_PROBE_TIMEOUT_MS)
      : await client.request('model/list', {}, PROVIDER_PROBE_TIMEOUT_MS)
    models.push(...modelsFromCodexModelListPage(response))
    cursor = response.nextCursor ?? null
  } while (cursor)

  return models.length > 0 ? models : fallbackModels()
}

function threadStartParams(input: {
  cwd: string
  model: string
  modelOptions: CodexModelOptions
  runtimeMode: RuntimeMode
}): CodexClientRequestParamsByMethod['thread/start'] {
  const runtime = runtimeModeToThreadConfig(input.runtimeMode)

  return {
    approvalPolicy: runtime.approvalPolicy,
    cwd: input.cwd,
    developerInstructions: codexDeveloperInstructions(input.runtimeMode),
    experimentalRawEvents: true,
    model: input.model,
    persistExtendedHistory: true,
    sandbox: runtime.sandbox,
    ...(input.modelOptions.serviceTier ? { serviceTier: input.modelOptions.serviceTier } : {}),
  } as CodexClientRequestParamsByMethod['thread/start']
}

function threadResumeParams(input: {
  cwd: string
  model: string
  modelOptions: CodexModelOptions
  runtimeMode: RuntimeMode
}) {
  const runtime = runtimeModeToThreadConfig(input.runtimeMode)

  return {
    cwd: input.cwd,
    developerInstructions: codexDeveloperInstructions(input.runtimeMode),
    model: input.model,
    sandbox: runtime.sandbox,
    ...(input.modelOptions.serviceTier ? { serviceTier: input.modelOptions.serviceTier } : {}),
  }
}

function turnStartParams(
  session: CodexAppServerSession,
  input: ProviderTurnInput,
): CodexClientRequestParamsByMethod['turn/start'] {
  const runtime = runtimeModeToThreadConfig(input.runtimeMode)
  const modelOptions = codexModelOptions(input)

  return {
    approvalPolicy: runtime.approvalPolicy,
    developerInstructions: codexDeveloperInstructions(input.runtimeMode),
    input: codexTurnInput(input),
    model: normalizeCodexModel(input.modelSelection.model),
    sandboxPolicy: runtime.sandboxPolicy,
    ...(modelOptions.effort ? { effort: modelOptions.effort } : {}),
    ...(modelOptions.serviceTier ? { serviceTier: modelOptions.serviceTier } : {}),
    threadId: session.providerThreadIdForTurn(),
  } as CodexClientRequestParamsByMethod['turn/start']
}

function codexTurnInput(input: ProviderTurnInput): CodexTurnInputItem[] {
  const items: CodexTurnInputItem[] = []
  if (input.messageText.length > 0 || input.attachments.length === 0) {
    items.push(codexTextInput(input))
  }

  for (const attachment of input.attachments) {
    const image = codexImageInput(attachment)
    if (image) items.push(image)
  }

  return items.length > 0 ? items : [codexTextInput(input)]
}

function codexTextInput(input: ProviderTurnInput): CodexTurnInputItem {
  return {
    text: input.messageText,
    text_elements: codexTextElements(input),
    type: 'text',
  }
}

function codexImageInput(value: unknown): CodexTurnInputItem | null {
  const attachment = asRecord(value)
  if (stringField(attachment, 'type') !== 'image') return null

  const url = stringField(attachment, 'dataUrl') ?? stringField(attachment, 'url')
  return url ? { type: 'image', url } : null
}

function codexTextElements(input: ProviderTurnInput) {
  const value = asRecord(input).textElements
  return Array.isArray(value) ? value : []
}

function codexModelOptions(
  input: ProviderTurnInput | ProviderSessionStartInput,
): CodexModelOptions {
  if (input.modelSelection.providerInstanceId !== input.providerInstanceId) return {}

  const effort = codexReasoningEffort(input.modelSelection.options)
  const serviceTier =
    modelOptionValue(input.modelSelection.options, 'fastMode') === true ? 'fast' : undefined

  return {
    ...(effort ? { effort } : {}),
    ...(serviceTier ? { serviceTier } : {}),
  }
}

/**
 * The effort came out of the model's own `supportedReasoningEfforts`, so it is
 * relayed as-is rather than filtered against a list this process pins. Codex
 * rejects an effort it does not know, and a visible turn error beats silently
 * downgrading the user to the default.
 */
function codexReasoningEffort(options: ModelOptions): CodexReasoningEffort | undefined {
  const value = modelOptionValue(options, 'reasoningEffort')
  if (typeof value !== 'string') return undefined

  const effort = value.trim()
  return effort.length > 0 ? effort : undefined
}

function runtimeModeToThreadConfig(runtimeMode: RuntimeMode) {
  if (runtimeMode === 'approval-required') {
    return {
      approvalPolicy: 'untrusted',
      sandbox: 'read-only',
      sandboxPolicy: { networkAccess: false, type: 'readOnly' },
    }
  }
  if (runtimeMode === 'auto-accept-edits') {
    return {
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      sandboxPolicy: {
        excludeSlashTmp: false,
        excludeTmpdirEnvVar: false,
        networkAccess: true,
        type: 'workspaceWrite',
        writableRoots: [],
      },
    }
  }

  return {
    approvalPolicy: 'never',
    sandbox: 'danger-full-access',
    sandboxPolicy: { type: 'dangerFullAccess' },
  }
}

function accountProbeStatus(
  value: CodexClientRequestResultByMethod['account/read'],
): Pick<ProviderSnapshot, 'auth' | 'message' | 'status'> {
  const account = value.account
  if (account) {
    const email = account.type === 'chatgpt' ? account.email : null

    return {
      auth: {
        status: 'authenticated',
        ...(email ? { email } : {}),
        type: account.type,
      },
      status: 'ready',
    }
  }
  if (value.requiresOpenaiAuth) {
    return {
      auth: { status: 'unauthenticated' },
      message: 'Codex CLI is not authenticated. Run `codex login` and try again.',
      status: 'error',
    }
  }

  return { auth: { status: 'unknown' }, status: 'ready' }
}

function modelsFromCodexModelListPage(
  value: CodexClientRequestResultByMethod['model/list'],
): ProviderModel[] {
  const models = value.data.map(modelFromCodexModel).filter(isPresent)
  return models.length > 0 ? models : []
}

function modelFromCodexModel(
  value: CodexClientRequestResultByMethod['model/list']['data'][number],
) {
  const slug = value.model || value.id
  if (!slug) return null

  const name = value.displayName || slug
  return {
    capabilities: codexModelCapabilities(value),
    isCustom: false,
    name,
    shortName: name,
    slug,
  }
}

/**
 * Absent capabilities are `null`, never `{ reasoningEfforts: [] }`: an empty
 * list reads to the client as "this model has levels, just none of them" and
 * would render an empty picker. A default with nothing to pick from is equally
 * useless, so the whole object hangs on the list having members.
 */
function codexModelCapabilities(
  value: CodexClientRequestResultByMethod['model/list']['data'][number],
): ProviderModelCapabilities | null {
  const reasoningEfforts = value.supportedReasoningEfforts
    .map(codexReasoningEffortChoice)
    .filter(isPresent)
  if (reasoningEfforts.length === 0) return null

  const defaultReasoningEffort = value.defaultReasoningEffort.trim()
  return {
    ...(defaultReasoningEffort.length > 0 ? { defaultReasoningEffort } : {}),
    reasoningEfforts,
  }
}

/**
 * Codex is the authority on which efforts a model accepts, so the advertised
 * list is relayed verbatim — including members this pinned schema predates.
 * Only a blank id is dropped, because it can never be sent back to `turn/start`.
 */
function codexReasoningEffortChoice(
  value: CodexClientRequestResultByMethod['model/list']['data'][number]['supportedReasoningEfforts'][number],
): ModelReasoningEffortOption | null {
  const effort = value.reasoningEffort.trim()
  if (effort.length === 0) return null

  const description = value.description.trim()
  return {
    ...(description.length > 0 ? { description } : {}),
    effort,
  }
}

function fallbackModels(): ProviderModel[] {
  return [
    {
      capabilities: null,
      isCustom: false,
      name: 'GPT-5.5',
      shortName: 'GPT-5.5',
      slug: DEFAULT_CODEX_MODEL,
    },
  ]
}

function readThreadIdFromThreadResponse(
  response: CodexClientRequestResultByMethod['thread/start'],
) {
  return response.thread.id
}

function readProviderThreadId(thread: unknown) {
  return stringField(asRecord(thread), 'id') ?? undefined
}

function readTurnIdFromTurnResponse(response: CodexClientRequestResultByMethod['turn/start']) {
  return response.turn.id
}

function providerThreadSnapshot(
  threadId: ThreadId,
  response:
    | CodexClientRequestResultByMethod['thread/read']
    | CodexClientRequestResultByMethod['thread/rollback'],
): ProviderThreadSnapshot {
  return {
    providerThreadId: response.thread.id,
    threadId,
    turns: response.thread.turns.map(providerThreadTurn),
  }
}

function providerThreadTurn(value: { readonly id: string; readonly items: readonly unknown[] }) {
  return { id: value.id, items: [...value.items] }
}

function parseJsonRpcMessage(line: string): JsonRpcMessage {
  try {
    return JSON.parse(line) as JsonRpcMessage
  } catch (error) {
    throw createInternalError(
      `Failed to parse Codex app-server JSON-RPC message: ${providerErrorMessage(error)}`,
    )
  }
}

function isJsonRpcResponse(message: JsonRpcMessage) {
  return message.id !== undefined && !message.method
}

function jsonRpcErrorMessage(error: unknown) {
  const errorRecord = asRecord(error)
  return stringField(errorRecord, 'message') ?? JSON.stringify(error)
}

function codexBinary() {
  return process.env.PLATFORM_CODEX_BINARY ?? DEFAULT_CODEX_BINARY
}

function codexVersionFromInitialize(response: CodexClientRequestResultByMethod['initialize']) {
  const userAgent = response.userAgent
  if (!userAgent) return null

  return userAgent.match(/\/([^\s]+)/)?.[1] ?? userAgent
}

function isMissingCodexBinaryError(error: unknown) {
  if (typeof error !== 'object' || error === null) return false

  return 'code' in error && error.code === 'ENOENT'
}

function unavailableCodexSnapshot(checkedAt: string): ProviderSnapshot {
  return {
    ...DEFAULT_CODEX_PROVIDER_SETTINGS,
    auth: { status: 'unknown' },
    availability: 'unavailable',
    checkedAt,
    enabled: false,
    installed: false,
    message: 'Codex CLI (`codex`) is not installed or not on PATH.',
    models: [],
    status: 'error',
    version: null,
  }
}

function normalizeCodexModel(model: string | null | undefined) {
  const normalized = model?.trim()
  return normalized || DEFAULT_CODEX_MODEL
}

function turnErrorMessage(turn: unknown) {
  const record = asRecord(turn)
  const errorMessage = stringField(asRecord(record.error), 'message')
  return errorMessage ?? stringField(record, 'message') ?? 'Codex turn failed.'
}

function errorNotificationMessage(error: unknown) {
  const message = stringField(asRecord(error), 'message')
  return message ?? turnErrorMessage(asRecord(error))
}

function notificationItem(params: unknown) {
  return asRecord(params).item
}

function isReasoningItem(value: unknown): value is CodexReasoningItem {
  const record = asRecord(value)
  if (stringField(record, 'type') !== 'reasoning') return false

  return Boolean(stringField(record, 'id'))
}

function isAssistantMessageItem(value: unknown): value is { id: string; text: string } {
  const record = asRecord(value)
  if (stringField(record, 'type') !== 'agentMessage') return false
  if (!stringField(record, 'id')) return false

  return typeof record.text === 'string'
}

function codexItemNotificationContext(
  params: unknown,
  timestampKey: 'completedAtMs' | 'startedAtMs',
) {
  const record = asRecord(params)
  const providerTurnId = stringField(record, 'turnId')
  if (!providerTurnId) return null

  return {
    createdAt: isoFromUnixMs(numberField(record, timestampKey)) ?? new Date().toISOString(),
    providerTurnId,
  }
}

function codexReasoningPartContext(params: unknown) {
  const record = asRecord(params)
  const itemId = stringField(record, 'itemId')
  const providerTurnId = stringField(record, 'turnId')
  const summaryIndex = numberField(record, 'summaryIndex')
  if (!itemId || !providerTurnId || summaryIndex === null) return null

  return { itemId, providerTurnId, summaryIndex }
}

function codexReasoningDeltaContext(
  params: unknown,
  indexKey: 'contentIndex' | 'summaryIndex' = 'summaryIndex',
) {
  const record = asRecord(params)
  const baseContext = codexReasoningPartContext({
    itemId: record.itemId,
    summaryIndex: record[indexKey],
    turnId: record.turnId,
  })
  const delta = stringField(record, 'delta')
  if (!baseContext || !delta) return null

  return {
    ...baseContext,
    contentIndex: indexKey === 'contentIndex' ? baseContext.summaryIndex : 0,
    createdAt: new Date().toISOString(),
    delta,
    summaryIndex: indexKey === 'summaryIndex' ? baseContext.summaryIndex : 0,
  }
}

function appendReasoningPart(parts: Map<number, string>, index: number, delta: string) {
  parts.set(index, `${parts.get(index) ?? ''}${delta}`)
}

function reasoningStateSummary(state: CodexReasoningState) {
  return reasoningPartsText(state.summaryParts) ?? reasoningPartsText(state.contentParts)
}

function reasoningPartsText(parts: Map<number, string>) {
  const text = Array.from(parts.entries())
    .toSorted(([left], [right]) => left - right)
    .map(([, part]) => part.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()

  return text.length > 0 ? text : null
}

function reasoningItemSummary(item: CodexReasoningItem) {
  return (
    normalizeReasoningText(stringArrayValue(item.summary)) ??
    normalizeReasoningText(stringArrayValue(item.content))
  )
}

function normalizeReasoningText(values: readonly string[]) {
  const text = values
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()

  return text.length > 0 ? text : null
}

function stringArrayValue(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.filter((item): item is string => typeof item === 'string')
}

function shouldEmitReasoningSummary(lastSummary: string | null, nextSummary: string) {
  if (nextSummary === lastSummary) return false
  if (!lastSummary) return nextSummary.length >= 48 || hasReasoningBoundary(nextSummary)

  return nextSummary.length - lastSummary.length >= 80 || hasReasoningBoundary(nextSummary)
}

function hasReasoningBoundary(value: string) {
  return /[.!?:\n]$/.test(value.trim())
}

function reasoningRuntimeEventId(
  kind: 'complete' | 'start',
  providerTurnId: string,
  itemId: string,
) {
  return `codex-reasoning-${kind}:${providerTurnId}:${itemId}`
}

function reasoningStateKey(providerTurnId: string, itemId: string) {
  return `${providerTurnId}:${itemId}`
}

function isoFromUnixMs(value: number | null | undefined) {
  if (typeof value !== 'number') return null
  if (!Number.isFinite(value)) return null

  return new Date(value).toISOString()
}

function rawNotification(method: string, payload: unknown) {
  return {
    method,
    payload,
    source: 'codex.app-server.notification' as const,
  }
}

function rawRequest(method: string, payload: unknown) {
  return {
    method,
    payload,
    source: 'codex.app-server.request' as const,
  }
}

function approvalRequestType(method: string) {
  switch (method) {
    case 'item/commandExecution/requestApproval':
      return 'command_execution_approval'
    case 'item/fileChange/requestApproval':
      return 'file_change_approval'
    case 'item/permissions/requestApproval':
      return 'command_execution_approval'
    case 'applyPatchApproval':
      return 'apply_patch_approval'
    case 'execCommandApproval':
      return 'exec_command_approval'
    default:
      return null
  }
}

function approvalRequestDetail(
  requestType: NonNullable<ReturnType<typeof approvalRequestType>>,
  params: Record<string, unknown>,
) {
  return (
    stringField(params, 'command') ??
    stringField(params, 'summary') ??
    stringField(params, 'reason') ??
    requestType
  )
}

function userInputQuestions(params: Record<string, unknown>) {
  const questions = params.questions
  if (Array.isArray(questions)) return questions

  return []
}

function threadStateFromValue(value: string | null) {
  switch (value) {
    case 'active':
    case 'idle':
    case 'archived':
    case 'closed':
    case 'compacted':
    case 'error':
      return value
    default:
      return 'active'
  }
}

/**
 * `thread/tokenUsage/updated` is routed by handleManualNotification, which runs before
 * the generated-schema parse, so this is the only place the payload gets validated.
 * Parse it against the generated schema rather than digging at records by hand — the
 * previous hand-rolled version read `params.usage`, but the wire field is `tokenUsage`,
 * so every snapshot resolved to 0 used tokens and was then dropped by
 * tokenUsageActivity in provider-runtime-ingestion.ts.
 */
function tokenUsageSnapshot(params: unknown) {
  const parsed = v.safeParse(V2ThreadTokenUsageUpdatedNotificationSchema, params)
  if (!parsed.success) {
    recordChatPipelineWarning('codex_adapter.token_usage.unparsed', {
      detail: v.summarize(parsed.issues),
    })
    return { usedTokens: 0 }
  }

  const { last, modelContextWindow, total } = parsed.output.tokenUsage

  return {
    cachedInputTokens: last.cachedInputTokens,
    // Codex compacts on its own once the window fills; the gauge reads this to
    // explain a used-token count that drops mid-thread.
    compactsAutomatically: true,
    inputTokens: last.inputTokens,
    outputTokens: last.outputTokens,
    reasoningOutputTokens: last.reasoningOutputTokens,
    usedTokens: last.totalTokens,
    ...(modelContextWindow === null || modelContextWindow === undefined
      ? {}
      : { maxTokens: modelContextWindow }),
    ...(total.totalTokens > last.totalTokens ? { totalProcessedTokens: total.totalTokens } : {}),
  }
}

function turnPlanPayload(params: unknown) {
  const record = asRecord(params)
  const rawPlan = Array.isArray(record.plan) ? record.plan : []
  const plan = rawPlan.map(runtimePlanStep).filter(isPresent)

  return {
    explanation: stringField(record, 'explanation'),
    plan,
  }
}

function runtimePlanStep(value: unknown) {
  const record = asRecord(value)
  const step = stringField(record, 'step')
  const status = runtimePlanStepStatus(stringField(record, 'status'))
  if (!step || !status) return null

  return { status, step }
}

function runtimePlanStepStatus(value: string | null) {
  if (value === 'pending' || value === 'inProgress' || value === 'completed') return value

  return null
}

function requestTypeFromRecord(record: Record<string, unknown>) {
  return stringField(record, 'requestType') ?? 'unknown'
}

function canonicalItemType(value: string | null) {
  switch (value) {
    case 'agentMessage':
      return 'assistant_message'
    case 'commandExecution':
      return 'command_execution'
    case 'fileChange':
      return 'file_change'
    case 'mcpToolCall':
      return 'mcp_tool_call'
    case 'dynamicToolCall':
      return 'dynamic_tool_call'
    case 'webSearch':
      return 'web_search'
    case 'imageView':
      return 'image_view'
    case 'reasoning':
      return 'reasoning'
    case 'plan':
      return 'plan'
    default:
      return 'unknown'
  }
}

function itemTitle(record: Record<string, unknown>) {
  return stringField(record, 'title') ?? stringField(record, 'type') ?? 'Item'
}

function itemDetail(record: Record<string, unknown>) {
  return stringField(record, 'detail') ?? stringField(record, 'text') ?? undefined
}

function hookOutcome(record: Record<string, unknown>) {
  const outcome = stringField(record, 'outcome') ?? stringField(record, 'status')
  if (outcome === 'success' || outcome === 'error' || outcome === 'cancelled') return outcome

  return 'success'
}

function realtimeEventType(method: string): ProviderRuntimeEvent['type'] {
  switch (method) {
    case 'thread/realtime/started':
      return 'thread.realtime.started'
    case 'thread/realtime/itemAdded':
      return 'thread.realtime.item-added'
    case 'thread/realtime/outputAudio/delta':
      return 'thread.realtime.audio.delta'
    case 'thread/realtime/error':
      return 'thread.realtime.error'
    case 'thread/realtime/closed':
      return 'thread.realtime.closed'
    default:
      return 'thread.realtime.error'
  }
}

function realtimePayload(method: string, params: unknown) {
  const record = asRecord(params)
  switch (method) {
    case 'thread/realtime/started':
      return { realtimeSessionId: stringField(record, 'realtimeSessionId') ?? undefined }
    case 'thread/realtime/itemAdded':
      return { item: record.item ?? params }
    case 'thread/realtime/outputAudio/delta':
      return { audio: record.audio ?? record.delta ?? params }
    case 'thread/realtime/closed':
      return { reason: stringField(record, 'reason') ?? undefined }
    default:
      return { message: stringField(record, 'message') ?? 'Realtime error' }
  }
}

function codexDeveloperInstructions(runtimeMode: RuntimeMode) {
  if (runtimeMode === 'approval-required') {
    return 'Use Plan mode when the user is planning. Request approval before running commands or editing files.'
  }

  return 'Use the current collaboration mode and keep provider runtime events granular for UI ingestion.'
}

function classifyCodexStderrLine(rawLine: string) {
  const line = rawLine.replaceAll(ANSI_ESCAPE_REGEX, '').trim()
  if (!line) return null

  const match = line.match(CODEX_STDERR_LOG_REGEX)
  if (!match) return { message: line }

  const level = match[1]
  if (level && level !== 'ERROR') return null
  if (BENIGN_CODEX_STDERR_ERROR_SNIPPETS.some((snippet) => line.includes(snippet))) return null

  return { message: line }
}
