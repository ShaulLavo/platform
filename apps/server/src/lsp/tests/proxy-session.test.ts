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
    await fixture.first.handleClientMessage(json(hoverRequest(10, 'file:///repo/a.ts')))

    fixture.pool.disposeAll()

    // By id rather than by message count: the close is no longer silent — it
    // carries a reason — so counting messages would now pass for a socket that
    // answered the hover and fail for one that only said why it was closing.
    expect(fixture.firstSocket.sent.filter((message) => message.id === 10)).toEqual([])
    expect(fixture.firstSocket.closed).toBe(true)
  })

  it('says why before closing a client socket', async () => {
    const fixture = await initializedFixture()

    fixture.pool.disposeAll()

    expect(fixture.firstSocket.sent.at(-1)).toMatchObject({
      method: '$/platform/serverExited',
      params: { outcome: 'app_shutdown', serverId: 'typescript' },
    })
    expect(fixture.secondSocket.sent.at(-1)).toMatchObject({
      method: '$/platform/serverExited',
      params: { outcome: 'app_shutdown' },
    })
  })

  it('says why when the backend dies on its own', async () => {
    const fixture = await initializedFixture()

    // Not `disposeAll` — that is this app shutting down. This is the language
    // server exiting underneath a live tab, which is the failure §7.1 is about:
    // the socket used to close bare and the status indicator kept reading
    // `ready` over a process that was gone.
    fixture.process.process.emit('exit', 3, null)

    expect(fixture.firstSocket.sent.at(-1)).toMatchObject({
      method: '$/platform/serverExited',
      params: { exitCode: 3, outcome: 'process_exit', serverId: 'typescript' },
    })
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

describe('LspSessionPool server requests', () => {
  it('pushes configured settings once after the initialized notification', async () => {
    const settings = {
      json: {
        jsonFoldingLimit: 5000,
        jsoncFoldingLimit: 5000,
        resultLimit: 5000,
        validate: { enable: true },
      },
    }
    const fixture = await initializedFixture({ didChangeConfiguration: settings })
    const initialized = { jsonrpc: '2.0', method: 'initialized', params: {} }

    await fixture.first.handleClientMessage(json(initialized))
    await fixture.second.handleClientMessage(json(initialized))

    expect(fixture.serverMessages.slice(1)).toEqual([
      initialized,
      {
        jsonrpc: '2.0',
        method: 'workspace/didChangeConfiguration',
        params: { settings },
      },
    ])
  })

  it('answers each configuration item by its own section', async () => {
    const fixture = await initializedFixture({
      configuration: { gopls: { semanticTokens: true }, other: { verbose: 1 } },
    })

    fixture.respond({
      id: 'server-1',
      jsonrpc: '2.0',
      method: 'workspace/configuration',
      params: {
        items: [{ section: 'gopls' }, { section: 'other.verbose' }, { section: 'absent' }],
      },
    })
    await fixture.waitForServerMessageCount(2)

    // One value per item, in the order asked. The old blanket reply was a single
    // `[{}]` however many sections a server named, so a server asking for three
    // had to guess which one it got.
    expect(fixture.serverMessages.at(-1)).toMatchObject({ id: 'server-1' })
    expect((fixture.serverMessages.at(-1) as { result: unknown }).result).toEqual([
      { semanticTokens: true },
      1,
      {},
    ])
  })

  it('answers a configuration request that names no section with the whole tree', async () => {
    const fixture = await initializedFixture({ configuration: { gopls: { semanticTokens: true } } })

    fixture.respond({
      id: 'server-1',
      jsonrpc: '2.0',
      method: 'workspace/configuration',
      params: { items: [{}] },
    })
    await fixture.waitForServerMessageCount(2)

    expect(fixture.serverMessages.at(-1)).toMatchObject({
      id: 'server-1',
      result: [{ gopls: { semanticTokens: true } }],
    })
  })

  it('answers a server with no configuration entry the way it always did', async () => {
    const fixture = await initializedFixture()

    fixture.respond({
      id: 'server-1',
      jsonrpc: '2.0',
      method: 'workspace/configuration',
      params: { items: [{ section: 'anything' }] },
    })
    await fixture.waitForServerMessageCount(2)

    // `toEqual`, not `toMatchObject`: `{}` as an expected array element matches
    // *any* object, so a `toMatchObject` here would pass for a reply carrying a
    // whole settings tree — which is the exact regression this pins.
    expect(fixture.serverMessages.at(-1)).toMatchObject({ id: 'server-1' })
    expect((fixture.serverMessages.at(-1) as { result: unknown }).result).toEqual([{}])
  })

  it('downgrades a semantic-token refresh request into one notification per connection', async () => {
    const fixture = await initializedFixture()
    await fixture.second.handleClientMessage(json(initializeRequest(2)))
    const firstBefore = fixture.firstSocket.sent.length
    const secondBefore = fixture.secondSocket.sent.length

    fixture.respond({ id: 'server-1', jsonrpc: '2.0', method: 'workspace/semanticTokens/refresh' })
    await fixture.waitForServerMessageCount(2)

    // The proxy answers the server itself, because N pooled clients cannot
    // answer one request id.
    expect(fixture.serverMessages.at(-1)).toMatchObject({ id: 'server-1', result: null })

    const forEachConnection = [
      fixture.firstSocket.sent.slice(firstBefore),
      fixture.secondSocket.sent.slice(secondBefore),
    ]
    for (const sent of forEachConnection) {
      expect(sent).toHaveLength(1)
      expect(sent[0]).toEqual({ jsonrpc: '2.0', method: 'workspace/semanticTokens/refresh' })
      // No `id`: a notification draws no response, which is what keeps
      // `routeClientMessage`'s unremapped-response fall-through dead.
      expect(sent[0]).not.toHaveProperty('id')
    }
  })

  it('forwards no inbound server request to any connection', async () => {
    const fixture = await initializedFixture()
    await fixture.second.handleClientMessage(json(initializeRequest(2)))
    const before = fixture.firstSocket.sent.length

    for (const method of [
      'workspace/configuration',
      'workspace/workspaceFolders',
      'client/registerCapability',
      'window/workDoneProgress/create',
      'workspace/semanticTokens/refresh',
      'window/showMessageRequest',
    ]) {
      fixture.respond({ id: `server-${method}`, jsonrpc: '2.0', method, params: {} })
    }
    await fixture.waitForServerMessageCount(2)

    // Every one of them is answered by the proxy. Anything that reached a
    // browser carrying an `id` would draw a response the proxy forwards to the
    // backend verbatim, with a client-space id the backend never issued.
    const withIds = fixture.firstSocket.sent.slice(before).filter((message) => 'id' in message)
    expect(withIds).toEqual([])
  })
})

describe('LspSessionPool semantic token delta', () => {
  const DELTA_CAPABLE = {
    capabilities: {
      semanticTokensProvider: {
        full: { delta: true },
        legend: { tokenModifiers: [], tokenTypes: ['variable'] },
        range: true,
      },
    },
  }

  async function deltaFixture() {
    const fixture = await lspFixture()
    fixture.delta.enabled = true
    const first = await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')
    const second = await fixture.pool.acquire(fixture.secondSocket, fixture.match, '')
    if (!first || !second) throw new Error('expected pooled LSP sessions')

    const initialize = first.handleClientMessage(json(initializeRequest(1)))
    await fixture.waitForServerMessageCount(1)
    fixture.respond({ id: fixture.serverMessages[0].id, jsonrpc: '2.0', result: DELTA_CAPABLE })
    await initialize
    await second.handleClientMessage(json(initializeRequest(2)))
    // Ten lines, because the reassembled streams below address line 1 and up:
    // the proxy refuses a token stream that walks past the last line, and a
    // one-line fixture would trip that check rather than the branch under test.
    await first.handleClientMessage(json(didOpen(URI, DOCUMENT_TEXT)))
    // Both tabs own the document, which is what a tab asking for its tokens
    // always is: the request comes from a view that has the file open. A waiter
    // that never opened it would be released the moment the *other* tab closed,
    // because the document would have no owners left.
    await second.handleClientMessage(json(didOpen(URI, DOCUMENT_TEXT)))

    return { ...fixture, first, second }
  }

  const URI = 'file:///repo/a.ts'
  const DOCUMENT_TEXT = Array.from(
    { length: 10 },
    (_, line) => `const value${line} = ${line}`,
  ).join('\n')
  const tokensRequest = (id: number) => ({
    id,
    jsonrpc: '2.0',
    method: 'textDocument/semanticTokens/full',
    params: { textDocument: { uri: URI } },
  })
  const lastServerRequest = (fixture: Awaited<ReturnType<typeof deltaFixture>>) =>
    fixture.serverMessages
      .filter(
        (message) =>
          typeof message.method === 'string' &&
          (message.method as string).startsWith('textDocument/semanticTokens'),
      )
      .at(-1)

  it('asks for a whole file first, and a delta once it holds a baseline', async () => {
    const fixture = await deltaFixture()

    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    const first = lastServerRequest(fixture)
    expect(first?.method).toBe('textDocument/semanticTokens/full')
    fixture.respond({
      id: first?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 5, 0, 0, 1, 0, 3, 0, 0], resultId: 'r1' },
    })

    await fixture.first.handleClientMessage(json(tokensRequest(11)))
    const second = lastServerRequest(fixture)

    expect(second?.method).toBe('textDocument/semanticTokens/full/delta')
    expect(second?.params).toMatchObject({ previousResultId: 'r1' })
  })

  it('reassembles a delta into the whole array the client expects', async () => {
    const fixture = await deltaFixture()
    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 5, 0, 0, 1, 0, 3, 0, 0], resultId: 'r1' },
    })

    await fixture.first.handleClientMessage(json(tokensRequest(11)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      // Replace the second tuple's length, the way a real edit reads.
      result: { edits: [{ data: [7], deleteCount: 1, start: 7 }], resultId: 'r2' },
    })

    expect(fixture.firstSocket.sent.at(-1)).toMatchObject({
      id: 11,
      result: { data: [0, 0, 5, 0, 0, 1, 0, 7, 0, 0], resultId: 'r2' },
    })
  })

  it('never lets a delta reach the browser', async () => {
    const fixture = await deltaFixture()
    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 5, 0, 0], resultId: 'r1' },
    })
    await fixture.first.handleClientMessage(json(tokensRequest(11)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      result: { edits: [{ data: [0, 0, 9, 0, 0], deleteCount: 5, start: 0 }], resultId: 'r2' },
    })

    // The transport boundary, asserted rather than reasoned about: nothing the
    // browser ever receives carries `edits`, and nothing it ever sends is a
    // `full/delta`.
    for (const sent of fixture.firstSocket.sent) {
      expect(JSON.stringify(sent)).not.toContain('"edits"')
      expect(JSON.stringify(sent)).not.toContain('full/delta')
    }
  })

  it('drops the baseline and retries once when the server refuses the resultId', async () => {
    const fixture = await deltaFixture()
    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 5, 0, 0], resultId: 'r1' },
    })

    await fixture.first.handleClientMessage(json(tokensRequest(11)))
    const deltaAsk = lastServerRequest(fixture)
    expect(deltaAsk?.method).toBe('textDocument/semanticTokens/full/delta')
    fixture.respond({
      error: { code: -32602, message: 'unknown previousResultId' },
      id: deltaAsk?.id,
      jsonrpc: '2.0',
    })

    // Retried as a plain `full`, not surfaced to the client as an error.
    const retry = lastServerRequest(fixture)
    expect(retry?.method).toBe('textDocument/semanticTokens/full')
    fixture.respond({
      id: retry?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 8, 0, 0], resultId: 'r2' },
    })

    expect(fixture.firstSocket.sent.at(-1)).toMatchObject({
      id: 11,
      result: { data: [0, 0, 8, 0, 0] },
    })
  })

  it('asks the backend once when two tabs want the same file at the same time', async () => {
    const fixture = await deltaFixture()
    const before = fixture.serverMessages.length

    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    await fixture.second.handleClientMessage(json(tokensRequest(20)))

    const asks = fixture.serverMessages
      .slice(before)
      .filter((message) => String(message.method).startsWith('textDocument/semanticTokens'))
    expect(asks).toHaveLength(1)

    fixture.respond({
      id: asks[0]?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 4, 0, 0], resultId: 'r1' },
    })

    // Both clients get the same answer, each under its own request id.
    expect(fixture.firstSocket.sent.at(-1)).toMatchObject({
      id: 10,
      result: { data: [0, 0, 4, 0, 0] },
    })
    expect(fixture.secondSocket.sent.at(-1)).toMatchObject({
      id: 20,
      result: { data: [0, 0, 4, 0, 0] },
    })
  })

  it('refuses a reassembled array that walks off the end of the document', async () => {
    const fixture = await deltaFixture()
    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 5, 0, 0], resultId: 'r1' },
    })

    await fixture.first.handleClientMessage(json(tokensRequest(11)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      // The document is one line. A tuple claiming line 40 describes text that is
      // not there, which is what a mis-spliced array looks like.
      result: { edits: [{ data: [40, 0, 5, 0, 0], deleteCount: 5, start: 0 }], resultId: 'r2' },
    })

    // Refused and retried as a whole file rather than answered. Painting spans
    // that match no version of the text is the one outcome worth any cost to
    // avoid.
    expect(lastServerRequest(fixture)?.method).toBe('textDocument/semanticTokens/full')
  })

  /**
   * The normal path while typing, not an exception: the browser cancels its
   * in-flight token request on every keystroke. Treating that as a rejected
   * baseline threw a good one away each time, counted it against the server, and
   * re-issued a whole-file request the client had just told us to abandon.
   */
  it('does not mistake a cancelled request for a rejected baseline', async () => {
    const fixture = await deltaFixture()
    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 5, 0, 0], resultId: 'r1' },
    })

    await fixture.first.handleClientMessage(json(tokensRequest(11)))
    const cancelled = lastServerRequest(fixture)
    expect(cancelled?.method).toBe('textDocument/semanticTokens/full/delta')
    await fixture.first.handleClientMessage(
      json({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id: 11 } }),
    )
    fixture.respond({
      error: { code: -32800, message: 'request cancelled' },
      id: cancelled?.id,
      jsonrpc: '2.0',
    })

    // No retry was issued for a request the client abandoned...
    expect(lastServerRequest(fixture)?.id).toBe(cancelled?.id)

    // ...and the baseline survived, so the next ask is still a delta.
    await fixture.first.handleClientMessage(json(tokensRequest(12)))
    expect(lastServerRequest(fixture)?.method).toBe('textDocument/semanticTokens/full/delta')
    expect(lastServerRequest(fixture)?.params).toMatchObject({ previousResultId: 'r1' })
  })

  it('passes a content-modified error through without touching the baseline', async () => {
    const fixture = await deltaFixture()
    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 5, 0, 0], resultId: 'r1' },
    })

    await fixture.first.handleClientMessage(json(tokensRequest(11)))
    fixture.respond({
      error: { code: -32801, message: 'content modified' },
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
    })

    // The client is told what happened rather than being left waiting.
    expect(fixture.firstSocket.sent.at(-1)).toMatchObject({ id: 11, error: { code: -32801 } })

    await fixture.first.handleClientMessage(json(tokensRequest(12)))
    expect(lastServerRequest(fixture)?.method).toBe('textDocument/semanticTokens/full/delta')
  })

  it('cancels the shared request only when the last waiter gives up', async () => {
    const fixture = await deltaFixture()
    const before = fixture.serverMessages.length
    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    await fixture.second.handleClientMessage(json(tokensRequest(20)))
    const ask = fixture.serverMessages
      .slice(before)
      .filter((message) => String(message.method).startsWith('textDocument/semanticTokens'))[0]

    // One of two waiters cancels. The backend must keep working for the other.
    await fixture.first.handleClientMessage(
      json({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id: 10 } }),
    )
    expect(
      fixture.serverMessages.filter((message) => message.method === '$/cancelRequest'),
    ).toHaveLength(0)

    fixture.respond({
      id: ask?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 4, 0, 0], resultId: 'r1' },
    })
    expect(fixture.secondSocket.sent.at(-1)).toMatchObject({
      id: 20,
      result: { data: [0, 0, 4, 0, 0] },
    })
  })

  it('starts a fresh request rather than coalescing across an edit', async () => {
    const fixture = await deltaFixture()
    const before = fixture.serverMessages.length
    await fixture.first.handleClientMessage(json(tokensRequest(10)))

    // The text moves while the first request is in flight, so the answer to it
    // describes a version the second asker never saw.
    await fixture.first.handleClientMessage(
      json({
        jsonrpc: '2.0',
        method: 'textDocument/didChange',
        params: {
          contentChanges: [{ text: `${DOCUMENT_TEXT}\nconst added = 1` }],
          textDocument: { uri: URI, version: 2 },
        },
      }),
    )
    await fixture.second.handleClientMessage(json(tokensRequest(20)))

    const asks = fixture.serverMessages
      .slice(before)
      .filter((message) => String(message.method).startsWith('textDocument/semanticTokens'))
    expect(asks).toHaveLength(2)
  })

  /**
   * Two token requests for one uri really can overlap: an edit while one is in
   * flight starts a second rather than coalescing onto an answer about replaced
   * text. So the second can land first and move the baseline out from under the
   * first — and splicing edits into an array the server never diffed against
   * produces a token stream describing no version of anything.
   */
  it('refuses a delta computed against a baseline it no longer holds', async () => {
    const fixture = await deltaFixture()
    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 5, 0, 0], resultId: 'r1' },
    })

    // Request A goes out as a delta against r1.
    await fixture.first.handleClientMessage(json(tokensRequest(11)))
    const requestA = lastServerRequest(fixture)
    expect(requestA?.method).toBe('textDocument/semanticTokens/full/delta')

    // The text moves, so the next ask starts request B instead of coalescing.
    await fixture.first.handleClientMessage(
      json({
        jsonrpc: '2.0',
        method: 'textDocument/didChange',
        params: {
          contentChanges: [{ text: `${DOCUMENT_TEXT}\nconst added = 1` }],
          textDocument: { uri: URI, version: 2 },
        },
      }),
    )
    await fixture.second.handleClientMessage(json(tokensRequest(20)))
    const requestB = lastServerRequest(fixture)
    expect(requestB?.id).not.toBe(requestA?.id)

    // B lands first and replaces the baseline.
    fixture.respond({
      id: requestB?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 9, 0, 0], resultId: 'r2' },
    })

    // Now A's delta arrives, computed against r1, which is gone.
    fixture.respond({
      id: requestA?.id,
      jsonrpc: '2.0',
      result: { edits: [{ data: [7], deleteCount: 1, start: 2 }], resultId: 'r3' },
    })

    // Refused and re-asked as a whole file, rather than spliced into r2.
    expect(lastServerRequest(fixture)?.method).toBe('textDocument/semanticTokens/full')
  })

  it('refuses edits whose bounds only fit after an earlier edit grew the array', async () => {
    const fixture = await deltaFixture()
    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 5, 0, 0, 1, 0, 3, 0, 0], resultId: 'r1' },
    })

    await fixture.first.handleClientMessage(json(tokensRequest(11)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      result: {
        // Every offset indexes the baseline, which is 10 long. The second edit
        // reaches past it and only "fits" if the first one's growth is counted.
        edits: [
          { data: [0, 0, 1, 0, 0, 0, 0, 2, 0, 0], deleteCount: 0, start: 5 },
          { data: [], deleteCount: 8, start: 6 },
        ],
        resultId: 'r2',
      },
    })

    expect(lastServerRequest(fixture)?.method).toBe('textDocument/semanticTokens/full')
  })

  it('keeps the baseline while another tab still has the document open', async () => {
    const fixture = await deltaFixture()
    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 5, 0, 0], resultId: 'r1' },
    })

    // One of two owners leaves. The backend still has the document, so its own
    // token cache is still valid and so is ours.
    await fixture.first.handleClientMessage(json(didClose(URI)))
    await fixture.second.handleClientMessage(json(tokensRequest(21)))

    expect(lastServerRequest(fixture)?.method).toBe('textDocument/semanticTokens/full/delta')
  })

  it('keeps answering the other tabs when one waiting tab closes', async () => {
    const fixture = await deltaFixture()
    const before = fixture.serverMessages.length
    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    await fixture.second.handleClientMessage(json(tokensRequest(20)))
    const ask = fixture.serverMessages
      .slice(before)
      .filter((message) => String(message.method).startsWith('textDocument/semanticTokens'))[0]

    // The tab that asked *first* goes away while the shared request is in flight.
    fixture.first.dispose()
    fixture.respond({
      id: ask?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 6, 0, 0], resultId: 'r1' },
    })

    // The one still open must still get its answer.
    expect(fixture.secondSocket.sent.at(-1)).toMatchObject({
      id: 20,
      result: { data: [0, 0, 6, 0, 0] },
    })
    expect(
      fixture.serverMessages.filter((message) => message.method === '$/cancelRequest'),
    ).toHaveLength(0)
  })

  it('sends no delta at all while the setting is off', async () => {
    const fixture = await deltaFixture()
    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 5, 0, 0], resultId: 'r1' },
    })

    fixture.delta.enabled = false
    await fixture.first.handleClientMessage(json(tokensRequest(11)))

    expect(lastServerRequest(fixture)?.method).toBe('textDocument/semanticTokens/full')
  })

  it('forgets the baseline when the last owner closes the document', async () => {
    const fixture = await deltaFixture()
    await fixture.first.handleClientMessage(json(tokensRequest(10)))
    fixture.respond({
      id: lastServerRequest(fixture)?.id,
      jsonrpc: '2.0',
      result: { data: [0, 0, 5, 0, 0], resultId: 'r1' },
    })

    // Both owners, or the document survives and the baseline rightly survives
    // with it — the backend only forgets the document when the last one leaves.
    await fixture.first.handleClientMessage(json(didClose(URI)))
    await fixture.second.handleClientMessage(json(didClose(URI)))
    await fixture.first.handleClientMessage(json(didOpen(URI, DOCUMENT_TEXT)))
    await fixture.first.handleClientMessage(json(tokensRequest(12)))

    // The server's own cache died with the `didClose`, so a `previousResultId`
    // from before it is a baseline nothing can diff against.
    expect(lastServerRequest(fixture)?.method).toBe('textDocument/semanticTokens/full')
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

async function initializedFixture(server: Partial<LspServerMatch['server']> = {}) {
  const fixture = await lspFixture(server)
  const first = await fixture.pool.acquire(fixture.firstSocket, fixture.match, '')
  const second = await fixture.pool.acquire(fixture.secondSocket, fixture.match, '')
  if (!first || !second) throw new Error('expected pooled LSP sessions')

  const initialize = first.handleClientMessage(json(initializeRequest(1)))
  await fixture.waitForServerMessageCount(1)
  fixture.respond({ id: fixture.serverMessages[0].id, jsonrpc: '2.0', result: initializeResult() })
  await initialize

  return { ...fixture, first, second }
}

async function lspFixture(server: Partial<LspServerMatch['server']> = {}) {
  const root = await fixtureRoot('platform-lsp-pool-')
  // A flag the test flips rather than a setter on the pool: `deltaEnabled` is a
  // getter in production precisely so a settings write takes effect without a
  // restart, and reading it per request is the behaviour worth exercising.
  const delta = { enabled: false }
  const pool = new LspSessionPool(undefined, () => delta.enabled)
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
      ...server,
    },
  } satisfies LspServerMatch

  return {
    delta,
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
