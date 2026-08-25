import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MONO_FONT_STACK,
  DEFAULT_MONO_FONT_VARIABLE,
  DEFAULT_NERD_FONT_FAMILY,
  fontStack,
  loadDefaultNerdFont,
  loadNerdFont,
} from '../default-nerd-font'

describe('loadDefaultNerdFont', () => {
  it('loads JetBrainsMono from the server and registers the FontFace', async () => {
    const state = fontLoaderState()
    const result = await loadDefaultNerdFont({
      FontFace: state.FontFace,
      fetcher: state.fetcher,
      fonts: state.fonts,
      root: state.root,
      url: 'http://server.test/fonts/JetBrainsMono',
    })

    expect(result).toBe(true)
    expect(state.variables.get(DEFAULT_MONO_FONT_VARIABLE)).toBe(DEFAULT_MONO_FONT_STACK)
    expect(state.requests).toEqual(['http://server.test/fonts/JetBrainsMono'])
    expect(state.added).toHaveLength(1)
    expect(state.instances[0]?.family).toBe(DEFAULT_NERD_FONT_FAMILY)
    expect(state.instances[0]?.loaded).toBe(true)
  })

  it('keeps the fallback stack when the server request fails', async () => {
    const state = fontLoaderState({
      fetcher: (async () => new Response('missing', { status: 404 })) as unknown as typeof fetch,
    })

    const result = await loadDefaultNerdFont({
      FontFace: state.FontFace,
      fetcher: state.fetcher,
      fonts: state.fonts,
      root: state.root,
      url: 'http://server.test/fonts/JetBrainsMono',
    })

    expect(result).toBe(false)
    expect(state.variables.get(DEFAULT_MONO_FONT_VARIABLE)).toBe(DEFAULT_MONO_FONT_STACK)
    expect(state.added).toHaveLength(0)
  })

  it('does not throw when font loading is unsupported', async () => {
    const state = fontLoaderState()
    const result = await loadDefaultNerdFont({
      FontFace: null,
      fetcher: state.fetcher,
      fonts: null,
      root: state.root,
    })

    expect(result).toBe(false)
    expect(state.requests).toHaveLength(0)
    expect(state.variables.get(DEFAULT_MONO_FONT_VARIABLE)).toBe(DEFAULT_MONO_FONT_STACK)
  })

  it('does not let an older font request overwrite a newer stack', async () => {
    const olderResponse = deferred<Response>()
    const newerResponse = deferred<Response>()
    const state = fontLoaderState({
      fetcher: (async (input) => {
        if (String(input).endsWith('/Older')) return olderResponse.promise

        return newerResponse.promise
      }) as typeof fetch,
    })
    const older = loadNerdFont('Older', {
      FontFace: state.FontFace,
      fetcher: state.fetcher,
      fonts: state.fonts,
      root: state.root,
      url: 'http://server.test/fonts/Older',
    })
    const newer = loadNerdFont('Newer', {
      FontFace: state.FontFace,
      fetcher: state.fetcher,
      fonts: state.fonts,
      root: state.root,
      url: 'http://server.test/fonts/Newer',
    })

    newerResponse.resolve(successfulResponse())
    await newer
    olderResponse.resolve(successfulResponse())
    await older

    expect(state.variables.get(DEFAULT_MONO_FONT_VARIABLE)).toBe(fontStack('Newer'))
  })
})

type FakeFontFace = {
  family: string
  loaded: boolean
  load(): Promise<FontFace>
}

function fontLoaderState(options: { fetcher?: typeof fetch } = {}) {
  const variables = new Map<string, string>()
  const requests: string[] = []
  const added: FontFace[] = []
  const instances: FakeFontFace[] = []

  class TestFontFace implements FakeFontFace {
    loaded = false

    constructor(
      readonly family: string,
      readonly source: string | BufferSource,
      readonly descriptors?: FontFaceDescriptors,
    ) {
      void source
      void descriptors
      instances.push(this)
    }

    async load() {
      this.loaded = true
      return this as unknown as FontFace
    }
  }

  return {
    FontFace: TestFontFace as unknown as typeof FontFace,
    added,
    fetcher: options.fetcher ?? successfulFontFetch(requests),
    fonts: {
      add(fontFace: FontFace) {
        added.push(fontFace)
      },
    },
    instances,
    requests,
    root: {
      style: {
        getPropertyValue(name: string) {
          return variables.get(name) ?? ''
        },
        setProperty(name: string, value: string) {
          variables.set(name, value)
        },
      },
    },
    variables,
  }
}

function successfulFontFetch(requests: string[]): typeof fetch {
  return (async (input) => {
    requests.push(String(input))
    return new Response(new Uint8Array([1, 2, 3]).buffer)
  }) as typeof fetch
}

function successfulResponse() {
  return new Response(new Uint8Array([1, 2, 3]).buffer)
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })

  return { promise, resolve }
}
