import type { LspClient, LspWorkspace } from '@singapor/lsp'
import type {
  LspConnectionCallbacks,
  LspConnectionProvider,
  LanguageServerLaneOptions,
} from '@singapor/lsp-plugin'
import { vi } from 'vitest'

import { createDiffLanguageSession } from '@/features/editor/state/diff-language-session'
import { expect, test } from '../../../../../test/fixtures'

test('awaits the existing lane lease before opening documents or sending requests', async () => {
  const harness = laneHarness()
  const session = createDiffLanguageSession({ documents: documents(), lane: harness.options })

  const request = session.request<string>('textDocument/hover', { position: 1 })
  expect(harness.openDocument).not.toHaveBeenCalled()
  expect(harness.request).not.toHaveBeenCalled()

  harness.connect()
  await expect(request).resolves.toBe('answer')
  expect(harness.openDocument).toHaveBeenCalledTimes(2)
  expect(harness.request).toHaveBeenCalledWith(
    'textDocument/hover',
    { position: 1 },
    { signal: expect.any(AbortSignal) },
  )
})

test('closes only diff-owned documents and releases its dedicated lease', async () => {
  const harness = laneHarness()
  const session = createDiffLanguageSession({ documents: documents(), lane: harness.options })
  const request = session.request('textDocument/definition', {})
  harness.connect()
  await request

  session.dispose()

  expect(harness.closeDocument.mock.calls.map(([uri]) => uri)).toEqual([
    'file:///repo/file.ts',
    'file:///repo/file.ts.diff-old',
  ])
  expect(harness.release).toHaveBeenCalledTimes(1)
})

test('rejects an in-flight response after the session is disposed', async () => {
  const answer = deferred<string>()
  const harness = laneHarness(() => answer.promise)
  const session = createDiffLanguageSession({ documents: documents(), lane: harness.options })
  const request = session.request<string>('textDocument/hover', {})
  harness.connect()
  await vi.waitFor(() => expect(harness.request).toHaveBeenCalledTimes(1))

  session.dispose()
  answer.resolve('late answer')

  await expect(request).rejects.toThrow('Diff language session closed')
})

function laneHarness(requestResult: () => Promise<unknown> = async () => 'answer') {
  let callbacks: LspConnectionCallbacks | null = null
  const openDocument = vi.fn((document: { uri: string }) => ({ ...document, version: 1 }))
  const closeDocument = vi.fn()
  const request = vi.fn(requestResult)
  const release = vi.fn()
  const client = {
    notify: vi.fn(async () => undefined),
    request,
    serverCapabilities: { hoverProvider: true },
  } as unknown as LspClient
  const workspace = { closeDocument, openDocument } as unknown as LspWorkspace
  const connection = { client, workspace }
  const provider: LspConnectionProvider = {
    acquire: (_options, connectionCallbacks) => {
      callbacks = connectionCallbacks
      return { connection: connection as never, release }
    },
  }
  const options: LanguageServerLaneOptions = {
    connectionProvider: provider,
    features: { hover: 0, navigation: 0 },
    id: 'typescript',
    webSocketRoute: 'ws://localhost/lsp',
  }

  return {
    closeDocument,
    openDocument,
    options,
    release,
    request,
    connect: () => callbacks?.onConnected(),
  }
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function documents() {
  return [
    {
      languageId: 'typescript',
      sharesRealUri: true,
      side: 'new' as const,
      text: 'new',
      uri: 'file:///repo/file.ts',
    },
    {
      languageId: 'typescript',
      sharesRealUri: false,
      side: 'old' as const,
      text: 'old',
      uri: 'file:///repo/file.ts.diff-old',
    },
  ]
}
