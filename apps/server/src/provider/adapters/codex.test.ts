import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'bun:test'
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
import { CodexProviderAdapter } from './codex'
import type { ProviderRuntimeEvent, ProviderTurnInput } from '../types'

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
    supportedReasoningEfforts: [],
  };
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
  if (message.params.model !== 'gpt-5.5') {
    fail(message.id, 'legacy model was not normalized');
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
  if (message.params.model !== 'gpt-5.5') {
    fail(message.id, 'turn model was not normalized');
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
    send({
      id: message.id,
      result: { data: [fakeModel()], nextCursor: null },
    });
    return;
  }
  if (message.method === 'thread/start') {
    if (!assertStartParams(message)) return;
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
    if (!assertTurnParams(message)) return;
    process.stderr.write('2026-05-28T00:00:00Z INFO codex: harmless diagnostic\\n');
    send({
      method: 'turn/started',
      params: { threadId: 'provider-thread-1', turn: fakeTurn('inProgress') },
    });
    if (mode === 'reasoning-events') {
      sendReasoningEvents();
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
      expect(hasSession).toBe(true)
      expect(hasSessionAfterStop).toBe(false)
      expect(sessions).toContainEqual(
        expect.objectContaining({
          model: 'gpt-5.5',
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
        model: 'gpt-5.5',
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

async function withFakeCodex(run: () => Promise<void>, options: { readonly mode?: string } = {}) {
  const previousLock = fakeCodexLock
  let releaseLock: () => void = () => {}
  fakeCodexLock = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  await previousLock

  const directory = await mkdtemp(path.join(tmpdir(), 'platform-fake-codex-'))
  const binaryPath = path.join(directory, 'codex')
  const previousBinary = process.env.PLATFORM_CODEX_BINARY
  const previousMode = process.env.PLATFORM_FAKE_CODEX_MODE
  await writeFile(binaryPath, fakeCodexScript)
  await chmod(binaryPath, 0o755)
  process.env.PLATFORM_CODEX_BINARY = binaryPath
  if (options.mode) process.env.PLATFORM_FAKE_CODEX_MODE = options.mode

  try {
    await run()
  } finally {
    restoreCodexBinary(previousBinary)
    restoreFakeCodexMode(previousMode)
    await rm(directory, { force: true, recursive: true })
    releaseLock()
  }
}

function collectAdapterEvents(adapter: CodexProviderAdapter, events: ProviderRuntimeEvent[]) {
  void (async () => {
    for await (const event of adapter.streamEvents()) {
      events.push(event)
    }
  })()
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
