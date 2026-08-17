import { Elysia } from 'elysia'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE,
  ORCHESTRATION_THREAD_SEARCH_MAX_QUERY_LENGTH,
  ORCHESTRATION_THREAD_SEARCH_SNIPPET_MAX_LENGTH,
  type OrchestrationSearchThreadsResult,
} from '@workspace/contracts'
import { DEFAULT_MAX_TEXT_FILE_BYTES } from '../../fs/limits'
import { createWorkspacePaths } from '../../fs/path'
import { GitService } from '../../git/service'
import { OrchestrationCheckpointDiffQuery } from '../checkpoint-diff-query'
import { OrchestrationEngine } from '../engine'
import type { OrchestrationDatabase } from '../event-store'
import { orchestrationRoutes } from '../routes'
import { OrchestrationThreadSearchQuery } from '../thread-search-query'
import {
  createProjectionFixture,
  PROJECT_ID,
  THREAD_ID,
  threadBootstrapEvents,
} from './factories/projection'
import { searchMessageEvent, searchThreadCreatedEvent } from './factories/thread-search'

const NOISE_MESSAGE_COUNT = 260
const BURIED_AT = '2026-05-24T00:01:00.000Z'
const BURIED_TEXT = 'Long ago we settled on a pelican crossing for the north intersection.'
const RECENT_THREAD_MATCH_AT = '2026-05-25T02:00:00.000Z'
const NEWEST_THREAD_MATCH_AT = '2026-05-26T00:30:00.000Z'
const LONG_MESSAGE_MATCH = 'a wombat appeared here'

let fixture: ReturnType<typeof createProjectionFixture>
let search: OrchestrationThreadSearchQuery
let app: ReturnType<typeof createSearchApp>

beforeAll(() => {
  fixture = createProjectionFixture()
  fixture.pipeline.applyEvents(fixture.append(seedEvents()))
  search = new OrchestrationThreadSearchQuery(fixture.database)
  app = createSearchApp(fixture.database, search)
})

afterAll(() => {
  fixture.close()
})

describe('orchestration thread search', () => {
  it('finds a phrase in a message the thread detail window no longer carries', () => {
    const detail = fixture.snapshots.threadDetailSnapshot(THREAD_ID)
    expect(detail.thread.messages).toHaveLength(ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE)
    expect(detail.thread.messages.some((message) => message.text === BURIED_TEXT)).toBe(false)

    const matches = search.search({ query: 'pelican crossing' }).matches

    expect(matches).toEqual([
      {
        messageCreatedAt: BURIED_AT,
        projectId: PROJECT_ID,
        snippet: BURIED_TEXT,
        source: 'assistant',
        threadId: THREAD_ID,
      },
    ])
  })

  it('collapses a thread to its newest hit and orders threads by it', () => {
    const matches = search.search({ query: 'pelican' }).matches

    expect(matches.map((match) => match.threadId)).toEqual(['thread-3', 'thread-2', THREAD_ID])
    expect(matches.map((match) => match.messageCreatedAt)).toEqual([
      NEWEST_THREAD_MATCH_AT,
      RECENT_THREAD_MATCH_AT,
      BURIED_AT,
    ])
  })

  it('bounds the result to the requested limit', () => {
    expect(search.search({ limit: 2, query: 'pelican' }).matches).toHaveLength(2)
    expect(
      search.search({ limit: 1, query: 'pelican' }).matches.map((match) => match.threadId),
    ).toEqual(['thread-3'])
  })

  it('windows the snippet around the match and caps its length', () => {
    const matches = search.search({ query: 'wombat' }).matches
    expect(matches).toHaveLength(1)

    const snippet = matches[0]?.snippet ?? ''
    expect(snippet.length).toBeLessThanOrEqual(ORCHESTRATION_THREAD_SEARCH_SNIPPET_MAX_LENGTH)
    expect(snippet).toContain(LONG_MESSAGE_MATCH)
    expect(snippet.startsWith('…')).toBe(true)
  })

  it('treats LIKE wildcards as literal text', () => {
    expect(search.search({ query: '%%' }).matches).toEqual([])
    expect(search.search({ query: '_'.repeat(20) }).matches).toEqual([])
    expect(
      search.search({ query: '%'.repeat(ORCHESTRATION_THREAD_SEARCH_MAX_QUERY_LENGTH) }).matches,
    ).toEqual([])
  })

  it('rejects an out-of-bounds query before it reaches the database', () => {
    expect(() =>
      search.search({ query: 'x'.repeat(ORCHESTRATION_THREAD_SEARCH_MAX_QUERY_LENGTH + 1) }),
    ).toThrow()
    expect(() => search.search({ query: 'x' })).toThrow()
    expect(() => search.search({ limit: 5_000, query: 'pelican' })).toThrow()
  })

  it('answers over the route and stays usable after a rejected query', async () => {
    const rejected = await postSearch({
      query: 'x'.repeat(ORCHESTRATION_THREAD_SEARCH_MAX_QUERY_LENGTH + 1),
    })
    expect(rejected.status).toBe(422)

    const response = await postSearch({ limit: 2, query: 'pelican' })
    expect(response.status).toBe(200)

    const payload = (await response.json()) as OrchestrationSearchThreadsResult
    expect(payload.matches.map((match) => match.threadId)).toEqual(['thread-3', 'thread-2'])
  })
})

/** The real routes plugin, so the bounds under test are the ones a client meets. */
function createSearchApp(
  database: OrchestrationDatabase,
  threadSearch: OrchestrationThreadSearchQuery,
) {
  return new Elysia().use(
    orchestrationRoutes(
      new OrchestrationEngine(database),
      new OrchestrationCheckpointDiffQuery(
        database,
        new GitService(createWorkspacePaths(), { maxTextFileBytes: DEFAULT_MAX_TEXT_FILE_BYTES }),
      ),
      threadSearch,
    ),
  )
}

function postSearch(body: unknown) {
  return app.handle(
    new Request('http://local/orchestration/thread-search', {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  )
}

/**
 * One project, four threads of real projected messages. The phrase under test
 * sits at the very start of the busiest thread so the search has to reach past
 * the detail window to find it.
 */
function seedEvents() {
  return [
    ...threadBootstrapEvents(),
    searchMessageEvent({
      createdAt: BURIED_AT,
      messageId: 'message-buried',
      text: BURIED_TEXT,
      threadId: THREAD_ID,
    }),
    ...Array.from({ length: NOISE_MESSAGE_COUNT }, (_, index) =>
      searchMessageEvent({
        createdAt: noiseCreatedAt(index),
        messageId: `message-noise-${index}`,
        text: `routine status update ${index}`,
        threadId: THREAD_ID,
      }),
    ),
    searchThreadCreatedEvent({ createdAt: '2026-05-25T00:00:00.000Z', threadId: 'thread-2' }),
    searchMessageEvent({
      createdAt: '2026-05-25T00:30:00.000Z',
      messageId: 'message-2a',
      role: 'user',
      text: 'the first pelican mention in this thread',
      threadId: 'thread-2',
    }),
    searchMessageEvent({
      createdAt: RECENT_THREAD_MATCH_AT,
      messageId: 'message-2b',
      text: 'the second pelican mention, which is the newer one',
      threadId: 'thread-2',
    }),
    searchThreadCreatedEvent({ createdAt: '2026-05-26T00:00:00.000Z', threadId: 'thread-3' }),
    searchMessageEvent({
      createdAt: NEWEST_THREAD_MATCH_AT,
      messageId: 'message-3a',
      text: 'a pelican in the newest thread',
      threadId: 'thread-3',
    }),
    searchThreadCreatedEvent({ createdAt: '2026-05-20T00:00:00.000Z', threadId: 'thread-4' }),
    searchMessageEvent({
      createdAt: '2026-05-20T00:30:00.000Z',
      messageId: 'message-4a',
      text: `${'filler '.repeat(300)}${LONG_MESSAGE_MATCH}${' trailing'.repeat(300)}`,
      threadId: 'thread-4',
    }),
  ]
}

function noiseCreatedAt(index: number) {
  return new Date(Date.UTC(2026, 4, 24, 1, index)).toISOString()
}
