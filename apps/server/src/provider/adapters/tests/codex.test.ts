import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
  type ProviderInstanceId,
} from '@workspace/contracts'
import * as v from 'valibot'
import { CodexProviderAdapter } from '../codex'
import type { ProviderRuntimeEvent, ProviderTurnInput } from '../../types'

const fakeCodexScript = `#!/usr/bin/env node
const readline = require('node:readline');

if (process.argv[2] === '--version') {
  console.error('snapshot should use app-server initialize for version');
  process.exit(72);
}

if (process.argv[2] !== 'app-server') {
  console.error('unsupported fake codex command');
  process.exit(1);
}

let threadStartCount = 0;
let lastThreadStartParams = null;

const spawnLogPath = process.env.PLATFORM_FAKE_CODEX_SPAWN_LOG;
if (spawnLogPath) require('node:fs').appendFileSync(spawnLogPath, 'spawn\\n');

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\\n');
}

function fail(id, message) {
  send({ id, error: { message } });
}

function fakeThread(turns = []) {
  return {
    cliVersion: '9.9.9',
    createdAt: 0,
    cwd: '/Users/shaul/Desktop/platform',
    ephemeral: false,
    id: 'provider-thread-1',
    modelProvider: 'openai',
    preview: 'Say hello',
    source: 'appServer',
    status: { type: 'idle' },
    turns,
    updatedAt: 0,
  };
}

function fakeTurn(status = 'completed', items = []) {
  return {
    id: 'provider-turn-1',
    items,
    status,
  };
}

function fakeModel() {
  return {
    defaultReasoningEffort: 'medium',
    description: 'Fake Codex model',
    displayName: 'GPT-5.5',
    hidden: false,
    id: 'gpt-5.5',
    isDefault: true,
    model: 'gpt-5.5',
    supportedReasoningEfforts: [
      { description: 'Fastest responses', reasoningEffort: 'low' },
      { description: 'Balanced', reasoningEffort: 'medium' },
      { description: 'Deeper reasoning', reasoningEffort: 'high' },
      { description: 'Even deeper reasoning', reasoningEffort: 'xhigh' },
      { description: 'Maximum reasoning depth', reasoningEffort: 'max' },
      { description: 'Maximum reasoning with delegation', reasoningEffort: 'ultra' },
      { description: 'An effort level this schema predates', reasoningEffort: 'hyperdrive' },
    ],
  };
}

function fakeModelWithoutReasoningEfforts() {
  return { ...fakeModel(), supportedReasoningEfforts: [] };
}

function sendReasoningEvents() {
  send({
    method: 'item/started',
    params: {
      threadId: 'provider-thread-1',
      turnId: 'provider-turn-1',
      startedAtMs: 1770000000000,
      item: {
        id: 'reasoning-1',
        type: 'reasoning',
        summary: [],
        content: [],
      },
    },
  });
  send({
    method: 'item/reasoning/summaryPartAdded',
    params: {
      threadId: 'provider-thread-1',
      turnId: 'provider-turn-1',
      itemId: 'reasoning-1',
      summaryIndex: 0,
    },
  });
  send({
    method: 'item/reasoning/summaryTextDelta',
    params: {
      threadId: 'provider-thread-1',
      turnId: 'provider-turn-1',
      itemId: 'reasoning-1',
      delta: 'Inspecting the repo.',
      summaryIndex: 0,
    },
  });
  send({
    method: 'item/completed',
    params: {
      threadId: 'provider-thread-1',
      turnId: 'provider-turn-1',
      completedAtMs: 1770000001000,
      item: {
        id: 'reasoning-1',
        type: 'reasoning',
        summary: ['Inspecting the repo.'],
        content: [],
      },
    },
  });
}

function sendAgentMessageItemCompleted(itemId, text) {
  send({
    method: 'item/completed',
    params: {
      threadId: 'provider-thread-1',
      turnId: 'provider-turn-1',
      completedAtMs: 1770000002000,
      item: {
        id: itemId,
        type: 'agentMessage',
        text,
      },
    },
  });
}

function assertStartParams(message) {
  if (message.params.cwd !== '/Users/shaul/Desktop/platform') {
    fail(message.id, 'cwd was not normalized');
    return false;
  }
  if (message.params.model !== 'codex') {
    fail(message.id, 'model mismatch');
    return false;
  }
  if (message.params.approvalPolicy !== 'never') {
    fail(message.id, 'approval policy mismatch');
    return false;
  }
  if (message.params.sandbox !== 'danger-full-access') {
    fail(message.id, 'sandbox mismatch');
    return false;
  }
  if (message.params.serviceTier !== undefined && message.params.serviceTier !== 'fast') {
    fail(message.id, 'thread service tier mismatch');
    return false;
  }
  return true;
}

function assertTurnParams(message) {
  if (message.params.model !== 'codex') {
    fail(message.id, 'turn model mismatch');
    return false;
  }
  if (message.params.approvalPolicy !== 'never') {
    fail(message.id, 'turn approval policy mismatch');
    return false;
  }
  if (message.params.sandboxPolicy?.type !== 'dangerFullAccess') {
    fail(message.id, 'turn sandbox policy mismatch');
    return false;
  }
  if (message.params.serviceTier !== undefined && message.params.serviceTier !== 'fast') {
    fail(message.id, 'turn service tier mismatch');
    return false;
  }

  const input = Array.isArray(message.params.input) ? message.params.input : [];
  const image = input.find((item) => item.type === 'image');
  if (!image) return true;

  if (image.url !== 'data:image/png;base64,abc') {
    fail(message.id, 'image data URL was not passed to Codex');
    return false;
  }
  if (message.params.effort !== 'high') {
    fail(message.id, 'reasoning effort mismatch');
    return false;
  }
  if (message.params.serviceTier !== 'fast') {
    fail(message.id, 'fast mode mismatch');
    return false;
  }
  return true;
}

function handle(message) {
  const mode = process.env.PLATFORM_FAKE_CODEX_MODE;
  if (message.method === 'initialize') {
    send({
      id: message.id,
      result: {
        codexHome: '/Users/shaul/.codex',
        platformFamily: 'unix',
        platformOs: 'macos',
        userAgent: 'Codex Desktop/9.9.9 fake-test',
      },
    });
    return;
  }
  if (message.method === 'initialized') {
    return;
  }
  if (message.method === 'account/read') {
    send({ id: message.id, result: { account: { type: 'apiKey' }, requiresOpenaiAuth: false } });
    return;
  }
  if (message.method === 'model/list') {
    const model = mode === 'no-reasoning-efforts' ? fakeModelWithoutReasoningEfforts() : fakeModel();
    send({
      id: message.id,
      result: { data: [model], nextCursor: null },
    });
    return;
  }
  if (message.method === 'thread/start') {
    threadStartCount += 1;
    lastThreadStartParams = message.params;
    if (mode !== 'echo-mode-params' && !assertStartParams(message)) return;
    if (mode === 'malformed-thread-start') {
      send({ id: message.id, result: { thread: {} } });
      return;
    }
    send({
      method: 'thread/started',
      params: { thread: fakeThread() },
    });
    send({
      id: message.id,
      result: {
        approvalPolicy: 'never',
        approvalsReviewer: 'user',
        cwd: '/Users/shaul/Desktop/platform',
        model: 'gpt-5.5',
        modelProvider: 'openai',
        sandbox: { type: 'dangerFullAccess' },
        thread: fakeThread(),
      },
    });
    return;
  }
  if (message.method === 'turn/start') {
    if (mode !== 'echo-mode-params' && !assertTurnParams(message)) return;
    process.stderr.write('2026-05-28T00:00:00Z INFO codex: harmless diagnostic\\n');
    send({
      method: 'turn/started',
      params: { threadId: 'provider-thread-1', turn: fakeTurn('inProgress') },
    });
    if (mode === 'echo-mode-params') {
      const collaborationMode = message.params.collaborationMode ?? null;
      sendAgentMessageItemCompleted(
        'item-1',
        JSON.stringify({
          approvalsReviewer: message.params.approvalsReviewer ?? null,
          developerInstructions: collaborationMode?.settings?.developer_instructions ?? null,
          mode: collaborationMode?.mode ?? null,
          reasoningEffort: collaborationMode?.settings?.reasoning_effort ?? null,
          settingsModel: collaborationMode?.settings?.model ?? null,
          threadApprovalsReviewer: lastThreadStartParams?.approvalsReviewer ?? null,
          threadStarts: threadStartCount,
          turnDeveloperInstructions: message.params.developerInstructions ?? null,
        })
      );
      send({
        method: 'turn/completed',
        params: { threadId: 'provider-thread-1', turn: fakeTurn('completed') },
      });
      send({ id: message.id, result: { turn: fakeTurn('completed') } });
      return;
    }
    if (mode === 'echo-turn-params') {
      sendAgentMessageItemCompleted(
        'item-1',
        JSON.stringify({
          effort: message.params.effort ?? null,
          serviceTier: message.params.serviceTier ?? null,
        })
      );
      send({
        method: 'turn/completed',
        params: { threadId: 'provider-thread-1', turn: fakeTurn('completed') },
      });
      send({ id: message.id, result: { turn: fakeTurn('completed') } });
      return;
    }
    if (mode === 'reasoning-events') {
      sendReasoningEvents();
    }
    if (mode === 'token-usage') {
      send({
        method: 'thread/tokenUsage/updated',
        params: {
          threadId: 'provider-thread-1',
          turnId: 'provider-turn-1',
          tokenUsage: {
            last: {
              cachedInputTokens: 400,
              inputTokens: 1200,
              outputTokens: 300,
              reasoningOutputTokens: 100,
              totalTokens: 1600,
            },
            modelContextWindow: 272000,
            total: {
              cachedInputTokens: 800,
              inputTokens: 2400,
              outputTokens: 600,
              reasoningOutputTokens: 200,
              totalTokens: 3200,
            },
          },
        },
      });
    }
    if (mode === 'malformed-delta') {
      send({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'provider-thread-1',
          turnId: 'provider-turn-1',
          itemId: 'item-1',
          delta: 123,
        },
      });
      send({ id: message.id, result: { turn: fakeTurn('inProgress') } });
      return;
    }
    if (mode === 'multi-agent-items') {
      send({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'provider-thread-1',
          turnId: 'provider-turn-1',
          itemId: 'item-1',
          delta: 'First item',
        },
      });
      sendAgentMessageItemCompleted('item-1', 'First item');
      send({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'provider-thread-1',
          turnId: 'provider-turn-1',
          itemId: 'item-2',
          delta: 'Second item',
        },
      });
      sendAgentMessageItemCompleted('item-2', 'Second item');
      send({
        method: 'turn/completed',
        params: { threadId: 'provider-thread-1', turn: fakeTurn('completed') },
      });
      send({ id: message.id, result: { turn: fakeTurn('completed') } });
      return;
    }
    send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'provider-thread-1',
        turnId: 'provider-turn-1',
        itemId: 'item-1',
        delta: 'Hello from app-server',
      },
    });
    sendAgentMessageItemCompleted('item-1', 'Hello from app-server');
    send({
      method: 'turn/completed',
      params: { threadId: 'provider-thread-1', turn: fakeTurn('completed') },
    });
    send({ id: message.id, result: { turn: fakeTurn('completed') } });
    return;
  }
  if (message.method === 'turn/interrupt') {
    send({ id: message.id, result: {} });
    return;
  }
  if (message.method === 'thread/read') {
    send({
      id: message.id,
      result: {
        thread: fakeThread([
          fakeTurn('completed', [{ id: 'item-1', type: 'agentMessage', text: 'hello' }]),
        ]),
      },
    });
    return;
  }
  if (message.method === 'thread/rollback') {
    if (message.params.numTurns !== 1) {
      fail(message.id, 'rollback numTurns mismatch');
      return;
    }
    send({
      id: message.id,
      result: {
        thread: fakeThread(),
      },
    });
    return;
  }
  fail(message.id, 'unsupported method: ' + message.method);
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  handle(JSON.parse(line));
});

setInterval(() => {}, 1000);
`

let fakeCodexLock: Promise<void> = Promise.resolve()

const RUNTIME_MODES = ['approval-required', 'auto-accept-edits', 'full-access'] as const

type FakeCodexContext = { readonly spawnLogPath: string }

type EchoedModeParams = {
  approvalsReviewer: string | null
  developerInstructions: string | null
  mode: string | null
  reasoningEffort: string | null
  settingsModel: string | null
  threadApprovalsReviewer: string | null
  threadStarts: number
  turnDeveloperInstructions: string | null
}

describe('CodexProviderAdapter', () => {
  it('uses the app-server protocol and keeps early turn notifications', async () => {
    await withFakeCodex(async () => {
      const adapter = new CodexProviderAdapter()
      const events: ProviderRuntimeEvent[] = []
      const input = providerTurnInput()
      collectAdapterEvents(adapter, events)

      const snapshot = await adapter.snapshot()
      await adapter.sendTurn(input)
      await settleRuntimeEvents()
      const sessions = await adapter.listSessions()
      const hasSession = await adapter.hasSession({ threadId: input.thread.id })
      await adapter.stopSession({ threadId: input.thread.id })
      const hasSessionAfterStop = await adapter.hasSession({ threadId: input.thread.id })

      expect(adapter.capabilities).toEqual({
        readThread: true,
        rollbackThread: true,
        sessionModelSwitch: 'in-session',
        stopAll: true,
      })
      expect(snapshot).toMatchObject({
        installed: true,
        status: 'ready',
        version: '9.9.9',
      })
      expect(snapshot.models[0]).toMatchObject({ slug: 'gpt-5.5' })
      // Efforts newer than the pinned protocol schema (`max`, `ultra`) and one
      // it has never heard of must reach the snapshot instead of emptying it.
      expect(snapshot.models[0]?.capabilities).toEqual({
        defaultReasoningEffort: 'medium',
        reasoningEfforts: [
          { description: 'Fastest responses', effort: 'low' },
          { description: 'Balanced', effort: 'medium' },
          { description: 'Deeper reasoning', effort: 'high' },
          { description: 'Even deeper reasoning', effort: 'xhigh' },
          { description: 'Maximum reasoning depth', effort: 'max' },
          { description: 'Maximum reasoning with delegation', effort: 'ultra' },
          { description: 'An effort level this schema predates', effort: 'hyperdrive' },
        ],
      })
      expect(hasSession).toBe(true)
      expect(hasSessionAfterStop).toBe(false)
      expect(sessions).toContainEqual(
        expect.objectContaining({
          model: 'codex',
          providerThreadId: 'provider-thread-1',
          status: 'ready',
          threadId: input.thread.id,
        }),
      )
      expect(events).toContainEqual(
        expect.objectContaining({
          itemId: 'item-1',
          payload: expect.objectContaining({
            delta: 'Hello from app-server',
            streamKind: 'assistant_text',
          }),
          threadId: input.thread.id,
          turnId: input.turnId,
          type: 'content.delta',
        }),
      )
      expect(events).toContainEqual(
        expect.objectContaining({
          itemId: 'item-1',
          payload: expect.objectContaining({
            detail: 'Hello from app-server',
            itemType: 'assistant_message',
            status: 'completed',
          }),
          threadId: input.thread.id,
          turnId: input.turnId,
          type: 'item.completed',
        }),
      )
      expect(events).toContainEqual(
        expect.objectContaining({
          payload: { state: 'completed' },
          threadId: input.thread.id,
          turnId: input.turnId,
          type: 'turn.completed',
        }),
      )
      expect(events).toContainEqual(
        expect.objectContaining({
          payload: { state: 'ready' },
          threadId: input.thread.id,
          type: 'session.state.changed',
        }),
      )
    })
  })

  it('passes image data URLs and Codex model options to turn/start', async () => {
    await withFakeCodex(async () => {
      const adapter = new CodexProviderAdapter()
      const input = providerTurnInput()
      input.attachments = [
        {
          dataUrl: 'data:image/png;base64,abc',
          id: 'image-1',
          mimeType: 'image/png',
          name: 'screenshot.png',
          sizeBytes: 3,
          type: 'image',
        } as ProviderTurnInput['attachments'][number],
      ]
      input.modelSelection = {
        model: 'codex',
        options: {
          fastMode: true,
          reasoningEffort: 'high',
        },
        providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID as ProviderInstanceId,
      }

      await adapter.sendTurn(input)
      await adapter.stopAll()

      expect(await adapter.hasSession({ threadId: input.thread.id })).toBe(false)
    })
  })

  it('relays the selected reasoning effort to turn/start verbatim', async () => {
    await withFakeCodex(
      async () => {
        const adapter = new CodexProviderAdapter()
        const events: ProviderRuntimeEvent[] = []
        // `ultra` is past the end of the pinned protocol enum, so it also proves
        // no allowlist between the selection and the CLI silently downgrades it.
        const selected = providerTurnInput()
        selected.modelSelection = {
          model: 'codex',
          options: { reasoningEffort: 'ultra' },
          providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID as ProviderInstanceId,
        }
        const unselected = providerTurnInput()
        unselected.turnId = v.parse(turnIdSchema, 'turn-2')
        collectAdapterEvents(adapter, events)

        await adapter.sendTurn(selected)
        await settleRuntimeEvents()
        await adapter.sendTurn(unselected)
        await settleRuntimeEvents()
        await adapter.stopAll()

        const echoes = events.filter(
          (event) =>
            event.type === 'item.completed' && event.payload.itemType === 'assistant_message',
        )
        expect(echoes).toMatchObject([
          { payload: { detail: '{"effort":"ultra","serviceTier":null}' } },
          { payload: { detail: '{"effort":null,"serviceTier":null}' } },
        ])
      },
      { mode: 'echo-turn-params' },
    )
  })

  it('switches a live session into plan mode without restarting the Codex thread', async () => {
    await withFakeCodex(
      async ({ spawnLogPath }) => {
        const adapter = new CodexProviderAdapter()
        const events: ProviderRuntimeEvent[] = []
        const defaultTurn = providerTurnInput()
        const planTurn = providerTurnInput()
        planTurn.interactionMode = 'plan'
        planTurn.turnId = v.parse(turnIdSchema, 'turn-2')
        collectAdapterEvents(adapter, events)

        await adapter.sendTurn(defaultTurn)
        await settleRuntimeEvents()
        await adapter.sendTurn(planTurn)
        await settleRuntimeEvents()
        const sessions = await adapter.listSessions()
        const spawns = await countFakeCodexSpawns(spawnLogPath)
        await adapter.stopAll()

        const [first, second] = echoedModeParams(events)
        expect(first?.mode).toBe('default')
        expect(first?.settingsModel).toBe('codex')
        expect(first?.developerInstructions).toContain('Collaboration Mode: Default')
        // No effort was selected, so Codex keeps the model's own default.
        expect(first?.reasoningEffort).toBeNull()
        // Codex ignores a top-level `developerInstructions` on turn/start; the
        // collaboration mode is the only channel that carries them.
        expect(first?.turnDeveloperInstructions).toBeNull()
        expect(second?.mode).toBe('plan')
        expect(second?.developerInstructions).toContain('Collaboration Mode: Plan')
        expect(second?.developerInstructions).toContain('Your output is a plan')
        // One app-server process and one thread/start across both turns: the
        // mode switch reconfigured the live session instead of replacing it and
        // dropping the conversation Codex holds.
        expect(spawns).toBe(1)
        expect(second?.threadStarts).toBe(1)
        expect(sessions).toHaveLength(1)
      },
      { mode: 'echo-mode-params' },
    )
  })

  it('sends approvalsReviewer on every turn so a mode switch cannot inherit it', async () => {
    await withFakeCodex(
      async () => {
        const adapter = new CodexProviderAdapter()
        const events: ProviderRuntimeEvent[] = []
        const turns = RUNTIME_MODES.map((runtimeMode, index) => {
          const turn = providerTurnInput()
          turn.runtimeMode = runtimeMode
          turn.turnId = v.parse(turnIdSchema, `turn-${index + 1}`)
          return turn
        })
        collectAdapterEvents(adapter, events)

        for (const turn of turns) {
          await adapter.sendTurn(turn)
          await settleRuntimeEvents()
        }
        await adapter.stopAll()

        // Every runtime mode we ship reviews with the user. What matters is that
        // the field is spelled out each time: omit it and Codex keeps whichever
        // reviewer the thread was last configured with.
        const echoes = echoedModeParams(events)
        expect(echoes.map((echo) => echo.approvalsReviewer)).toEqual(['user', 'user', 'user'])
        expect(echoes.map((echo) => echo.threadApprovalsReviewer)).toEqual(['user', 'user', 'user'])
      },
      { mode: 'echo-mode-params' },
    )
  })

  it('reports no capabilities for a model that advertises no reasoning efforts', async () => {
    await withFakeCodex(
      async () => {
        const adapter = new CodexProviderAdapter()
        const snapshot = await adapter.snapshot()

        expect(snapshot.models[0]).toMatchObject({ slug: 'gpt-5.5' })
        expect(snapshot.models[0]?.capabilities).toBeNull()
      },
      { mode: 'no-reasoning-efforts' },
    )
  })

  it('streams Codex reasoning notifications as thinking progress', async () => {
    await withFakeCodex(
      async () => {
        const adapter = new CodexProviderAdapter()
        const events: ProviderRuntimeEvent[] = []
        const input = providerTurnInput()
        collectAdapterEvents(adapter, events)

        await adapter.sendTurn(input)
        await settleRuntimeEvents()
        await adapter.stopAll()

        const progressEvents = events.filter((event) => event.type === 'task.progress')
        expect(progressEvents).toEqual([
          expect.objectContaining({
            payload: expect.objectContaining({
              description: 'Thinking',
              summary: 'Thinking',
              taskId: 'reasoning:reasoning-1',
            }),
            threadId: input.thread.id,
            turnId: input.turnId,
            type: 'task.progress',
          }),
          expect.objectContaining({
            payload: expect.objectContaining({
              description: 'Inspecting the repo.',
              summary: 'Inspecting the repo.',
              taskId: 'reasoning:reasoning-1',
            }),
            threadId: input.thread.id,
            turnId: input.turnId,
            type: 'task.progress',
          }),
        ])
      },
      { mode: 'reasoning-events' },
    )
  })

  it('reads token usage from the tokenUsage notification field', async () => {
    await withFakeCodex(
      async () => {
        const adapter = new CodexProviderAdapter()
        const events: ProviderRuntimeEvent[] = []
        const input = providerTurnInput()
        collectAdapterEvents(adapter, events)

        await adapter.sendTurn(input)
        await settleRuntimeEvents()
        await adapter.stopAll()

        const usageEvents = events.filter((event) => event.type === 'thread.token-usage.updated')
        expect(usageEvents).toEqual([
          expect.objectContaining({
            payload: {
              usage: {
                cachedInputTokens: 400,
                compactsAutomatically: true,
                inputTokens: 1200,
                maxTokens: 272000,
                outputTokens: 300,
                reasoningOutputTokens: 100,
                totalProcessedTokens: 3200,
                usedTokens: 1600,
              },
            },
            threadId: input.thread.id,
            type: 'thread.token-usage.updated',
          }),
        ])
      },
      { mode: 'token-usage' },
    )
  })

  it('preserves Codex assistant item boundaries for separate agent messages', async () => {
    await withFakeCodex(
      async () => {
        const adapter = new CodexProviderAdapter()
        const events: ProviderRuntimeEvent[] = []
        const input = providerTurnInput()
        collectAdapterEvents(adapter, events)

        await adapter.sendTurn(input)
        await settleRuntimeEvents()
        await adapter.stopAll()

        const assistantDeltas = events.filter(
          (event) =>
            event.type === 'content.delta' && event.payload.streamKind === 'assistant_text',
        )
        const assistantCompletions = events.filter(
          (event) =>
            event.type === 'item.completed' && event.payload.itemType === 'assistant_message',
        )

        expect(assistantDeltas).toMatchObject([
          {
            itemId: 'item-1',
            payload: { delta: 'First item', streamKind: 'assistant_text' },
            type: 'content.delta',
          },
          {
            itemId: 'item-2',
            payload: { delta: 'Second item', streamKind: 'assistant_text' },
            type: 'content.delta',
          },
        ])
        expect(assistantCompletions).toMatchObject([
          { itemId: 'item-1', type: 'item.completed' },
          { itemId: 'item-2', type: 'item.completed' },
        ])
      },
      { mode: 'multi-agent-items' },
    )
  })

  it('reads and rolls back active provider threads', async () => {
    await withFakeCodex(async () => {
      const adapter = new CodexProviderAdapter()
      const input = providerTurnInput()

      await adapter.sendTurn(input)
      const snapshot = await adapter.readThread({ threadId: input.thread.id })
      const rolledBack = await adapter.rollbackThread({
        numTurns: 1,
        threadId: input.thread.id,
      })
      await adapter.stopAll()

      expect(snapshot).toEqual({
        providerThreadId: 'provider-thread-1',
        threadId: input.thread.id,
        turns: [
          {
            id: 'provider-turn-1',
            items: [{ id: 'item-1', type: 'agentMessage', text: 'hello' }],
          },
        ],
      })
      expect(rolledBack).toEqual({
        providerThreadId: 'provider-thread-1',
        threadId: input.thread.id,
        turns: [],
      })
    })
  })

  it('fails read and rollback requests without an active session', async () => {
    const adapter = new CodexProviderAdapter()
    const input = providerTurnInput()

    await expect(adapter.readThread({ threadId: input.thread.id })).rejects.toThrow(
      'Codex thread/read requires an active session',
    )
    await expect(
      adapter.rollbackThread({ numTurns: 1, threadId: input.thread.id }),
    ).rejects.toThrow('Codex thread/rollback requires an active session')
    await expect(
      adapter.rollbackThread({ numTurns: 0, threadId: input.thread.id }),
    ).rejects.toThrow('Codex thread rollback requires numTurns')
  })

  it('rejects malformed app-server responses with protocol errors', async () => {
    await withFakeCodex(
      async () => {
        const adapter = new CodexProviderAdapter()
        const input = providerTurnInput()

        await expect(adapter.sendTurn(input)).rejects.toThrow(
          'Codex app-server protocol error for thread/start response',
        )
      },
      { mode: 'malformed-thread-start' },
    )
  })

  it('rejects malformed app-server notifications with protocol errors', async () => {
    await withFakeCodex(
      async () => {
        const adapter = new CodexProviderAdapter()
        const input = providerTurnInput()

        await expect(adapter.sendTurn(input)).rejects.toThrow(
          'Codex app-server protocol error for item/agentMessage/delta notification',
        )
        await adapter.stopAll()
      },
      { mode: 'malformed-delta' },
    )
  })
})

async function withFakeCodex(
  run: (context: FakeCodexContext) => Promise<void>,
  options: { readonly mode?: string } = {},
) {
  const previousLock = fakeCodexLock
  let releaseLock: () => void = () => {}
  fakeCodexLock = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  await previousLock

  const directory = await mkdtemp(path.join(tmpdir(), 'platform-fake-codex-'))
  const binaryPath = path.join(directory, 'codex')
  const spawnLogPath = path.join(directory, 'spawns.log')
  const previousBinary = process.env.PLATFORM_CODEX_BINARY
  const previousMode = process.env.PLATFORM_FAKE_CODEX_MODE
  await writeFile(binaryPath, fakeCodexScript)
  await writeFile(spawnLogPath, '')
  await chmod(binaryPath, 0o755)
  process.env.PLATFORM_CODEX_BINARY = binaryPath
  process.env.PLATFORM_FAKE_CODEX_SPAWN_LOG = spawnLogPath
  if (options.mode) process.env.PLATFORM_FAKE_CODEX_MODE = options.mode

  try {
    await run({ spawnLogPath })
  } finally {
    restoreCodexBinary(previousBinary)
    restoreFakeCodexMode(previousMode)
    delete process.env.PLATFORM_FAKE_CODEX_SPAWN_LOG
    await rm(directory, { force: true, recursive: true })
    releaseLock()
  }
}

/** One line per fake app-server process, so a test can prove a session was reused. */
async function countFakeCodexSpawns(spawnLogPath: string) {
  const log = await readFile(spawnLogPath, 'utf8')
  return log.split('\n').filter(Boolean).length
}

function collectAdapterEvents(adapter: CodexProviderAdapter, events: ProviderRuntimeEvent[]) {
  void (async () => {
    for await (const event of adapter.streamEvents()) {
      events.push(event)
    }
  })()
}

function echoedModeParams(events: ProviderRuntimeEvent[]) {
  const echoes: EchoedModeParams[] = []
  for (const event of events) {
    if (event.type !== 'item.completed') continue
    if (event.payload.itemType !== 'assistant_message') continue
    echoes.push(JSON.parse(String(event.payload.detail)) as EchoedModeParams)
  }

  return echoes
}

async function settleRuntimeEvents() {
  await Promise.resolve()
  await Promise.resolve()
}

function providerTurnInput(): ProviderTurnInput {
  const now = '2026-05-28T00:00:00.000Z'
  const projectId = v.parse(projectIdSchema, 'project-1')
  const threadId = v.parse(threadIdSchema, 'thread-1')
  const turnId = v.parse(turnIdSchema, 'turn-1')
  const modelSelection = {
    model: 'codex',
    providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID as ProviderInstanceId,
  }

  return {
    attachments: [],
    cwd: 'Users/shaul/Desktop/platform',
    interactionMode: DEFAULT_INTERACTION_MODE,
    messageText: 'Say hello',
    modelSelection,
    project: {
      createdAt: now,
      defaultModelSelection: modelSelection,
      deletedAt: null,
      id: projectId,
      title: 'Platform',
      updatedAt: now,
      workspaceRoot: 'Users/shaul/Desktop/platform',
    },
    providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    runtimeMode: DEFAULT_RUNTIME_MODE,
    thread: {
      activities: [],
      archivedAt: null,
      branch: null,
      createdAt: now,
      deletedAt: null,
      id: threadId,
      interactionMode: DEFAULT_INTERACTION_MODE,
      latestTurn: null,
      messages: [],
      modelSelection,
      projectId,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      session: null,
      title: 'Test thread',
      updatedAt: now,
      worktreePath: 'Users/shaul/Desktop/platform',
    },
    turnId,
  }
}

function restoreCodexBinary(previousBinary: string | undefined) {
  if (previousBinary === undefined) {
    delete process.env.PLATFORM_CODEX_BINARY
    return
  }

  process.env.PLATFORM_CODEX_BINARY = previousBinary
}

function restoreFakeCodexMode(previousMode: string | undefined) {
  if (previousMode === undefined) {
    delete process.env.PLATFORM_FAKE_CODEX_MODE
    return
  }

  process.env.PLATFORM_FAKE_CODEX_MODE = previousMode
}
