import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import {
  DEFAULT_CODEX_PROVIDER_SETTINGS,
  messageIdSchema,
  type ProviderModel,
  type ProviderSnapshot,
  type RuntimeMode,
  type ThreadId,
  type TurnId,
} from '@workspace/contracts'
import * as v from 'valibot'
import type {
  ProviderAdapter,
  ProviderAdapterSession,
  ProviderRuntimeSink,
  ProviderThreadSnapshot,
  ProviderTurnInput,
} from '../types'
import {
  providerTurnSummary,
  recordChatPipelineInfo,
  recordChatPipelineWarning,
} from '../../orchestration/orchestration-logging'
import {
  codexServerNotification,
  parseCodexClientRequestParams,
  parseCodexClientRequestResult,
  type CodexClientRequestMethod,
  type CodexClientRequestParamsByMethod,
  type CodexClientRequestResultByMethod,
  type CodexServerNotificationParamsByMethod,
} from './codex-protocol'

const DEFAULT_CODEX_BINARY = 'codex'
const DEFAULT_CODEX_MODEL = 'gpt-5.5'
const REQUEST_TIMEOUT_MS = 30_000
const PROVIDER_PROBE_TIMEOUT_MS = 8_000
const LEGACY_CODEX_MODELS = new Set(['codex', 'gpt-5-codex'])
const ANSI_ESCAPE_CHAR = String.fromCharCode(27)
const ANSI_ESCAPE_REGEX = new RegExp(`${ANSI_ESCAPE_CHAR}\\[[0-9;]*m`, 'g')
const CODEX_STDERR_LOG_REGEX =
  /^\d{4}-\d{2}-\d{2}T\S+\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+\S+:\s+(.*)$/
const BENIGN_CODEX_STDERR_ERROR_SNIPPETS = [
  'state db missing rollout path for thread',
  'state db record_discrepancy: find_thread_path_by_id_str_in_subdir, falling_back',
]
const CODEX_REASONING_EFFORTS = new Set<CodexReasoningEffort>(['minimal', 'low', 'medium', 'high'])

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

type ActiveCodexTurn = {
  canonicalTurnId: TurnId
  messageId: string
  promise: Promise<void>
  reject: (error: Error) => void
  resolve: () => void
  settled: () => boolean
  sink: ProviderRuntimeSink
}

type CodexReasoningState = {
  contentParts: Map<number, string>
  itemId: string
  lastEmittedSummary: string | null
  providerTurnId: string
  sink: ProviderRuntimeSink
  summaryParts: Map<number, string>
  threadId: ThreadId
  turnId: TurnId
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
      throw new Error('Codex thread rollback requires numTurns to be an integer >= 1.')
    }

    return this.requireSession(threadId, 'thread/rollback').rollbackThread(numTurns)
  }

  async startTurn(input: ProviderTurnInput, sink: ProviderRuntimeSink) {
    recordChatPipelineInfo('chat.pipeline.codex_adapter.start_turn.start', {
      ...providerTurnSummary(input),
    })
    const session = await this.ensureSession(input)
    await session.sendTurn({
      input,
      messageId: v.parse(messageIdSchema, `assistant:${input.turnId}`),
      sink,
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

  async respondApproval() {
    throw new Error('Codex app-server approval responses are not wired to Platform UI yet.')
  }

  async respondUserInput() {
    throw new Error('Codex app-server user-input responses are not wired to Platform UI yet.')
  }

  private async ensureSession(input: ProviderTurnInput) {
    const existing = this.sessions.get(input.thread.id)
    const cwd = normalizeCodexCwd(input.cwd)
    const model = normalizeCodexModel(input.modelSelection.model)
    const modelOptions = codexModelOptions(input)
    if (existing?.matches({ cwd, model, runtimeMode: input.runtimeMode })) {
      recordChatPipelineInfo('chat.pipeline.codex_adapter.session.reuse', {
        model,
        runtimeMode: input.runtimeMode,
        threadId: input.thread.id,
      })
      return existing
    }

    if (existing) {
      recordChatPipelineInfo('chat.pipeline.codex_adapter.session.replace', {
        model,
        runtimeMode: input.runtimeMode,
        threadId: input.thread.id,
      })
      this.sessions.delete(input.thread.id)
      await existing.close()
    }

    recordChatPipelineInfo('chat.pipeline.codex_adapter.session.start', {
      model,
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      threadId: input.thread.id,
    })
    const session = await CodexAppServerSession.start({
      cwd,
      model,
      modelOptions,
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      threadId: input.thread.id,
    })
    this.sessions.set(input.thread.id, session)
    recordChatPipelineInfo('chat.pipeline.codex_adapter.session.started', {
      model,
      runtimeMode: input.runtimeMode,
      threadId: input.thread.id,
    })

    return session
  }

  private requireSession(threadId: ThreadId, operation: string) {
    const session = this.sessions.get(threadId)
    if (session?.isActive()) return session

    throw new Error(`Codex ${operation} requires an active session for thread ${threadId}.`)
  }
}

class CodexAppServerSession {
  private readonly canonicalTurnByProviderTurnId = new Map<string, TurnId>()
  private readonly client: CodexAppServerRpcClient
  private readonly cwd: string
  private readonly model: string
  private readonly providerInstanceId: ProviderTurnInput['providerInstanceId']
  private readonly providerSessionId: string
  private readonly providerThreadId: string
  private readonly reasoningItems = new Map<string, CodexReasoningState>()
  private readonly runtimeMode: RuntimeMode
  private readonly threadId: ThreadId
  private readonly turns = new Map<string, ActiveCodexTurn>()
  private activeProviderTurnId: string | null = null
  private pendingTurn: ActiveCodexTurn | null = null
  private status: ProviderAdapterSession['status'] = 'ready'

  private constructor(input: {
    client: CodexAppServerRpcClient
    cwd: string
    model: string
    providerInstanceId: ProviderTurnInput['providerInstanceId']
    providerThreadId: string
    runtimeMode: RuntimeMode
    threadId: ThreadId
  }) {
    this.client = input.client
    this.cwd = input.cwd
    this.model = input.model
    this.providerInstanceId = input.providerInstanceId
    this.providerSessionId = `codex:${input.providerThreadId}`
    this.providerThreadId = input.providerThreadId
    this.runtimeMode = input.runtimeMode
    this.threadId = input.threadId
    this.client.onMessage((message) => this.handleMessage(message))
  }

  static async start(input: {
    cwd: string
    model: string
    modelOptions: CodexModelOptions
    providerInstanceId: ProviderTurnInput['providerInstanceId']
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
      const response = await client.request('thread/start', threadStartParams(input))
      const providerThreadId = readThreadIdFromThreadResponse(response)
      recordChatPipelineInfo('chat.pipeline.codex_session.started', {
        providerThreadId,
        threadId: input.threadId,
      })

      return new CodexAppServerSession({
        client,
        cwd: input.cwd,
        model: input.model,
        providerInstanceId: input.providerInstanceId,
        providerThreadId,
        runtimeMode: input.runtimeMode,
        threadId: input.threadId,
      })
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

  async sendTurn({
    input,
    messageId,
    sink,
  }: {
    input: ProviderTurnInput
    messageId: string
    sink: ProviderRuntimeSink
  }) {
    recordChatPipelineInfo('chat.pipeline.codex_session.send_turn.start', {
      ...providerTurnSummary(input),
      messageId,
      providerSessionId: this.providerSessionId,
      providerThreadId: this.providerThreadId,
    })
    const activeTurn = activeCodexTurn({
      canonicalTurnId: input.turnId,
      messageId,
      sink,
    })
    this.pendingTurn = activeTurn
    void activeTurn.promise.catch(noop)

    await this.ingestSession(sink, 'running', input.turnId)
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
      this.attachProviderTurn(providerTurnId, activeTurn)
      await this.settleIfTurnAlreadyTerminal(response, providerTurnId)
    } catch (error) {
      if (activeTurn.settled()) return

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
    this.rejectAllTurns(new Error('Codex session stopped.'))
    this.client.close()
  }

  private handleMessage(message: JsonRpcMessage) {
    if (!message.method) return
    recordChatPipelineInfo('chat.pipeline.codex_session.message', {
      hasId: message.id !== undefined,
      method: message.method,
      threadId: this.threadId,
    })
    if (message.id !== undefined) {
      this.client.respondError(message.id, -32601, `Unsupported Codex request: ${message.method}`)
      return
    }
    void this.handleNotification(message).catch((error) => this.rejectActiveTurn(error))
  }

  private async handleNotification(message: JsonRpcMessage) {
    if (!message.method) return

    if (await this.handleManualNotification(message.method, message.params)) return

    const notification = codexServerNotification(message.method, message.params)
    if (!notification) return

    switch (notification.method) {
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

  private async handleManualNotification(method: string, params: unknown) {
    switch (method) {
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

  private async handleItemStartedNotification(params: unknown) {
    const item = notificationItem(params)
    if (!isReasoningItem(item)) return false

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
    if (!isReasoningItem(item)) return this.handleAssistantMessageItemCompleted(params, item)

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

    await turn.sink.ingest({
      createdAt: context.createdAt,
      eventId: runtimeEventId('codex-assistant-item-complete'),
      itemId: item.id,
      payload: {
        detail: item.text,
        itemType: 'assistant_message',
        status: 'completed',
        title: 'Assistant message',
      },
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
    await turn.sink.ingest({
      createdAt: new Date().toISOString(),
      itemId: params.itemId,
      eventId: runtimeEventId('codex-assistant-delta'),
      payload: {
        delta: params.delta,
        streamKind: 'assistant_text',
      },
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
      await this.ingestSession(activeTurn.sink, 'ready', null)
      this.resolveTurn(params.turn.id, activeTurn)
      return
    }

    this.rejectTurn(params.turn.id, activeTurn, turnErrorMessage(params.turn))
  }

  private handleErrorNotification(params: CodexServerNotificationParamsByMethod['error']) {
    if (params.willRetry === true) return

    const message = errorNotificationMessage(params.error)
    if (!params.turnId) {
      this.rejectActiveTurn(new Error(message))
      return
    }

    const turn = this.turnForProviderTurnId(params.turnId)
    if (turn) this.rejectTurn(params.turnId, turn, message)
  }

  private async completeTurn(providerTurnId: string, turn: ActiveCodexTurn) {
    const completedAt = new Date().toISOString()
    recordChatPipelineInfo('chat.pipeline.codex_session.complete_turn', {
      messageId: turn.messageId,
      providerTurnId,
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
    })
    await turn.sink.ingest({
      createdAt: completedAt,
      eventId: runtimeEventId('codex-turn-completed'),
      payload: { state: 'completed' },
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
      type: 'turn.completed',
    })
    await turn.sink.ingest({
      completedAt,
      eventId: runtimeEventId('codex-assistant-complete'),
      messageId: turn.messageId,
      threadId: this.threadId,
      turnId: turn.canonicalTurnId,
      type: 'assistant.complete',
    })
    await this.ingestSession(turn.sink, 'ready', null)
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
      await this.ingestSession(activeTurn.sink, 'ready', null)
      this.resolveTurn(providerTurnId, activeTurn)
      return
    }

    this.rejectTurn(providerTurnId, activeTurn, turnErrorMessage(response.turn))
  }

  private attachProviderTurn(providerTurnId: string, turn: ActiveCodexTurn) {
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

  private clearPendingTurn(turn: ActiveCodexTurn) {
    if (this.pendingTurn === turn) this.pendingTurn = null
  }

  private async ingestSession(
    sink: ProviderRuntimeSink,
    status: 'running' | 'ready',
    turnId: TurnId | null,
  ) {
    this.status = status
    await sink.ingest({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('codex-session'),
      providerInstanceId: this.providerInstanceId,
      providerName: DEFAULT_CODEX_PROVIDER_SETTINGS.displayLabel,
      providerSessionId: this.providerSessionId,
      runtimeMode: this.runtimeMode,
      status,
      threadId: this.threadId,
      turnId,
      type: 'session.set',
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
    const providerTurnId = this.activeProviderTurnId
    if (!providerTurnId) return

    const turn = this.turns.get(providerTurnId)
    if (turn) this.rejectTurn(providerTurnId, turn, providerErrorMessage(error))
  }

  private rejectUnmappedTurn(turn: ActiveCodexTurn, error: unknown) {
    if (this.turnsForCanonical(turn.canonicalTurnId).length > 0) return

    turn.reject(new Error(providerErrorMessage(error)))
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

  private rejectTurn(providerTurnId: string, turn: ActiveCodexTurn, message: string) {
    this.turns.delete(providerTurnId)
    this.canonicalTurnByProviderTurnId.delete(providerTurnId)
    this.clearReasoningForProviderTurn(providerTurnId)
    if (this.activeProviderTurnId === providerTurnId) this.activeProviderTurnId = null
    this.status = 'error'
    turn.reject(new Error(message))
  }

  private resolveTurn(providerTurnId: string, turn: ActiveCodexTurn) {
    this.turns.delete(providerTurnId)
    this.canonicalTurnByProviderTurnId.delete(providerTurnId)
    this.clearReasoningForProviderTurn(providerTurnId)
    if (this.activeProviderTurnId === providerTurnId) this.activeProviderTurnId = null
    turn.resolve()
  }

  private getOrCreateReasoningState(providerTurnId: string, itemId: string, turn: ActiveCodexTurn) {
    const key = reasoningStateKey(providerTurnId, itemId)
    const existing = this.reasoningItems.get(key)
    if (existing) return existing

    const state: CodexReasoningState = {
      contentParts: new Map(),
      itemId,
      lastEmittedSummary: null,
      providerTurnId,
      sink: turn.sink,
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
    turn: ActiveCodexTurn,
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
    activeTurn: ActiveCodexTurn,
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
    await input.state.sink.ingest({
      createdAt: input.createdAt,
      eventId: input.eventId,
      payload: {
        description: input.summary,
        summary: input.summary,
        taskId: `reasoning:${input.state.itemId}`,
      },
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
      if (!this.closed) this.closeWithError(new Error(`Codex app-server exited with ${code}.`))
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
    if (this.closed) return Promise.reject(new Error('Codex app-server is closed.'))

    const id = this.nextId
    this.nextId += 1
    const parsedParams = parseCodexClientRequestParams(method, params)
    const promise = new Promise<CodexClientRequestResultByMethod[Method]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id))
        reject(new Error(`Codex app-server request timed out: ${method}`))
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

  notify(method: string, params?: unknown) {
    this.write(params === undefined ? { method } : { method, params })
  }

  respondError(id: JsonRpcId, code: number, message: string) {
    this.write({ error: { code, message }, id })
  }

  close() {
    if (this.closed) return

    this.closed = true
    this.process.kill()
    this.closeWithError(new Error('Codex app-server closed.'))
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
      this.closeWithError(new Error(providerErrorMessage(error)))
      return
    }
    if (isJsonRpcResponse(message)) {
      this.resolveResponse(message)
      return
    }
    if (message.id !== undefined) {
      this.respondError(message.id, -32601, `Unsupported Codex request: ${message.method}`)
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
      pending.reject(new Error(jsonRpcErrorMessage(message.error)))
      return
    }

    try {
      pending.resolve(parseCodexClientRequestResult(pending.method, message.result))
    } catch (error) {
      pending.reject(new Error(providerErrorMessage(error)))
    }
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
    pending.reject(new Error(providerErrorMessage(error)))
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

function activeCodexTurn(input: {
  canonicalTurnId: TurnId
  messageId: string
  sink: ProviderRuntimeSink
}): ActiveCodexTurn {
  let settled = false
  let resolveTurn: () => void = noop
  let rejectTurn: (error: Error) => void = noop
  const promise = new Promise<void>((resolve, reject) => {
    resolveTurn = () => {
      settled = true
      resolve()
    }
    rejectTurn = (error) => {
      settled = true
      reject(error)
    }
  })

  return {
    canonicalTurnId: input.canonicalTurnId,
    messageId: input.messageId,
    promise,
    reject: rejectTurn,
    resolve: resolveTurn,
    settled: () => settled,
    sink: input.sink,
  }
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
    experimentalRawEvents: false,
    model: input.model,
    persistExtendedHistory: false,
    sandbox: runtime.sandbox,
    ...(input.modelOptions.serviceTier ? { serviceTier: input.modelOptions.serviceTier } : {}),
  } as CodexClientRequestParamsByMethod['thread/start']
}

function turnStartParams(
  session: CodexAppServerSession,
  input: ProviderTurnInput,
): CodexClientRequestParamsByMethod['turn/start'] {
  const runtime = runtimeModeToThreadConfig(input.runtimeMode)
  const modelOptions = codexModelOptions(input)

  return {
    approvalPolicy: runtime.approvalPolicy,
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

function codexModelOptions(input: ProviderTurnInput): CodexModelOptions {
  if (input.modelSelection.providerInstanceId !== input.providerInstanceId) return {}

  const effort = codexReasoningEffort(input.modelSelection.options)
  const serviceTier =
    modelOptionValue(input.modelSelection.options, 'fastMode') === true ? 'fast' : undefined

  return {
    ...(effort ? { effort } : {}),
    ...(serviceTier ? { serviceTier } : {}),
  }
}

function codexReasoningEffort(
  options: ProviderTurnInput['modelSelection']['options'],
): CodexReasoningEffort | undefined {
  const value = modelOptionValue(options, 'reasoningEffort') ?? modelOptionValue(options, 'effort')
  if (typeof value !== 'string') return undefined

  return isCodexReasoningEffort(value) ? value : undefined
}

function isCodexReasoningEffort(value: string): value is CodexReasoningEffort {
  return CODEX_REASONING_EFFORTS.has(value as CodexReasoningEffort)
}

function modelOptionValue(
  options: ProviderTurnInput['modelSelection']['options'],
  key: string,
): unknown {
  if (!options) return undefined
  if (Array.isArray(options)) return modelOptionArrayValue(options, key)

  return asRecord(options)[key]
}

function modelOptionArrayValue(options: unknown[], key: string) {
  for (const option of options) {
    const record = asRecord(option)
    if (record.id === key) return record.value
  }

  return undefined
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
    capabilities: null,
    isCustom: false,
    name,
    shortName: name,
    slug,
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
    throw new Error(
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
  if (!normalized || LEGACY_CODEX_MODELS.has(normalized)) return DEFAULT_CODEX_MODEL

  return normalized
}

function normalizeCodexCwd(cwd: string) {
  if (cwd.startsWith('/')) return cwd
  if (cwd.startsWith('Users/')) return `/${cwd}`

  return path.resolve(cwd)
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

function providerErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return String(error)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>

  return {}
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function numberField(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
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

function runtimeEventId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

function noop() {}
