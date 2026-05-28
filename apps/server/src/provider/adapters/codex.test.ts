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
  if (message.method === 'initialize') {
    send({ id: message.id, result: { userAgent: 'Codex Desktop/9.9.9 fake-test' } });
    return;
  }
  if (message.method === 'initialized') {
    return;
  }
  if (message.method === 'account/read') {
    send({ id: message.id, result: { account: { type: 'chatgpt' }, requiresOpenaiAuth: false } });
    return;
  }
  if (message.method === 'model/list') {
    send({
      id: message.id,
      result: { data: [{ model: 'gpt-5.5', displayName: 'GPT-5.5' }], nextCursor: null },
    });
    return;
  }
  if (message.method === 'thread/start') {
    if (!assertStartParams(message)) return;
    send({
      method: 'thread/started',
      params: { thread: { id: 'provider-thread-1' } },
    });
    send({ id: message.id, result: { thread: { id: 'provider-thread-1' } } });
    return;
  }
  if (message.method === 'turn/start') {
    if (!assertTurnParams(message)) return;
    process.stderr.write('2026-05-28T00:00:00Z INFO codex: harmless diagnostic\\n');
    send({
      method: 'turn/started',
      params: { threadId: 'provider-thread-1', turn: { id: 'provider-turn-1', status: 'inProgress' } },
    });
    send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'provider-thread-1',
        turnId: 'provider-turn-1',
        itemId: 'item-1',
        delta: 'Hello from app-server',
      },
    });
    send({
      method: 'turn/completed',
      params: { threadId: 'provider-thread-1', turn: { id: 'provider-turn-1', status: 'completed' } },
    });
    send({ id: message.id, result: { turn: { id: 'provider-turn-1', status: 'completed' } } });
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
        thread: {
          id: 'provider-thread-1',
          turns: [{ id: 'provider-turn-1', items: [{ type: 'agentMessage', text: 'hello' }] }],
        },
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
        thread: {
          id: 'provider-thread-1',
          turns: [],
        },
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

describe('CodexProviderAdapter', () => {
  it('uses the app-server protocol and keeps early turn notifications', async () => {
    await withFakeCodex(async () => {
      const adapter = new CodexProviderAdapter()
      const events: ProviderRuntimeEvent[] = []
      const input = providerTurnInput()

      const snapshot = await adapter.snapshot()
      await adapter.startTurn(input, {
        ingest: async (event) => {
          events.push(event)
        },
      })
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
          delta: 'Hello from app-server',
          threadId: input.thread.id,
          turnId: input.turnId,
          type: 'assistant.delta',
        }),
      )
      expect(events).toContainEqual(
        expect.objectContaining({
          messageId: `assistant:${input.turnId}`,
          threadId: input.thread.id,
          turnId: input.turnId,
          type: 'assistant.complete',
        }),
      )
      expect(events).toContainEqual(
        expect.objectContaining({
          status: 'ready',
          threadId: input.thread.id,
          type: 'session.set',
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

      await adapter.startTurn(input, {
        ingest: async () => {},
      })
      await adapter.stopAll()

      expect(await adapter.hasSession({ threadId: input.thread.id })).toBe(false)
    })
  })

  it('reads and rolls back active provider threads', async () => {
    await withFakeCodex(async () => {
      const adapter = new CodexProviderAdapter()
      const input = providerTurnInput()

      await adapter.startTurn(input, {
        ingest: async () => {},
      })
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
            items: [{ type: 'agentMessage', text: 'hello' }],
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
})

async function withFakeCodex(run: () => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'platform-fake-codex-'))
  const binaryPath = path.join(directory, 'codex')
  const previousBinary = process.env.PLATFORM_CODEX_BINARY
  await writeFile(binaryPath, fakeCodexScript)
  await chmod(binaryPath, 0o755)
  process.env.PLATFORM_CODEX_BINARY = binaryPath

  try {
    await run()
  } finally {
    restoreCodexBinary(previousBinary)
    await rm(directory, { force: true, recursive: true })
  }
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
