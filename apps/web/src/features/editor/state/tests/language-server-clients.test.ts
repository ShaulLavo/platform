import { afterEach, describe, expect, it } from 'vitest'

import {
  languageServerClientFor,
  registerLanguageServerClient,
  resetLanguageServerClients,
} from '@/features/editor/state/language-server-clients'
import type { LspClient } from '@singapor/lsp'

// A read-only surface borrows a connection an editor already owns. What it must never do is treat
// "there is a connection" as "the server holds this file" — those are different questions and the
// second one is what makes an answer true.

afterEach(() => resetLanguageServerClients())

describe('languageServerClientFor', () => {
  it('reports ownership when the editor holding that path registered it', () => {
    const client = fakeClient()
    registerLanguageServerClient('/repo', '/repo/a.ts', client)

    expect(languageServerClientFor('/repo', '/repo/a.ts')).toEqual({ client, ownsFile: true })
  })

  it('offers a connection for a sibling file, but does not claim ownership of it', () => {
    // The distinction the whole design rests on: the connection can carry a request about any URI,
    // and only an owner's text is what the server actually holds for it.
    const client = fakeClient()
    registerLanguageServerClient('/repo', '/repo/a.ts', client)

    expect(languageServerClientFor('/repo', '/repo/b.ts')).toEqual({ client, ownsFile: false })
  })

  it('has nothing to offer under a root with no editors', () => {
    registerLanguageServerClient('/repo', '/repo/a.ts', fakeClient())

    expect(languageServerClientFor('/other', '/other/a.ts')).toBeNull()
  })

  it('forgets an editor when it goes away', () => {
    const dispose = registerLanguageServerClient('/repo', '/repo/a.ts', fakeClient())

    dispose()

    expect(languageServerClientFor('/repo', '/repo/a.ts')).toBeNull()
  })

  it('lets a replacement editor survive the previous one unregistering', () => {
    // React remounts a component before tearing the old one down, so the disposals arrive out of
    // order. A retraction that fired blindly would take the live connection with it.
    const first = registerLanguageServerClient('/repo', '/repo/a.ts', fakeClient())
    const second = fakeClient()
    registerLanguageServerClient('/repo', '/repo/a.ts', second)

    first()

    expect(languageServerClientFor('/repo', '/repo/a.ts')).toEqual({
      client: second,
      ownsFile: true,
    })
  })
})

function fakeClient(): LspClient {
  return { request: async () => null } as unknown as LspClient
}
