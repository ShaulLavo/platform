import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import type { LspServerMatch } from '../registry'
import { encodeLspStdioMessage, LspStdioMessageReader } from '../stdio-rpc'
import { LspSessionPool } from '../proxy-session'
import { closeApp, createApp } from '../../app'
import { createMetadataDatabase } from '../../db/client'
import { testSettingsOptions } from '../../settings/testing'

const databases: { close: () => void }[] = []
const pools: LspSessionPool[] = []
const roots: string[] = []

afterEach(async () => {
  for (const pool of pools.splice(0)) pool.disposeAll()
  // Same reason `appCleanup` closes the settings store: an unclosed SQLite
  // handle per app the file builds is a leaked native handle per test run.
  for (const database of databases.splice(0)) database.close()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('LspSessionPool pooling', () => {
  it('reuses one backend process and synthesizes later initialize responses', async () => {
    const fixture = await lspFixture()
    const first = await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')
    const second = await fixture.pool.acquire(fixture.secondSocket, fixture.match, '')

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
  })
})

describe('LspSessionPool ownership', () => {
  it('kills the backend and closes client sockets on disposeAll', async () => {
    const fixture = await lspFixture()
    await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')
    await fixture.pool.acquire(fixture.secondSocket, fixture.match, '')

    fixture.pool.disposeAll()

    expect(fixture.kill).toHaveBeenCalledTimes(1)
    expect(fixture.pool.size).toBe(0)
    expect(fixture.firstSocket.closed).toBe(true)
    expect(fixture.secondSocket.closed).toBe(true)
  })

  it('is idempotent — a second disposeAll kills nothing twice', async () => {
    const fixture = await lspFixture()
    await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')

    fixture.pool.disposeAll()
    fixture.pool.disposeAll()

    expect(fixture.kill).toHaveBeenCalledTimes(1)
    expect(fixture.pool.size).toBe(0)
  })

  it('leaves an in-flight request unanswered and closes the socket instead', async () => {
    const fixture = await initializedFixture()
    const sentBefore = fixture.firstSocket.sent.length
    await fixture.first.handleClientMessage(json(hoverRequest(10, 'file:///repo/a.ts')))

    fixture.pool.disposeAll()

    expect(fixture.firstSocket.sent).toHaveLength(sentBefore)
    expect(fixture.firstSocket.closed).toBe(true)
  })

  it('refuses to spawn a backend after disposeAll', async () => {
    const fixture = await lspFixture()
    fixture.pool.disposeAll()

    const session = await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')

    expect(session).toBeNull()
    expect(fixture.spawn).not.toHaveBeenCalled()
  })

  it('kills a backend whose spawn lands after disposeAll', async () => {
    const fixture = await lspFixture()
    fixture.holdSpawn()
    const acquired = fixture.pool.acquire(fixture.firstSocket, fixture.match, '')

    fixture.pool.disposeAll()
    fixture.releaseSpawn()

    expect(await acquired).toBeNull()
    expect(fixture.kill).toHaveBeenCalledTimes(1)
    expect(fixture.pool.size).toBe(0)
  })

  // The negative case for step 1d. `disposeAll` shuts the pool for good, but a
  // backend that dies on its own must NOT shut the pool — it must be evicted so
  // the next client spawns a fresh one. Without this, tightening disposal could
  // silently wedge a live pool on the first language-server crash.
  it('evicts a backend that exits on its own and respawns for the next client', async () => {
    const fixture = await lspFixture()
    await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')

    fixture.process.process.emit('exit', 0, null)

    expect(fixture.pool.size).toBe(0)
    expect(fixture.firstSocket.closed).toBe(true)

    const next = await fixture.pool.acquire(fixture.secondSocket, fixture.match, '')

    expect(next).not.toBeNull()
    expect(fixture.spawn).toHaveBeenCalledTimes(2)
    expect(fixture.pool.size).toBe(1)
  })

  it('closeApp disposes the pooled LSP sessions', async () => {
    const fixture = await lspFixture()
    const app = lspTestApp(await fixtureRoot('platform-lsp-app-'), fixture.pool)
    await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')

    await closeApp(app)

    expect(fixture.kill).toHaveBeenCalledTimes(1)
    expect(fixture.pool.size).toBe(0)
  })
})

// An in-memory database and a settings file inside the test's own temp root:
// `createApp` otherwise opens the developer's real ~/.platform SQLite and
// settings.json, and this repo keeps no healing code for either.
function lspTestApp(root: string, pool: LspSessionPool) {
  const database = createMetadataDatabase({ databasePath: ':memory:' })
  databases.push(database)
  return createApp({
    auth: { allowedOrigins: ['http://localhost:5173'] },
    lsp: { pool },
    metadataDatabase: database,
    orchestration: { database: database.db },
    settings: testSettingsOptions(root),
    watch: false,
    workspaceRoot: root,
  })
}

async function initializedFixture() {
  const fixture = await lspFixture()
  const first = await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')
  const second = await fixture.pool.acquire(fixture.secondSocket, fixture.match, '')
  if (!first || !second) throw new Error('expected pooled LSP sessions')

  const initialize = first.handleClientMessage(json(initializeRequest(1)))
  await fixture.waitForServerMessageCount(1)
  fixture.respond({ id: fixture.serverMessages[0].id, jsonrpc: '2.0', result: initializeResult() })
  await initialize

  return { ...fixture, first, second }
}

async function lspFixture() {
  const root = await fixtureRoot('platform-lsp-pool-')
  const pool = new LspSessionPool()
  pools.push(pool)

  const process = fakeProcess()
  const serverMessages: Record<string, unknown>[] = []
  const reader = new LspStdioMessageReader((message) => {
    serverMessages.push(JSON.parse(message) as Record<string, unknown>)
  })
  process.stdin.on('data', (chunk) => reader.push(chunk))

  // A spawn the test can hold open, to exercise a backend that lands *after*
  // the pool was disposed.
  let spawnGate: Promise<void> | null = null
  let openSpawnGate: (() => void) | null = null
  const spawn = vi.fn(async () => {
    if (spawnGate) await spawnGate
    return { process: process.process }
  })
  const match = {
    root,
    server: {
      extensions: ['.ts'],
      id: 'typescript',
      root: async () => root,
      spawn,
    },
  } satisfies LspServerMatch

  return {
    firstSocket: new FakeSocket(),
    kill: process.kill,
    match,
    pool,
    process,
    secondSocket: new FakeSocket(),
    serverMessages,
    spawn,
    holdSpawn: () => {
      spawnGate = new Promise<void>((resolve) => {
        openSpawnGate = resolve
      })
    },
    initializeMessages: () => serverMessages.filter((message) => message.method === 'initialize'),
    releaseSpawn: () => openSpawnGate?.(),
    respond: (message: unknown) => {
      process.stdout.write(encodeLspStdioMessage(JSON.stringify(message)))
    },
    waitForServerMessageCount: (count: number) =>
      waitFor(() => serverMessages.length >= count, `expected ${count} server messages`),
  }
}

async function fixtureRoot(prefix: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix))
  roots.push(root)
  return root
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
  const kill = vi.fn(() => {
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
