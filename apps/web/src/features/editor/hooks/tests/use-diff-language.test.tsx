import type { LspManagedTransport, LspTransportHandler } from '@singapor/lsp'
import type { LspConnectionCallbacks, LspConnectionOptions } from '@singapor/lsp-plugin'
import { afterEach } from 'vitest'

import { highestRankedDiffMatch } from '@/features/editor/hooks/use-diff-language'
import {
  diffLanguageServerConnectionProvider,
  languageServerConnectionProvider,
  resetLanguageServerConnectionPool,
} from '@/features/editor/state/language-server-connection-pool'
import type { LanguageServerMatch } from '@/features/editor/utils/language-server-plugin'
import { expect, test } from '../../../../../test/fixtures'

afterEach(resetLanguageServerConnectionPool)

test('selects one highest-ranked server eligible for hover and navigation', () => {
  const matches = [
    match('hover-only', { hover: 0 }),
    match('fallback', { hover: 5, navigation: 5 }),
    match('preferred', { hover: 1, navigation: 3 }),
  ]

  expect(highestRankedDiffMatch(matches)?.serverId).toBe('preferred')
})

test('uses declared collection order to break equal role ranks', () => {
  const matches = [
    match('first', { hover: 1, navigation: 1 }),
    match('second', { hover: 1, navigation: 1 }),
  ]

  expect(highestRankedDiffMatch(matches)?.serverId).toBe('first')
  expect(highestRankedDiffMatch(null)).toBeNull()
})

test('gives every diff a browser owner while retaining one backend route', () => {
  resetLanguageServerConnectionPool()
  const createdRoutes: string[] = []
  const route = 'ws://localhost/lsp?root=/repo&path=src/file.ts&server=typescript'
  const options: LspConnectionOptions = {
    createTransport: () => {
      createdRoutes.push(route)
      return new InertTransport()
    },
    initializationOptions: undefined,
    rootUri: 'file:///repo',
    timeoutMs: 15_000,
  }
  const callbacks: LspConnectionCallbacks = {
    onConnected: () => undefined,
    onPublishDiagnostics: () => undefined,
    onUnavailable: () => undefined,
  }
  const key = { rootPath: '/repo', serverId: 'typescript' }
  const leases = [
    languageServerConnectionProvider(key).acquire(options, callbacks),
    languageServerConnectionProvider(key).acquire(options, callbacks),
    diffLanguageServerConnectionProvider({ ...key, sessionId: 'first' }).acquire(
      options,
      callbacks,
    ),
    diffLanguageServerConnectionProvider({ ...key, sessionId: 'second' }).acquire(
      options,
      callbacks,
    ),
  ]

  expect(createdRoutes).toEqual([route, route, route])

  for (const lease of leases) lease.release()
})

function match(serverId: string, features: LanguageServerMatch['features']): LanguageServerMatch {
  return { features, root: '/repo', serverId }
}

class InertTransport implements LspManagedTransport {
  readonly #handlers = new Set<LspTransportHandler>()

  send(): void {}

  subscribe(handler: LspTransportHandler): void {
    this.#handlers.add(handler)
  }

  unsubscribe(handler: LspTransportHandler): void {
    this.#handlers.delete(handler)
  }

  close(): void {
    this.#handlers.clear()
  }
}
