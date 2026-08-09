import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest'
import type {
  CanUseTool,
  Options,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import {
  DEFAULT_CLAUDE_PROVIDER_SETTINGS,
  DEFAULT_INTERACTION_MODE,
  approvalRequestIdSchema,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
  type ChatAttachment,
  type InteractionMode,
  type ModelSelection,
  type RuntimeMode,
  type ThreadId,
} from '@workspace/contracts'
import * as v from 'valibot'
import { writeAttachmentFromDataUrl } from '../../../attachments/store'
import { ClaudeProviderAdapter } from '../claude'
import type {
  ProviderRuntimeEvent,
  ProviderSessionStartInput,
  ProviderTurnInput,
} from '../../types'

/**
 * The `claude` binary and the account behind it are the only things mocked here:
 * `createQuery` hands the adapter a `FakeClaudeQuery` (ported from t3code's
 * adapter test) instead of a spawned CLI. Everything else — the attachment blob
 * store, the runtime event stream, the turn bookkeeping — is real app code.
 */

/** A real 1x1 PNG, so the multimodal assertion decodes to actual image bytes. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_BYTES = new Uint8Array(Buffer.from(PNG_BASE64, 'base64'))
const WORKSPACE_ROOT = '/Users/shaul/Desktop/platform'
/** Only the CLI's own id, used where a `system`/`init` message is faked. */
const SESSION_ID = 'sess-abc'
const SYSTEM_UUID = '44444444-4444-4444-8444-444444444444'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The real `initializationResult()` answers in ~0.5s with NO prompt pushed, and
 * its payload carries NO `session_id` — which is the whole reason the adapter
 * has to mint the id itself. Keep this faithful to that shape.
 */
const INITIALIZE_RESPONSE = {
  account: { email: 'dev@example.com', subscriptionType: 'max' },
  agents: [],
  available_output_styles: ['default'],
  commands: [],
  models: [],
  output_style: 'default',
}

type FakeWaiter = {
  reject: (reason: unknown) => void
  resolve: (value: IteratorResult<SDKMessage>) => void
}

/**
 * Ported from `references/t3code/.../ClaudeAdapter.test.ts` with the Effect
 * wrapper dropped: a hand-driven `AsyncIterable<SDKMessage>` with a queue, a
 * waiter list, and call recorders for the control requests the adapter uses.
 */
class FakeClaudeQuery implements AsyncIterable<SDKMessage> {
  readonly setModelCalls: Array<string | undefined> = []
  closeCalls = 0
  interruptCalls = 0
  private readonly queue: SDKMessage[] = []
  private readonly waiters: FakeWaiter[] = []
  private done = false
  private failure: unknown = undefined

  emit(message: SDKMessage) {
    if (this.done) return

    const waiter = this.waiters.shift()
    if (waiter) {
      waiter.resolve({ done: false, value: message })
      return
    }

    this.queue.push(message)
  }

  fail(cause: unknown) {
    if (this.done) return

    this.done = true
    this.failure = cause
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(cause)
    }
  }

  finish() {
    if (this.done) return

    this.done = true
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ done: true, value: undefined })
    }
  }

  readonly interrupt = async () => {
    this.interruptCalls += 1
    return undefined
  }

  readonly initializationResult = async () => INITIALIZE_RESPONSE

  readonly setModel = async (model?: string) => {
    this.setModelCalls.push(model)
  }

  readonly close = () => {
    this.closeCalls += 1
    this.finish()
  };

  [Symbol.asyncIterator](): AsyncIterator<SDKMessage> {
    return { next: () => this.next() }
  }

  private next(): Promise<IteratorResult<SDKMessage>> {
    const value = this.queue.shift()
    if (value) return Promise.resolve({ done: false, value })

    if (this.failure !== undefined) {
      const failure = this.failure
      this.failure = undefined
      return Promise.reject(failure)
    }
    if (this.done) return Promise.resolve({ done: true, value: undefined })

    return new Promise<IteratorResult<SDKMessage>>((resolve, reject) => {
      this.waiters.push({ reject, resolve })
    })
  }
}

type ClaudeHarness = {
  adapter: ClaudeProviderAdapter
  events: ProviderRuntimeEvent[]
  options: Options[]
  prompts: SDKUserMessage[]
  queries: FakeClaudeQuery[]
}

let attachmentsDir = ''

beforeAll(async () => {
  attachmentsDir = await mkdtemp(path.join(tmpdir(), 'platform-claude-attachments-'))
})

afterAll(async () => {
  await rm(attachmentsDir, { force: true, recursive: true })
})

describe('ClaudeProviderAdapter', () => {
  it('sends image attachments as base64 content blocks beside the text', async () => {
    const harness = claudeHarness()
    const attachment = imageAttachment()
    await writeAttachmentFromDataUrl({
      attachment: { ...attachment, dataUrl: `data:image/png;base64,${PNG_BASE64}` },
      attachmentsDir,
    })
    const input = providerTurnInput({ attachments: [attachment], messageText: 'look at this' })

    const pending = harness.adapter.sendTurn(input)
    await waitFor(() => harness.prompts.length === 1, 'prompt was never pushed')

    const blocks = contentBlocks(harness.prompts[0])
    expect(blocks).toEqual([
      { text: 'look at this', type: 'text' },
      {
        source: { data: PNG_BASE64, media_type: 'image/png', type: 'base64' },
        type: 'image',
      },
    ])

    const image = blocks[1]
    assert(image.type === 'image' && image.source.type === 'base64', 'second block is not base64')
    expect(new Uint8Array(Buffer.from(image.source.data, 'base64'))).toEqual(PNG_BYTES)

    latestQuery(harness).emit(successResult())
    await pending
    await harness.adapter.stopAll()
  })

  it('streams content deltas and only resolves the turn on the result message', async () => {
    const harness = claudeHarness()
    const input = providerTurnInput()
    let resolved = false

    const pending = harness.adapter.sendTurn(input).then(() => {
      resolved = true
    })
    await waitForEvent(harness, 'turn.started')

    const query = latestQuery(harness)
    query.emit(textDelta('Hello '))
    query.emit(textDelta('world'))
    await waitFor(() => contentDeltas(harness).length === 2, 'deltas never arrived')

    expect(resolved).toBe(false)
    expect(contentDeltas(harness)).toEqual([
      expect.objectContaining({
        payload: { contentIndex: 0, delta: 'Hello ', streamKind: 'assistant_text' },
        threadId: input.thread.id,
        turnId: input.turnId,
        type: 'content.delta',
      }),
      expect.objectContaining({
        payload: { contentIndex: 0, delta: 'world', streamKind: 'assistant_text' },
        type: 'content.delta',
      }),
    ])

    query.emit(successResult())
    await pending

    expect(resolved).toBe(true)
    expect(await waitForEvent(harness, 'turn.completed')).toMatchObject({
      payload: { state: 'completed' },
      threadId: input.thread.id,
      turnId: input.turnId,
    })
    await harness.adapter.stopAll()
  })

  it('interrupts once and resolves the turn instead of rejecting it', async () => {
    const harness = claudeHarness()
    const input = providerTurnInput()

    const pending = harness.adapter.sendTurn(input)
    await waitForEvent(harness, 'turn.started')

    await harness.adapter.interruptTurn({ threadId: input.thread.id, turnId: input.turnId })
    const query = latestQuery(harness)
    expect(query.interruptCalls).toBe(1)

    query.emit(interruptedResult())
    await expect(pending).resolves.toBeUndefined()

    expect(await waitForEvent(harness, 'turn.completed')).toMatchObject({
      payload: { state: 'interrupted' },
      turnId: input.turnId,
    })
    await harness.adapter.stopAll()
  })

  it('opens an approval request per canUseTool call and resolves it with the decision', async () => {
    const harness = claudeHarness()
    const threadId = v.parse(threadIdSchema, 'thread-approval')
    await harness.adapter.startSession(
      sessionStartInput({ runtimeMode: 'approval-required', threadId }),
    )

    const canUseTool = latestOptions(harness).canUseTool
    assert(canUseTool, 'canUseTool was not passed to the SDK')
    const permission = canUseTool('Bash', { command: 'rm -rf /' }, canUseToolOptions())

    const opened = await waitForEvent(harness, 'request.opened')
    expect(opened).toMatchObject({
      payload: {
        args: { command: 'rm -rf /' },
        detail: 'Bash: rm -rf /',
        requestType: 'command_execution_approval',
      },
      threadId,
    })

    const requestId = opened.requestId
    assert(requestId, 'request.opened carried no requestId')
    await harness.adapter.respondApproval({
      decision: 'accept',
      requestId: v.parse(approvalRequestIdSchema, requestId),
      threadId,
    })

    await expect(permission).resolves.toEqual({
      behavior: 'allow',
      updatedInput: { command: 'rm -rf /' },
    })
    expect(await waitForEvent(harness, 'request.resolved')).toMatchObject({
      payload: { decision: 'accept' },
      requestId,
    })

    await expect(
      harness.adapter.respondApproval({
        decision: 'accept',
        requestId: v.parse(approvalRequestIdSchema, 'claude:missing'),
        threadId,
      }),
    ).rejects.toThrow('Unknown pending approval request: claude:missing')
    await harness.adapter.stopAll()
  })

  it('types MCP, read and custom tool approvals so none arrive kindless', async () => {
    const harness = claudeHarness()
    const threadId = v.parse(threadIdSchema, 'thread-approval-kinds')
    await harness.adapter.startSession(
      sessionStartInput({ runtimeMode: 'approval-required', threadId }),
    )

    const canUseTool = latestOptions(harness).canUseTool
    assert(canUseTool, 'canUseTool was not passed to the SDK')
    void canUseTool('mcp__linear__create_issue', { title: 'Bug' }, canUseToolOptions())
    void canUseTool('Read', { file_path: '/etc/hosts' }, canUseToolOptions())
    void canUseTool('SomeCustomTool', { description: 'do it' }, canUseToolOptions())

    await waitFor(() => openedRequests(harness).length === 3, 'not every approval was opened')
    expect(openedRequests(harness).map((event) => event.payload.requestType)).toEqual([
      'mcp_tool_call_approval',
      'file_read_approval',
      'dynamic_tool_call_approval',
    ])
    expect(openedRequests(harness)[1]?.payload.detail).toBe('Read: /etc/hosts')

    await harness.adapter.stopAll()
  })

  /**
   * The ordering regression: full-access is the mode most threads run in, and a
   * short circuit placed ahead of the intercept would allow `ExitPlanMode`
   * outright — Claude would leave plan mode and start editing, and the plan the
   * user was supposed to approve would never exist.
   */
  it('captures an ExitPlanMode plan as a proposed plan even under full access', async () => {
    const harness = claudeHarness()
    const input = providerTurnInput({ interactionMode: 'plan' })

    const pending = harness.adapter.sendTurn(input)
    await waitForEvent(harness, 'turn.started')
    expect(latestOptions(harness).permissionMode).toBe('plan')

    const canUseTool = latestOptions(harness).canUseTool
    assert(canUseTool, 'canUseTool was not passed to the SDK')
    await expect(
      canUseTool(
        'ExitPlanMode',
        { plan: '  1. Read the adapter\n2. Patch it  ' },
        canUseToolOptions(),
      ),
    ).resolves.toMatchObject({ behavior: 'deny' })

    expect(await waitForEvent(harness, 'proposed-plan.upsert')).toMatchObject({
      planMarkdown: '1. Read the adapter\n2. Patch it',
      threadId: input.thread.id,
      turnId: input.turnId,
      type: 'proposed-plan.upsert',
    })

    // Same session, ordinary tool: full-access still short circuits to allow, so
    // the intercept above is the only reason the plan survived.
    await expect(canUseTool('Bash', { command: 'ls' }, canUseToolOptions())).resolves.toEqual({
      behavior: 'allow',
      updatedInput: { command: 'ls' },
    })
    expect(openedRequests(harness)).toHaveLength(0)

    latestQuery(harness).emit(successResult())
    await pending
    await harness.adapter.stopAll()
  })

  it('turns AskUserQuestion into a typed user-input request the answer resolves', async () => {
    const harness = claudeHarness()
    const input = providerTurnInput()

    const pending = harness.adapter.sendTurn(input)
    await waitForEvent(harness, 'turn.started')

    const canUseTool = latestOptions(harness).canUseTool
    assert(canUseTool, 'canUseTool was not passed to the SDK')
    const permission = canUseTool('AskUserQuestion', askUserQuestionInput(), canUseToolOptions())

    const requested = await waitForEvent(harness, 'user-input.requested')
    expect(requested.payload.questions).toEqual([
      {
        allowOther: true,
        answerKind: 'single-select',
        header: 'Library',
        // The id IS the question text: the SDK looks its answers up by it.
        id: 'Which date library?',
        options: [
          { description: 'Small and modern', label: 'date-fns', value: 'date-fns' },
          { label: 'dayjs', value: 'dayjs' },
        ],
        prompt: 'Which date library?',
        secret: false,
      },
      {
        allowOther: true,
        answerKind: 'multi-select',
        header: 'Extras',
        id: 'Which extras?',
        options: [
          { label: 'Tests', value: 'Tests' },
          { label: 'Docs', value: 'Docs' },
        ],
        prompt: 'Which extras?',
        secret: false,
      },
    ])

    const requestId = requested.requestId
    assert(requestId, 'user-input.requested carried no requestId')
    await harness.adapter.respondUserInput({
      answers: { 'Which date library?': 'date-fns', 'Which extras?': ['Tests', 'Docs'] },
      requestId: v.parse(approvalRequestIdSchema, requestId),
      threadId: input.thread.id,
    })

    await expect(permission).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        // Multi-select collapses to the comma-separated string the SDK declares.
        answers: { 'Which date library?': 'date-fns', 'Which extras?': 'Tests, Docs' },
        questions: askUserQuestionInput().questions,
      },
    })
    expect(await waitForEvent(harness, 'user-input.resolved')).toMatchObject({
      payload: { answers: { 'Which date library?': 'date-fns' } },
      requestId,
    })

    await expect(
      harness.adapter.respondUserInput({
        answers: {},
        requestId: v.parse(approvalRequestIdSchema, 'claude:missing'),
        threadId: input.thread.id,
      }),
    ).rejects.toThrow('Unknown pending user-input request: claude:missing')

    latestQuery(harness).emit(successResult())
    await pending
    await harness.adapter.stopAll()
  })

  it('denies AskUserQuestion instead of parking the turn on a panel it cannot open', async () => {
    const harness = claudeHarness()
    await harness.adapter.startSession(sessionStartInput({}))

    const canUseTool = latestOptions(harness).canUseTool
    assert(canUseTool, 'canUseTool was not passed to the SDK')

    await expect(
      canUseTool('AskUserQuestion', { questions: [{ header: 'Ghost' }] }, canUseToolOptions()),
    ).resolves.toMatchObject({ behavior: 'deny' })
    expect(harness.events.some((event) => event.type === 'user-input.requested')).toBe(false)
    await harness.adapter.stopAll()
  })

  /**
   * Plan mode is a spawn-time permission mode, so a reused session keeps running
   * the mode the thread started in — which is the whole bug: switching to plan
   * did nothing until the thread was restarted for some other reason.
   */
  it('restarts the session when the thread switches interaction mode', async () => {
    const harness = claudeHarness()
    const threadId = v.parse(threadIdSchema, 'thread-interaction-mode')

    await harness.adapter.startSession(sessionStartInput({ interactionMode: 'default', threadId }))
    await harness.adapter.startSession(sessionStartInput({ interactionMode: 'default', threadId }))
    expect(harness.queries).toHaveLength(1)
    expect(latestOptions(harness).permissionMode).toBe('bypassPermissions')

    await harness.adapter.startSession(sessionStartInput({ interactionMode: 'plan', threadId }))
    expect(harness.queries).toHaveLength(2)
    expect(latestOptions(harness).permissionMode).toBe('plan')
    await harness.adapter.stopAll()
  })

  it('rejects the turn with a structured error when the result is an error subtype', async () => {
    const harness = claudeHarness()
    const input = providerTurnInput()

    const settled = harness.adapter.sendTurn(input).catch((error: unknown) => error)
    await waitForEvent(harness, 'turn.started')
    latestQuery(harness).emit(errorResult('boom'))

    const error = await settled
    assert(error instanceof Error, 'sendTurn did not reject with an Error')
    expect(error.message).toBe('boom')
    expect(error).toMatchObject({ code: 'server.INTERNAL_ERROR', name: 'EvlogError', status: 500 })
    expect(await waitForEvent(harness, 'turn.completed')).toMatchObject({
      payload: { errorMessage: 'boom', state: 'failed' },
      turnId: input.turnId,
    })
    await harness.adapter.stopAll()
  })

  /**
   * The regression this whole fix exists for. `start()` used to block on the
   * `system`/`init` message, which the CLI never sends until the first prompt is
   * pushed — and the first prompt is only pushed by `sendTurn`, which cannot run
   * until `start()` returns. Against the current SDK this hung forever.
   */
  it('starts a session with a real id even though init never arrives', async () => {
    const harness = claudeHarness()

    const session = await harness.adapter.startSession(sessionStartInput({}))

    const sessionId = session.resumeCursor
    assert(typeof sessionId === 'string', 'resumeCursor was not a session id')
    expect(sessionId).toMatch(UUID_PATTERN)
    expect(session).toMatchObject({
      providerSessionId: `claude:${sessionId}`,
      providerThreadId: sessionId,
      status: 'ready',
    })
    expect(await waitForEvent(harness, 'session.started')).toMatchObject({
      payload: { resume: sessionId },
    })
    expect(harness.events.some((event) => event.type === 'session.configured')).toBe(false)
    await harness.adapter.stopAll()
  })

  it('mints the session id for a fresh session and resumes from it afterwards', async () => {
    const harness = claudeHarness()
    const first = await harness.adapter.startSession(sessionStartInput({}))

    expect(latestOptions(harness).sessionId).toBe(first.resumeCursor)
    expect('resume' in latestOptions(harness)).toBe(false)

    await harness.adapter.startSession(
      sessionStartInput({
        resumeCursor: first.resumeCursor,
        threadId: v.parse(threadIdSchema, 'thread-resumed'),
      }),
    )

    expect(harness.queries).toHaveLength(2)
    // Mutually exclusive: the SDK rejects `resume` and `sessionId` together.
    expect(latestOptions(harness).resume).toBe(first.resumeCursor)
    expect('sessionId' in latestOptions(harness)).toBe(false)
    await harness.adapter.stopAll()
  })

  it('takes the CLI session id over the minted one when init finally lands', async () => {
    const harness = claudeHarness()
    const started = await harness.adapter.startSession(sessionStartInput({}))
    expect(started.resumeCursor).not.toBe(SESSION_ID)

    latestQuery(harness).emit(initMessage())
    await waitForEvent(harness, 'session.configured')

    const [session] = await harness.adapter.listSessions()
    expect(session).toMatchObject({
      providerSessionId: `claude:${SESSION_ID}`,
      providerThreadId: SESSION_ID,
      resumeCursor: SESSION_ID,
      status: 'ready',
    })
    await harness.adapter.stopAll()
  })

  it('rejects a second turn while one is still in flight', async () => {
    const harness = claudeHarness()
    const input = providerTurnInput()

    const pending = harness.adapter.sendTurn(input)
    await waitForEvent(harness, 'turn.started')

    await expect(harness.adapter.sendTurn(providerTurnInput({ turnId: 'turn-2' }))).rejects.toThrow(
      `Claude session for thread ${input.thread.id} already has a turn in flight.`,
    )

    latestQuery(harness).emit(successResult())
    await pending
    expect(harness.queries).toHaveLength(1)
    await harness.adapter.stopAll()
  })

  /**
   * The regression this fix exists for. A bare session start emits
   * `hook_started`/`hook_response` three times each before any model output, and
   * the old catch-all turned every one of them into a "Runtime warning -
   * Unhandled Claude SDK message 'system'" row in the user's work log.
   */
  it('maps hook traffic to hook events instead of warning rows', async () => {
    const harness = claudeHarness()
    await harness.adapter.startSession(sessionStartInput({}))
    const query = latestQuery(harness)

    query.emit(hookStarted())
    query.emit(hookResponse())

    expect(await waitForEvent(harness, 'hook.started')).toMatchObject({
      payload: { hookEvent: 'SessionStart', hookId: 'hook-1', hookName: 'format' },
    })
    expect(await waitForEvent(harness, 'hook.completed')).toMatchObject({
      payload: { exitCode: 0, hookId: 'hook-1', outcome: 'success', stdout: 'ok' },
    })
    expect(runtimeWarnings(harness)).toEqual([])
    await harness.adapter.stopAll()
  })

  it('maps every SDK message onto its intended runtime event', async () => {
    const harness = claudeHarness()
    await harness.adapter.startSession(sessionStartInput({}))
    const query = latestQuery(harness)
    // Start emits session.started then thread.started through the async stream;
    // the baseline has to be taken after both, not after `startSession` returns.
    await waitForEvent(harness, 'thread.started')
    const before = harness.events.length

    for (const { message } of MESSAGE_MAPPINGS) {
      query.emit(message)
    }
    const mapped = MESSAGE_MAPPINGS.filter((entry) => entry.event !== null)
    await waitFor(
      () => harness.events.length - before >= mapped.length,
      'not every mapped message produced its event',
    )

    // Messages are pumped in order, so the emitted events line up 1:1 with the
    // mapped entries — which also proves the unmapped ones emitted nothing.
    const emitted = harness.events.slice(before)
    expect(emitted.map((event) => event.type)).toEqual(mapped.map((entry) => entry.event))
    for (const [index, entry] of mapped.entries()) {
      if (!entry.payload) continue

      expect(emitted[index]).toMatchObject({ payload: entry.payload })
    }
    await harness.adapter.stopAll()
  })

  it('logs an unknown message instead of warning the user, and keeps pumping', async () => {
    const harness = claudeHarness()
    await harness.adapter.startSession(sessionStartInput({}))
    const query = latestQuery(harness)

    query.emit(unknownMessage())
    query.emit(unknownSystemSubtype())
    query.emit(hookStarted())

    // Ordering again: the hook event cannot arrive before both unknowns were
    // handled, so an empty warning list here is a real assertion.
    await waitForEvent(harness, 'hook.started')
    expect(runtimeWarnings(harness)).toEqual([])
    await harness.adapter.stopAll()
  })

  it('passes every advertised level through to the SDK effort option', async () => {
    for (const reasoningEffort of ['low', 'medium', 'high', 'xhigh', 'max']) {
      const harness = claudeHarness()
      await harness.adapter.startSession(sessionStartInput({ options: { reasoningEffort } }))

      expect(latestOptions(harness).effort).toBe(reasoningEffort)
      await harness.adapter.stopAll()
    }
  })

  /** A stale per-thread selection must degrade, never fail the turn. */
  it('degrades a level the model does not advertise instead of erroring', async () => {
    const harness = claudeHarness()

    // 'ultra' is a Codex level; the Claude catalog stops at 'max'.
    await harness.adapter.startSession(sessionStartInput({ options: { reasoningEffort: 'ultra' } }))

    expect(latestOptions(harness).effort).toBe('high')
    await harness.adapter.stopAll()
  })

  it('sends no effort, settings or thinking when the selection carries none', async () => {
    const harness = claudeHarness()

    await harness.adapter.startSession(sessionStartInput({}))

    const options = latestOptions(harness)
    expect('effort' in options).toBe(false)
    expect('settings' in options).toBe(false)
    expect('thinking' in options).toBe(false)
    await harness.adapter.stopAll()
  })

  it('treats ultrathink as a prompt keyword instead of an effort flag', async () => {
    const harness = claudeHarness()
    const input = providerTurnInput({
      messageText: 'Investigate the edge cases',
      options: { reasoningEffort: 'ultrathink' },
    })

    const pending = harness.adapter.sendTurn(input)
    await waitFor(() => harness.prompts.length === 1, 'prompt was never pushed')

    expect(latestOptions(harness).effort).toBe('high')
    expect(contentBlocks(harness.prompts[0])).toEqual([
      { text: 'Ultrathink:\nInvestigate the edge cases', type: 'text' },
    ])

    latestQuery(harness).emit(successResult())
    await pending
    await harness.adapter.stopAll()
  })

  it('pairs ultracode with xhigh and the session setting', async () => {
    const harness = claudeHarness()

    await harness.adapter.startSession(
      sessionStartInput({ options: { reasoningEffort: 'ultracode' } }),
    )

    const options = latestOptions(harness)
    expect(options.effort).toBe('xhigh')
    expect(options.settings).toEqual({ ultracode: true })
    await harness.adapter.stopAll()
  })

  it('passes the thinking config and its settings twin when thinking is enabled', async () => {
    const harness = claudeHarness()

    await harness.adapter.startSession(sessionStartInput({ options: { thinking: true } }))

    const options = latestOptions(harness)
    expect(options.thinking).toEqual({ type: 'adaptive' })
    expect(options.settings).toEqual({ alwaysThinkingEnabled: true })
    expect('maxThinkingTokens' in options).toBe(false)
    await harness.adapter.stopAll()
  })

  it('disables thinking on both sides when the selection turns it off', async () => {
    const harness = claudeHarness()

    await harness.adapter.startSession(sessionStartInput({ options: { thinking: false } }))

    const options = latestOptions(harness)
    expect(options.thinking).toEqual({ type: 'disabled' })
    expect(options.settings).toEqual({ alwaysThinkingEnabled: false })
    await harness.adapter.stopAll()
  })

  /**
   * Effort is fixed when the query is created, so reusing the session would
   * silently run the new level at the old one.
   */
  it('restarts the session when the thread switches effort, and reuses it when it does not', async () => {
    const harness = claudeHarness()
    const threadId = v.parse(threadIdSchema, 'thread-effort')

    await harness.adapter.startSession(
      sessionStartInput({ options: { reasoningEffort: 'low' }, threadId }),
    )
    await harness.adapter.startSession(
      sessionStartInput({ options: { reasoningEffort: 'low' }, threadId }),
    )
    expect(harness.queries).toHaveLength(1)

    await harness.adapter.startSession(
      sessionStartInput({ options: { reasoningEffort: 'max' }, threadId }),
    )
    expect(harness.queries).toHaveLength(2)
    expect(latestOptions(harness).effort).toBe('max')
    await harness.adapter.stopAll()
  })

  it('drops a missing attachment blob and still sends the turn', async () => {
    const harness = claudeHarness()
    const attachment = imageAttachment({ id: 'attachment-deleted', name: 'gone.png' })
    const input = providerTurnInput({ attachments: [attachment], messageText: 'still here' })

    const pending = harness.adapter.sendTurn(input)
    await waitFor(() => harness.prompts.length === 1, 'prompt was never pushed')

    expect(contentBlocks(harness.prompts[0])).toEqual([{ text: 'still here', type: 'text' }])
    expect(await waitForEvent(harness, 'runtime.warning')).toMatchObject({
      payload: { message: 'Attachment gone.png is missing and was not sent.' },
      threadId: input.thread.id,
    })

    latestQuery(harness).emit(successResult())
    await pending
    await harness.adapter.stopAll()
  })
})

function claudeHarness(): ClaudeHarness {
  const events: ProviderRuntimeEvent[] = []
  const options: Options[] = []
  const prompts: SDKUserMessage[] = []
  const queries: FakeClaudeQuery[] = []

  const adapter = new ClaudeProviderAdapter({
    attachmentsDir,
    createQuery: (input) => {
      const query = new FakeClaudeQuery()
      queries.push(query)
      options.push(input.options)
      void collectPrompts(input.prompt, prompts)
      // The real query's iterator ends when the abort controller fires; without
      // this the pump would sit on a promise that never settles after stopAll().
      input.options.abortController?.signal.addEventListener('abort', () => query.finish(), {
        once: true,
      })
      // NOTHING is emitted here. The real CLI withholds `system`/`init` until a
      // prompt is pushed; faking it unprompted is exactly what hid the start
      // deadlock from this suite. Tests that want `init` emit it themselves.
      return query as unknown as Query
    },
  })
  void (async () => {
    for await (const event of adapter.streamEvents()) {
      events.push(event)
    }
  })()

  return { adapter, events, options, prompts, queries }
}

async function collectPrompts(prompt: AsyncIterable<SDKUserMessage>, prompts: SDKUserMessage[]) {
  for await (const message of prompt) {
    prompts.push(message)
  }
}

function latestQuery(harness: ClaudeHarness) {
  const query = harness.queries.at(-1)
  assert(query, 'no query was created')
  return query
}

function latestOptions(harness: ClaudeHarness) {
  const options = harness.options.at(-1)
  assert(options, 'no query options were captured')
  return options
}

function contentDeltas(harness: ClaudeHarness) {
  return harness.events.filter((event) => event.type === 'content.delta')
}

/** A string body would break every index assertion, so narrow it away up front. */
function contentBlocks(message: SDKUserMessage) {
  const content = message.message.content
  assert(Array.isArray(content), 'prompt content was not a block array')
  return content
}

async function waitForEvent<Type extends ProviderRuntimeEvent['type']>(
  harness: ClaudeHarness,
  type: Type,
) {
  await waitFor(
    () => harness.events.some((event) => event.type === type),
    `no ${type} event was emitted`,
  )
  const event = harness.events.find(
    (candidate): candidate is Extract<ProviderRuntimeEvent, { type: Type }> =>
      candidate.type === type,
  )
  assert(event, `no ${type} event was emitted`)
  return event
}

/** In emission order, which `waitForEvent` cannot give: it always finds the first. */
function openedRequests(harness: ClaudeHarness) {
  return harness.events.filter(
    (event): event is Extract<ProviderRuntimeEvent, { type: 'request.opened' }> =>
      event.type === 'request.opened',
  )
}

async function waitFor(predicate: () => boolean, label: string) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (predicate()) return

    await new Promise((resolve) => setTimeout(resolve, 2))
  }

  assert(predicate(), label)
}

function canUseToolOptions(): Parameters<CanUseTool>[2] {
  return {
    requestId: 'permission-request-1',
    signal: new AbortController().signal,
    toolUseID: 'toolu_1',
  }
}

/** The SDK's `AskUserQuestionInput`: 1-4 questions, 2-4 label/description options each. */
function askUserQuestionInput() {
  return {
    questions: [
      {
        header: 'Library',
        multiSelect: false,
        options: [
          { description: 'Small and modern', label: 'date-fns' },
          // No description: an option that carries none must not invent one.
          { label: 'dayjs' },
        ],
        question: 'Which date library?',
      },
      {
        header: 'Extras',
        multiSelect: true,
        options: [{ label: 'Tests' }, { label: 'Docs' }],
        question: 'Which extras?',
      },
      // Unreadable: no question text, so it is dropped instead of failing the turn.
      { header: 'Ghost', options: [] },
    ],
  }
}

function imageAttachment(overrides: Partial<ChatAttachment> = {}): ChatAttachment {
  return {
    id: 'attachment-1',
    mimeType: 'image/png',
    name: 'shot.png',
    sizeBytes: PNG_BYTES.byteLength,
    type: 'image',
    ...overrides,
  }
}

function modelSelection(options?: ModelSelection['options']): ModelSelection {
  return {
    model: 'claude-opus-5',
    providerInstanceId: DEFAULT_CLAUDE_PROVIDER_SETTINGS.providerInstanceId,
    ...(options ? { options } : {}),
  }
}

function sessionStartInput(overrides: {
  interactionMode?: InteractionMode
  options?: ModelSelection['options']
  resumeCursor?: unknown
  runtimeMode?: RuntimeMode
  threadId?: ThreadId
}): ProviderSessionStartInput {
  return {
    cwd: WORKSPACE_ROOT,
    interactionMode: overrides.interactionMode ?? DEFAULT_INTERACTION_MODE,
    modelSelection: modelSelection(overrides.options),
    providerInstanceId: DEFAULT_CLAUDE_PROVIDER_SETTINGS.providerInstanceId,
    runtimeMode: overrides.runtimeMode ?? 'full-access',
    threadId: overrides.threadId ?? v.parse(threadIdSchema, 'thread-1'),
    ...(overrides.resumeCursor === undefined ? {} : { resumeCursor: overrides.resumeCursor }),
  }
}

function providerTurnInput(
  overrides: {
    attachments?: ChatAttachment[]
    interactionMode?: InteractionMode
    messageText?: string
    options?: ModelSelection['options']
    turnId?: string
  } = {},
): ProviderTurnInput {
  const now = '2026-05-28T00:00:00.000Z'
  const projectId = v.parse(projectIdSchema, 'project-1')
  const threadId = v.parse(threadIdSchema, 'thread-1')
  const turnId = v.parse(turnIdSchema, overrides.turnId ?? 'turn-1')
  const selection = modelSelection(overrides.options)
  const interactionMode = overrides.interactionMode ?? DEFAULT_INTERACTION_MODE

  return {
    attachments: overrides.attachments ?? [],
    cwd: WORKSPACE_ROOT,
    interactionMode,
    messageText: overrides.messageText ?? 'Say hello',
    modelSelection: selection,
    project: {
      createdAt: now,
      defaultModelSelection: selection,
      deletedAt: null,
      id: projectId,
      title: 'Platform',
      updatedAt: now,
      workspaceRoot: WORKSPACE_ROOT,
    },
    providerInstanceId: DEFAULT_CLAUDE_PROVIDER_SETTINGS.providerInstanceId,
    runtimeMode: 'full-access',
    thread: {
      activities: [],
      archivedAt: null,
      branch: null,
      createdAt: now,
      deletedAt: null,
      id: threadId,
      interactionMode,
      latestTurn: null,
      messages: [],
      modelSelection: selection,
      projectId,
      runtimeMode: 'full-access',
      session: null,
      title: 'Test thread',
      updatedAt: now,
      worktreePath: WORKSPACE_ROOT,
    },
    turnId,
  }
}

function runtimeWarnings(harness: ClaudeHarness) {
  return harness.events.filter((event) => event.type === 'runtime.warning')
}

type ClaudeSystemMessage = Extract<SDKMessage, { type: 'system' }>

/**
 * Distributes over the union so every fixture below is checked against the real
 * SDK member: a field the SDK does not declare, or a subtype it never had,
 * fails to compile here instead of asserting a mapping that cannot happen.
 */
type SystemMessageFields<Message = ClaudeSystemMessage> = Message extends ClaudeSystemMessage
  ? Omit<Message, 'session_id' | 'type' | 'uuid'>
  : never

function systemMessage(fields: SystemMessageFields): SDKMessage {
  return { ...fields, session_id: SESSION_ID, type: 'system', uuid: SYSTEM_UUID } as SDKMessage
}

function hookStarted(): SDKMessage {
  return systemMessage({
    hook_event: 'SessionStart',
    hook_id: 'hook-1',
    hook_name: 'format',
    subtype: 'hook_started',
  })
}

function hookResponse(): SDKMessage {
  return systemMessage({
    exit_code: 0,
    hook_event: 'SessionStart',
    hook_id: 'hook-1',
    hook_name: 'format',
    outcome: 'success',
    output: 'ok',
    stderr: '',
    stdout: 'ok',
    subtype: 'hook_response',
  })
}

/** A message type the installed SDK does not declare — the next SDK release. */
function unknownMessage(): SDKMessage {
  return {
    session_id: SESSION_ID,
    type: 'quantum_flux',
    uuid: SYSTEM_UUID,
  } as unknown as SDKMessage
}

/** `vcs_state_changed` is real on the wire but absent from the typed union. */
function unknownSystemSubtype(): SDKMessage {
  return {
    kind: 'commit',
    session_id: SESSION_ID,
    subtype: 'vcs_state_changed',
    type: 'system',
    uuid: SYSTEM_UUID,
  } as unknown as SDKMessage
}

/**
 * The whole mapping table, in emission order. `event: null` means the message is
 * understood and deliberately dropped — it must produce NO runtime event at all,
 * and above all no `runtime.warning`.
 */
const MESSAGE_MAPPINGS: ReadonlyArray<{
  event: ProviderRuntimeEvent['type'] | null
  message: SDKMessage
  payload?: Record<string, unknown>
}> = [
  { event: 'hook.started', message: hookStarted() },
  {
    event: 'hook.progress',
    message: systemMessage({
      hook_event: 'PostToolUse',
      hook_id: 'hook-2',
      hook_name: 'lint',
      output: 'clean',
      stderr: '',
      stdout: 'clean',
      subtype: 'hook_progress',
    }),
    payload: { hookId: 'hook-2', output: 'clean' },
  },
  { event: 'hook.completed', message: hookResponse() },
  {
    event: 'session.state.changed',
    message: systemMessage({ status: 'compacting', subtype: 'status' }),
    payload: { reason: 'status:compacting', state: 'waiting' },
  },
  {
    event: 'session.state.changed',
    message: systemMessage({
      attempt: 2,
      error: 'overloaded',
      error_status: 529,
      max_retries: 5,
      retry_delay_ms: 1_000,
      subtype: 'api_retry',
    }),
    payload: { reason: 'api_retry:2/5', state: 'running' },
  },
  {
    event: 'session.state.changed',
    message: systemMessage({
      request_id: 'req-1',
      status: 'started',
      subtype: 'control_request_progress',
    }),
    payload: { reason: 'control_request:started', state: 'running' },
  },
  {
    event: 'session.state.changed',
    message: systemMessage({ state: 'requires_action', subtype: 'session_state_changed' }),
    payload: { reason: 'session_state:requires_action', state: 'waiting' },
  },
  {
    event: 'session.exited',
    message: systemMessage({ reason: 'host_exit', subtype: 'worker_shutting_down' }),
    payload: { exitKind: 'graceful', reason: 'host_exit', recoverable: true },
  },
  {
    event: 'task.started',
    message: systemMessage({
      description: 'Explore the repo',
      subagent_type: 'explorer',
      task_id: 'task-1',
      subtype: 'task_started',
    }),
    payload: { description: 'Explore the repo', taskId: 'task-1', taskType: 'explorer' },
  },
  {
    event: 'task.progress',
    message: systemMessage({
      description: 'Reading files',
      last_tool_name: 'Read',
      subtype: 'task_progress',
      task_id: 'task-1',
      usage: { duration_ms: 10, tool_uses: 2, total_tokens: 40 },
    }),
    payload: { description: 'Reading files', lastToolName: 'Read', taskId: 'task-1' },
  },
  {
    event: 'task.progress',
    message: systemMessage({
      patch: { description: 'Paused by the user', status: 'paused' },
      subtype: 'task_updated',
      task_id: 'task-1',
    }),
    payload: { description: 'Paused by the user', taskId: 'task-1' },
  },
  {
    event: 'task.completed',
    message: systemMessage({
      patch: { error: 'killed by the user', status: 'killed' },
      subtype: 'task_updated',
      task_id: 'task-1',
    }),
    payload: { status: 'stopped', summary: 'killed by the user', taskId: 'task-1' },
  },
  {
    event: 'task.completed',
    message: systemMessage({
      output_file: '/tmp/report.md',
      status: 'completed',
      subtype: 'task_notification',
      summary: 'Found the bug',
      task_id: 'task-1',
    }),
    payload: { status: 'completed', summary: 'Found the bug', taskId: 'task-1' },
  },
  {
    event: 'files.persisted',
    message: systemMessage({
      failed: [{ error: 'too big', filename: 'huge.bin' }],
      files: [{ file_id: 'file-1', filename: 'notes.md' }],
      processed_at: '2026-05-28T00:00:00.000Z',
      subtype: 'files_persisted',
    }),
    payload: {
      failed: [{ error: 'too big', filename: 'huge.bin' }],
      files: [{ fileId: 'file-1', filename: 'notes.md' }],
    },
  },
  {
    event: 'item.completed',
    message: systemMessage({
      message: 'Bash is blocked by a permission rule.',
      subtype: 'permission_denied',
      tool_name: 'Bash',
      tool_use_id: 'toolu_denied',
    }),
    payload: {
      detail: 'Bash is blocked by a permission rule.',
      itemType: 'command_execution',
      status: 'declined',
    },
  },
  {
    event: 'model.rerouted',
    message: systemMessage({
      api_refusal_category: 'cyber',
      content: 'Switched models.',
      direction: 'retry',
      fallback_model: 'claude-sonnet-5',
      original_model: 'claude-opus-5',
      request_id: 'req-2',
      subtype: 'model_refusal_fallback',
      trigger: 'refusal',
    }),
    payload: {
      fromModel: 'claude-opus-5',
      reason: 'refusal:cyber',
      toModel: 'claude-sonnet-5',
    },
  },
  {
    event: 'runtime.warning',
    message: systemMessage({
      content: 'The model declined and there is no fallback.',
      original_model: 'claude-opus-5',
      request_id: 'req-3',
      subtype: 'model_refusal_no_fallback',
    }),
    payload: { message: 'The model declined and there is no fallback.' },
  },
  {
    event: 'runtime.error',
    message: systemMessage({
      error: 'disk full',
      key: { projectKey: 'platform', sessionId: SESSION_ID },
      subtype: 'mirror_error',
    }),
    payload: {
      class: 'provider_mirror_error',
      message: 'Claude workspace mirror error: disk full',
    },
  },
  {
    event: 'runtime.warning',
    message: systemMessage({
      key: 'context_limit',
      priority: 'immediate',
      subtype: 'notification',
      text: 'You are near the context limit.',
    }),
    payload: { message: 'You are near the context limit.' },
  },
  {
    event: null,
    message: systemMessage({
      key: 'tip',
      priority: 'low',
      subtype: 'notification',
      text: 'Try /compact.',
    }),
  },
  {
    event: 'runtime.warning',
    message: systemMessage({
      content: 'A Stop hook blocked continuation.',
      level: 'warning',
      subtype: 'informational',
    }),
    payload: { message: 'A Stop hook blocked continuation.' },
  },
  {
    event: null,
    message: systemMessage({
      content: 'Transcript note.',
      level: 'notice',
      subtype: 'informational',
    }),
  },
  {
    event: null,
    message: systemMessage({
      estimated_tokens: 120,
      estimated_tokens_delta: 20,
      subtype: 'thinking_tokens',
    }),
  },
  {
    event: null,
    message: systemMessage({
      subtype: 'background_tasks_changed',
      tasks: [{ description: 'dev server', task_id: 'task-2', task_type: 'shell' }],
    }),
  },
  {
    event: null,
    message: systemMessage({
      commands: [{ argumentHint: '', description: 'Compact the thread', name: 'compact' }],
      subtype: 'commands_changed',
    }),
  },
  {
    event: null,
    message: systemMessage({ content: '$0.42', subtype: 'local_command_output' }),
  },
  {
    event: null,
    message: systemMessage({
      memories: [{ path: '/memory/notes.md', scope: 'personal' }],
      mode: 'select',
      subtype: 'memory_recall',
    }),
  },
  {
    event: null,
    message: systemMessage({
      elicitation_id: 'elicit-1',
      mcp_server_name: 'linear',
      subtype: 'elicitation_complete',
    }),
  },
  {
    event: null,
    message: systemMessage({ name: 'formatter', status: 'installed', subtype: 'plugin_install' }),
  },
  {
    event: 'thread.state.changed',
    message: systemMessage({
      compact_metadata: { pre_tokens: 100_000, trigger: 'auto' },
      subtype: 'compact_boundary',
    }),
    payload: { state: 'compacted' },
  },
  {
    event: 'thread.started',
    message: {
      new_conversation_id: '44444444-4444-4444-8444-444444444444',
      session_id: SESSION_ID,
      type: 'conversation_reset',
      uuid: SYSTEM_UUID,
    },
    payload: { providerThreadId: '44444444-4444-4444-8444-444444444444' },
  },
  {
    event: null,
    message: {
      session_id: SESSION_ID,
      suggestion: 'Ask about the failing test',
      type: 'prompt_suggestion',
      uuid: SYSTEM_UUID,
    },
  },
]

function initMessage(): SDKMessage {
  return {
    apiKeySource: 'oauth',
    claude_code_version: '9.9.9',
    cwd: WORKSPACE_ROOT,
    mcp_servers: [],
    model: 'claude-opus-5',
    output_style: 'default',
    permissionMode: 'bypassPermissions',
    plugins: [],
    session_id: SESSION_ID,
    skills: [],
    slash_commands: [],
    subtype: 'init',
    tools: [],
    type: 'system',
    uuid: '11111111-1111-4111-8111-111111111111',
  }
}

function textDelta(text: string): SDKMessage {
  return {
    event: { delta: { text, type: 'text_delta' }, index: 0, type: 'content_block_delta' },
    parent_tool_use_id: null,
    session_id: SESSION_ID,
    type: 'stream_event',
    uuid: '22222222-2222-4222-8222-222222222222',
  }
}

function successResult(): SDKMessage {
  return {
    ...resultBase(),
    result: 'done',
    subtype: 'success' as const,
  }
}

function interruptedResult(): SDKMessage {
  return {
    ...resultBase(),
    errors: [],
    is_error: true,
    subtype: 'error_during_execution' as const,
    terminal_reason: 'aborted_streaming' as const,
  }
}

function errorResult(message: string): SDKMessage {
  return {
    ...resultBase(),
    errors: ['[ede_diagnostic] internal telemetry', message],
    is_error: true,
    subtype: 'error_during_execution' as const,
  }
}

function resultBase() {
  return {
    duration_api_ms: 5,
    duration_ms: 10,
    is_error: false,
    modelUsage: {},
    num_turns: 1,
    permission_denials: [],
    session_id: SESSION_ID,
    stop_reason: null,
    total_cost_usd: 0,
    type: 'result' as const,
    usage: fakeUsage(),
    uuid: '33333333-3333-4333-8333-333333333333' as const,
  }
}

/**
 * `NonNullableUsage` spells out every nested Anthropic usage record. The adapter
 * reads only the token counters through `asRecord`, so fabricating the rest
 * would be noise that asserts nothing.
 */
function fakeUsage() {
  return { input_tokens: 5, output_tokens: 7 } as Extract<SDKMessage, { type: 'result' }>['usage']
}
