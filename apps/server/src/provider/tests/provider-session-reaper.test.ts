import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as v from 'valibot'
import {
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  providerDriverKindSchema,
  threadIdSchema,
  type ThreadId,
} from '@workspace/contracts'
import { migrateOrchestrationDatabase } from '../../db/migrations'
import * as schema from '../../db/schema'
import { ProviderSessionDirectory } from '../provider-session-directory'
import { ProviderSessionReaper } from '../provider-session-reaper'

const DEADLINE_MS = 30 * 60 * 1000
const START_MS = Date.parse('2026-06-01T12:00:00.000Z')

describe('ProviderSessionReaper', () => {
  it('reclaims a session nobody has touched past the deadline', async () => {
    const fixture = createFixture()
    try {
      fixture.bind('thread-idle', 'ready')
      fixture.advanceTo(START_MS + DEADLINE_MS + 1)

      expect(await fixture.reaper.sweep()).toEqual(['thread-idle'])
      expect(fixture.stopped).toEqual(['thread-idle'])
    } finally {
      fixture.close()
    }
  })

  it('leaves a long turn alone because its event stream keeps stamping liveness', async () => {
    const fixture = createFixture()
    try {
      // A ready session that streams. `markStatus` never fires again after the
      // turn opens, so status alone would call this idle within the hour.
      fixture.bind('thread-streaming', 'ready')
      fixture.bind('thread-quiet', 'ready')
      for (let elapsed = 0; elapsed <= DEADLINE_MS * 2; elapsed += 60_000) {
        fixture.advanceTo(START_MS + elapsed)
        fixture.directory.markSeen(threadId('thread-streaming'))
      }

      expect(await fixture.reaper.sweep()).toEqual(['thread-quiet'])
    } finally {
      fixture.close()
    }
  })

  it('never reclaims a session that is mid-work, however long it has been quiet', async () => {
    const fixture = createFixture()
    try {
      // `waiting` is compaction or an unanswered approval: state that dies with
      // the process. `running` is the agent talking. Neither is reclaimable at
      // any age, so both outlive a deadline they are well past.
      fixture.bind('thread-running', 'running')
      fixture.bind('thread-waiting', 'waiting')
      fixture.bind('thread-starting', 'starting')
      fixture.advanceTo(START_MS + DEADLINE_MS * 10)

      expect(await fixture.reaper.sweep()).toEqual([])
      expect(fixture.stopped).toEqual([])
    } finally {
      fixture.close()
    }
  })

  it('spares the thread being ensured, which is often the oldest one there is', async () => {
    const fixture = createFixture()
    try {
      fixture.bind('thread-returning', 'ready')
      fixture.advanceTo(START_MS + DEADLINE_MS + 1)

      const reaped = await fixture.reaper.sweep({ exceptThreadId: threadId('thread-returning') })

      expect(reaped).toEqual([])
    } finally {
      fixture.close()
    }
  })

  it('keeps sweeping after an adapter refuses to stop', async () => {
    const fixture = createFixture({
      stopSession: async ({ threadId: id }) => {
        if (id === 'thread-stuck') throw new Error('adapter is wedged')
      },
    })
    try {
      fixture.bind('thread-stuck', 'ready')
      fixture.bind('thread-fine', 'ready')
      fixture.advanceTo(START_MS + DEADLINE_MS + 1)

      // Housekeeping runs alongside a turn the user asked for. One wedged
      // adapter must not take the sweep — or that turn — down with it.
      expect(await fixture.reaper.sweep()).toEqual(['thread-fine'])
    } finally {
      fixture.close()
    }
  })
})

function threadId(id: string) {
  return v.parse(threadIdSchema, id)
}

function createFixture(
  options: { stopSession?: (input: { threadId: ThreadId }) => Promise<unknown> } = {},
) {
  const sqlite = new Database(':memory:', { create: true })
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)

  let nowMs = START_MS
  const now = () => nowMs
  const stopped: string[] = []
  const directory = new ProviderSessionDirectory(database, { now })
  const reaper = new ProviderSessionReaper({
    deadlineMs: DEADLINE_MS,
    directory,
    now,
    stopSession: async (input) => {
      await options.stopSession?.(input)
      stopped.push(input.threadId)
    },
  })

  return {
    advanceTo: (at: number) => {
      nowMs = at
    },
    bind: (id: string, status: 'ready' | 'running' | 'starting' | 'waiting') => {
      directory.upsert({
        providerDriverKind: v.parse(providerDriverKindSchema, 'codex'),
        providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
        runtimeMode: DEFAULT_RUNTIME_MODE,
        status,
        threadId: threadId(id),
      })
    },
    close: () => sqlite.close(),
    directory,
    reaper,
    stopped,
  }
}
