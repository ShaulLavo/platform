import { describe, expect, it } from 'bun:test'
import type { WorkspaceSearchEvent, WorkspaceSearchQuery } from '@workspace/contracts'

import {
  CompositeSearchProvider,
  DiskSearchProvider,
  OpenBufferSearchProvider,
  type SearchProvider,
} from './search-providers'

const QUERY: WorkspaceSearchQuery = {
  entryType: 'file',
  includeContent: true,
  limit: 20,
  path: 'repo',
  query: 'needle',
}

describe('open buffer search provider', () => {
  it('emits content matches from dirty editor text', async () => {
    const provider = new OpenBufferSearchProvider([
      {
        path: 'repo/src/app.ts',
        text: 'first\nconst needle = true',
      },
    ])

    const events = await collectEvents(provider.search(QUERY))

    expect(events).toContainEqual({
      match: expect.objectContaining({
        column: 7,
        endColumn: 13,
        line: 2,
        path: 'repo/src/app.ts',
        source: 'open-buffer',
      }),
      type: 'match',
    })
    expect(events.at(-1)).toMatchObject({ count: 1, type: 'done' })
  })

  it('emits every dirty editor match with exact ranges', async () => {
    const provider = new OpenBufferSearchProvider([
      {
        path: 'repo/src/app.ts',
        text: 'needle and needle',
      },
    ])

    const matches = (await collectEvents(provider.search(QUERY))).filter(
      (event) => event.type === 'match',
    )

    expect(matches).toEqual([
      {
        match: expect.objectContaining({
          column: 1,
          endColumn: 7,
          source: 'open-buffer',
        }),
        type: 'match',
      },
      {
        match: expect.objectContaining({
          column: 12,
          endColumn: 18,
          source: 'open-buffer',
        }),
        type: 'match',
      },
    ])
  })

  it('treats query spaces as part of the dirty editor search text', async () => {
    const provider = new OpenBufferSearchProvider([
      {
        path: 'repo/src/app.ts',
        text: 'needle here\nneedle  here',
      },
    ])

    const matches = await contentEvents(provider.search({ ...QUERY, query: 'needle  ' }))

    expect(matches).toEqual([
      expect.objectContaining({
        column: 1,
        endColumn: 9,
        line: 2,
        source: 'open-buffer',
      }),
    ])
  })

  it('keeps dirty long-line previews anchored around the match', async () => {
    const provider = new OpenBufferSearchProvider([
      {
        path: 'repo/src/app.ts',
        text: `${'x'.repeat(320)}needle`,
      },
    ])

    const events = await collectEvents(provider.search(QUERY))

    expect(events).toContainEqual({
      match: expect.objectContaining({
        column: 321,
        endColumn: 327,
        preview: expect.stringContaining('needle'),
        previewStartColumn: expect.any(Number),
      }),
      type: 'match',
    })
  })

  it('matches dirty editor text with case, regex, and whole-word options', async () => {
    const provider = new OpenBufferSearchProvider([
      {
        path: 'repo/src/app.ts',
        text: 'needle Needle needleness',
      },
    ])

    const caseMatches = await contentEvents(
      provider.search({ ...QUERY, caseSensitive: true, query: 'Needle' }),
    )
    const regexMatches = await contentEvents(
      provider.search({
        ...QUERY,
        caseSensitive: true,
        matchMode: 'regex',
        query: 'Need\\w+',
      }),
    )
    const wholeWordMatches = await contentEvents(
      provider.search({ ...QUERY, query: 'needle', wholeWord: true }),
    )

    expect(caseMatches).toEqual([expect.objectContaining({ column: 8, endColumn: 14 })])
    expect(regexMatches).toEqual([expect.objectContaining({ column: 8, endColumn: 14 })])
    expect(wholeWordMatches).toEqual([
      expect.objectContaining({ column: 1, endColumn: 7 }),
      expect.objectContaining({ column: 8, endColumn: 14 }),
    ])
  })

  it('filters dirty editor matches with include and exclude globs', async () => {
    const provider = new OpenBufferSearchProvider([
      {
        path: 'repo/src/app.ts',
        text: 'needle',
      },
      {
        path: 'repo/src/app.test.ts',
        text: 'needle',
      },
      {
        path: 'repo/docs/app.ts',
        text: 'needle',
      },
    ])

    const matches = await contentEvents(
      provider.search({
        ...QUERY,
        excludeGlobs: ['*.test.ts'],
        includeGlobs: ['src/*.ts'],
      }),
    )

    expect(matches).toEqual([expect.objectContaining({ path: 'repo/src/app.ts' })])
  })

  it('emits dirty editor matches in stable path order', async () => {
    const provider = new OpenBufferSearchProvider([
      {
        path: 'repo/src/file-10.ts',
        text: 'needle',
      },
      {
        path: 'repo/src/file-2.ts',
        text: 'needle',
      },
    ])

    const matches = await contentEvents(provider.search(QUERY))

    expect(matches.map((match) => match.path)).toEqual([
      'repo/src/file-2.ts',
      'repo/src/file-10.ts',
    ])
  })
})

describe('disk search provider', () => {
  it('passes includeNames to the streaming search endpoint', async () => {
    const restoreFetch = stubFetchWithSseDone()
    const provider = new DiskSearchProvider()

    try {
      await collectEvents(provider.search({ ...QUERY, includeNames: false }))
      expect(lastFetchUrl()?.searchParams.get('includeNames')).toBe('false')
    } finally {
      restoreFetch()
    }
  })

  it('passes search mode options to the streaming search endpoint', async () => {
    const restoreFetch = stubFetchWithSseDone()
    const provider = new DiskSearchProvider()

    try {
      await collectEvents(
        provider.search({
          ...QUERY,
          caseSensitive: true,
          excludeGlobs: ['*.test.ts'],
          includeGlobs: ['src/**/*.ts'],
          matchMode: 'regex',
          wholeWord: true,
        }),
      )
      const params = lastFetchUrl()?.searchParams

      expect(params?.get('caseSensitive')).toBe('true')
      expect(params?.get('matchMode')).toBe('regex')
      expect(params?.get('wholeWord')).toBe('true')
      expect(params?.getAll('includeGlobs')).toEqual(['src/**/*.ts'])
      expect(params?.getAll('excludeGlobs')).toEqual(['*.test.ts'])
    } finally {
      restoreFetch()
    }
  })

  it('passes query whitespace to the streaming search endpoint', async () => {
    const restoreFetch = stubFetchWithSseDone()
    const provider = new DiskSearchProvider()

    try {
      await collectEvents(provider.search({ ...QUERY, query: ' needle ' }))

      expect(lastFetchUrl()?.searchParams.get('query')).toBe(' needle ')
    } finally {
      restoreFetch()
    }
  })
})

describe('composite search provider', () => {
  it('suppresses disk content matches for dirty paths while keeping filenames', async () => {
    const disk = new StaticSearchProvider([
      {
        match: {
          kind: 'content',
          path: 'repo/src/app.ts',
          source: 'disk',
          type: 'file',
        },
        type: 'match',
      },
      {
        match: {
          kind: 'name',
          path: 'repo/src/app.ts',
          source: 'disk',
          type: 'file',
        },
        type: 'match',
      },
      {
        count: 2,
        path: 'repo',
        query: 'needle',
        truncated: false,
        type: 'done',
      },
    ])
    const provider = new CompositeSearchProvider({
      disk,
      openBufferPaths: new Set(['repo/src/app.ts']),
      openBuffers: new OpenBufferSearchProvider([
        {
          path: 'repo/src/app.ts',
          text: 'needle from dirty editor',
        },
      ]),
    })

    const matches = (await collectEvents(provider.search(QUERY))).filter(
      (event) => event.type === 'match',
    )

    expect(matches).toEqual([
      {
        match: expect.objectContaining({ source: 'open-buffer' }),
        type: 'match',
      },
      {
        match: expect.objectContaining({ kind: 'name', source: 'disk' }),
        type: 'match',
      },
    ])
  })

  it('does not count suppressed dirty disk matches against the composite limit', async () => {
    const disk = new QueryLimitedSearchProvider([
      {
        match: {
          kind: 'content',
          path: 'repo/src/dirty.ts',
          source: 'disk',
          type: 'file',
        },
        type: 'match',
      },
      {
        match: {
          kind: 'content',
          path: 'repo/src/other.ts',
          source: 'disk',
          type: 'file',
        },
        type: 'match',
      },
      {
        count: 2,
        path: 'repo',
        query: 'needle',
        truncated: false,
        type: 'done',
      },
    ])
    const provider = new CompositeSearchProvider({
      disk,
      openBufferPaths: new Set(['repo/src/dirty.ts']),
      openBuffers: new OpenBufferSearchProvider([
        {
          path: 'repo/src/dirty.ts',
          text: 'needle from dirty editor',
        },
      ]),
    })

    const events = await collectEvents(provider.search({ ...QUERY, limit: 2 }))
    const matches = events.filter((event) => event.type === 'match').map((event) => event.match)

    expect(matches).toEqual([
      expect.objectContaining({
        path: 'repo/src/dirty.ts',
        source: 'open-buffer',
      }),
      expect.objectContaining({ path: 'repo/src/other.ts', source: 'disk' }),
    ])
    expect(events.at(-1)).toMatchObject({ count: 2, type: 'done' })
  })
})

class StaticSearchProvider implements SearchProvider {
  private events: readonly WorkspaceSearchEvent[]

  constructor(events: readonly WorkspaceSearchEvent[]) {
    this.events = events
  }

  async *search(): AsyncGenerator<WorkspaceSearchEvent> {
    for (const event of this.events) yield event
  }
}

class QueryLimitedSearchProvider implements SearchProvider {
  private events: readonly WorkspaceSearchEvent[]

  constructor(events: readonly WorkspaceSearchEvent[]) {
    this.events = events
  }

  async *search(query: WorkspaceSearchQuery): AsyncGenerator<WorkspaceSearchEvent> {
    let count = 0

    for (const event of this.events) {
      if (event.type === 'match' && count >= query.limit) return
      if (event.type === 'match') count += 1

      yield event
    }
  }
}

async function collectEvents(events: AsyncIterable<WorkspaceSearchEvent>) {
  const result: WorkspaceSearchEvent[] = []
  for await (const event of events) result.push(event)

  return result
}

async function contentEvents(events: AsyncIterable<WorkspaceSearchEvent>) {
  return (await collectEvents(events))
    .filter((event) => event.type === 'match')
    .map((event) => event.match)
}

let fetchedUrl: URL | null = null

function lastFetchUrl() {
  return fetchedUrl
}

function stubFetchWithSseDone() {
  const originalFetch = globalThis.fetch
  fetchedUrl = null
  const fetchStub = async (...args: Parameters<typeof fetch>) => {
    const [input] = args
    fetchedUrl = new URL(String(input))
    return new Response(doneSse(), {
      headers: { 'content-type': 'text/event-stream' },
      status: 200,
    })
  }
  globalThis.fetch = Object.assign(fetchStub, {
    preconnect: originalFetch.preconnect,
  }) as typeof fetch

  return () => {
    globalThis.fetch = originalFetch
    fetchedUrl = null
  }
}

function doneSse() {
  return [
    'event: done',
    `data: ${JSON.stringify({
      count: 0,
      path: 'repo',
      query: 'needle',
      truncated: false,
    })}`,
    '',
    '',
  ].join('\n')
}
