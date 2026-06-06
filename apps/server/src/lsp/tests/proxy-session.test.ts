import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import type { LspServerMatch } from '../registry'
import { encodeLspStdioMessage, LspStdioMessageReader } from '../stdio-rpc'
import { LspProxySession } from '../proxy-session'

const roots: string[] = []
const previousIdleTimeout = process.env.PLATFORM_LSP_IDLE_TIMEOUT_MS

beforeEach(() => {
  process.env.PLATFORM_LSP_IDLE_TIMEOUT_MS = '0'
})

afterEach(async () => {
  process.env.PLATFORM_LSP_IDLE_TIMEOUT_MS = previousIdleTimeout
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('LspProxySession pooling', () => {
  it('reuses one backend process and synthesizes later initialize responses', async () => {
    const fixture = await lspFixture()
    const first = await LspProxySession.create(fixture.firstSocket, fixture.match, '')
    const second = await LspProxySession.create(fixture.secondSocket, fixture.match, '')

    expect(fixture.spawn).toHaveBeenCalledTimes(1)
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()

    const firstInitialize = first!.handleClientMessage(json(initializeRequest(1)))
    await fixture.waitForServerMessageCount(1)
    fixture.respond({
      id: fixture.serverMessages[0].id,
      jsonrpc: '2.0',
      result: initializeResult(),
    })
    await firstInitialize

    await second!.handleClientMessage(json(initializeRequest(2)))

    expect(fixture.initializeMessages()).toHaveLength(1)
    expect(fixture.firstSocket.sent[0]).toMatchObject({ id: 1, result: initializeResult() })
    expect(fixture.secondSocket.sent[0]).toMatchObject({ id: 2, result: initializeResult() })

    first!.dispose()
    second!.dispose()
    await Bun.sleep(1)
  })

  it('routes pooled backend responses back to the originating socket', async () => {
    const fixture = await initializedFixture()
    await fixture.second!.handleClientMessage(json(initializeRequest(2)))

    await fixture.first!.handleClientMessage(json(hoverRequest(10, 'file:///repo/a.ts')))
    await fixture.second!.handleClientMessage(json(hoverRequest(10, 'file:///repo/b.ts')))
    const firstHover = fixture.serverMessages.at(-2)
    const secondHover = fixture.serverMessages.at(-1)
    if (!firstHover || !secondHover) throw new Error('expected hover requests')

    fixture.respond({ id: secondHover.id, jsonrpc: '2.0', result: hoverResult('second') })
    fixture.respond({ id: firstHover.id, jsonrpc: '2.0', result: hoverResult('first') })

    expect(fixture.firstSocket.sent.at(-1)).toMatchObject({
      id: 10,
      result: hoverResult('first'),
    })
    expect(fixture.secondSocket.sent.at(-1)).toMatchObject({
      id: 10,
      result: hoverResult('second'),
    })

    fixture.first!.dispose()
    fixture.second!.dispose()
    await Bun.sleep(1)
  })

  it('opens a shared document once and closes it after the last owner disconnects', async () => {
    const fixture = await initializedFixture()
    await fixture.second!.handleClientMessage(json(initializeRequest(2)))

    const open = didOpen('file:///repo/a.ts', 'const value = 1')
    await fixture.first!.handleClientMessage(json(open))
    await fixture.second!.handleClientMessage(json(open))

    expect(
      fixture.serverMessages.filter((message) => message.method === 'textDocument/didOpen'),
    ).toHaveLength(1)

    await fixture.first!.handleClientMessage(json(didClose('file:///repo/a.ts')))
    expect(
      fixture.serverMessages.filter((message) => message.method === 'textDocument/didClose'),
    ).toHaveLength(0)

    await fixture.second!.handleClientMessage(json(didClose('file:///repo/a.ts')))
    expect(
      fixture.serverMessages.filter((message) => message.method === 'textDocument/didClose'),
    ).toHaveLength(1)

    fixture.first!.dispose()
    fixture.second!.dispose()
    await Bun.sleep(1)
  })
})

async function initializedFixture() {
  const fixture = await lspFixture()
  const first = await LspProxySession.create(fixture.firstSocket, fixture.match, '')
  const second = await LspProxySession.create(fixture.secondSocket, fixture.match, '')
  if (!first || !second) throw new Error('expected pooled LSP sessions')

  const initialize = first.handleClientMessage(json(initializeRequest(1)))
  await fixture.waitForServerMessageCount(1)
  fixture.respond({ id: fixture.serverMessages[0].id, jsonrpc: '2.0', result: initializeResult() })
  await initialize

  return { ...fixture, first, second }
}

async function lspFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-lsp-pool-'))
  roots.push(root)

  const process = fakeProcess()
  const serverMessages: Record<string, unknown>[] = []
  const reader = new LspStdioMessageReader((message) => {
    serverMessages.push(JSON.parse(message) as Record<string, unknown>)
  })
  process.stdin.on('data', (chunk) => reader.push(chunk))

  const spawn = mock(async () => ({ process: process.process }))
  const match = {
    root,
    server: {
      extensions: ['.ts'],
      id: `typescript-${path.basename(root)}`,
      root: async () => root,
      spawn,
    },
  } satisfies LspServerMatch

  return {
    firstSocket: new FakeSocket(),
    match,
    process,
    secondSocket: new FakeSocket(),
    serverMessages,
    spawn,
    initializeMessages: () => serverMessages.filter((message) => message.method === 'initialize'),
    respond: (message: unknown) => {
      process.stdout.write(encodeLspStdioMessage(JSON.stringify(message)))
    },
    waitForServerMessageCount: (count: number) =>
      waitFor(() => serverMessages.length >= count, `expected ${count} server messages`),
  }
}

class FakeSocket {
  closed = false
  readonly sent: Record<string, unknown>[] = []

  close(): void {
    this.closed = true
  }

  send(message: string): void {
    this.sent.push(JSON.parse(message) as Record<string, unknown>)
  }
}

function fakeProcess() {
  const stdout = new PassThrough()
  const stdin = new PassThrough()
  const stderr = new PassThrough()
  const events = new EventEmitter()
  const kill = mock(() => {
    events.emit('exit', null, 'SIGTERM')
    return true
  })
  const process = Object.assign(events, {
    kill,
    pid: 1234,
    stderr,
    stdin,
    stdout,
  }) as unknown as ChildProcessWithoutNullStreams

  return { kill, process, stderr, stdin, stdout }
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return

    await Bun.sleep(1)
  }

  throw new Error(message)
}

function json(value: unknown): string {
  return JSON.stringify(value)
}

function initializeRequest(id: number) {
  return {
    id,
    jsonrpc: '2.0',
    method: 'initialize',
    params: {},
  }
}

function initializeResult() {
  return {
    capabilities: {
      textDocumentSync: {
        change: 2,
        openClose: true,
      },
    },
  }
}

function hoverRequest(id: number, uri: string) {
  return {
    id,
    jsonrpc: '2.0',
    method: 'textDocument/hover',
    params: {
      position: { character: 0, line: 0 },
      textDocument: { uri },
    },
  }
}

function hoverResult(value: string) {
  return { contents: { kind: 'plaintext', value } }
}

function didOpen(uri: string, text: string) {
  return {
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        languageId: 'typescript',
        text,
        uri,
        version: 0,
      },
    },
  }
}

function didClose(uri: string) {
  return {
    jsonrpc: '2.0',
    method: 'textDocument/didClose',
    params: { textDocument: { uri } },
  }
}
