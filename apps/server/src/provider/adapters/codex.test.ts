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
      await adapter.stopSession({ threadId: input.thread.id })

      expect(snapshot).toMatchObject({
        installed: true,
        status: 'ready',
        version: '9.9.9',
      })
      expect(snapshot.models[0]).toMatchObject({ slug: 'gpt-5.5' })
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
