import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  ORCHESTRATION_RESUME_MAX_GAP,
  ORCHESTRATION_WS_PROTOCOL_VERSION,
  orchestrationShellStreamFrameSchema,
  orchestrationWsServerConfigSchema,
  type OrchestrationShellStreamFrame,
} from '@workspace/contracts'
import { OrchestrationStreamHub, OrchestrationStreams } from '../streams'
import { orchestrationWsServerConfig } from '../ws-rpc'
import { readEnvironmentIdentity } from '../../db/environment-identity'
import {
  assistantDeltaEvent,
  createShellWorkspace,
  sessionDeletedEvent,
} from './factories/shell-workspace'

type ShellWorkspace = ReturnType<typeof createShellWorkspace>

const TEST_COALESCE_WINDOW_MS = 5

describe('shell stream deltas', () => {
  it('reads only the changed session, not the whole workspace', async () => {
    const workspace = createShellWorkspace(40)
    const reader = await openShellStream(workspace, { targeted: true })

    workspace.resetQueryCount()
    const events = workspace.commit([
      assistantDeltaEvent('00000000-0000-4000-8000-000000000007', 'hello'),
    ])
    reader.streams.publish(events)
    const frame = await reader.next()

    // One session row + one session row. Never the workspace.
    expect(workspace.queryCount()).toBe(2)
    expect(frame).toMatchObject({
      kind: 'session-upserted',
      session: { id: '00000000-0000-4000-8000-000000000007' },
    })
    await reader.close()
    workspace.close()
  })

  it('still costs a full workspace query without a database handle', async () => {
    const workspace = createShellWorkspace(40)
    const reader = await openShellStream(workspace, { targeted: false })

    workspace.resetQueryCount()
    const events = workspace.commit([
      assistantDeltaEvent('00000000-0000-4000-8000-000000000007', 'hello'),
    ])
    reader.streams.publish(events)
    await reader.next()

    // projects + sessions + snapshot sequence + one session query per session.
    expect(workspace.queryCount()).toBe(44)
    await reader.close()
    workspace.close()
  })

  it('collapses a burst of deltas for one session into a single read', async () => {
    const workspace = createShellWorkspace(40)
    const reader = await openShellStream(workspace, { targeted: true })

    workspace.resetQueryCount()
    for (let index = 0; index < 50; index += 1) {
      reader.streams.publish(
        workspace.commit([
          assistantDeltaEvent('00000000-0000-4000-8000-000000000007', `delta-${index}`),
        ]),
      )
    }
    const frame = await reader.next()

    expect(workspace.queryCount()).toBe(2)
    expect(frame.kind).toBe('session-upserted')
    expect(await reader.settle()).toBe('idle')
    await reader.close()
    workspace.close()
  })

  it('costs the same per window however large the workspace is', async () => {
    const small = await windowedDeltaQueries(4)
    const large = await windowedDeltaQueries(150)

    // Two windows, one changed session each: its row plus its session. The
    // pre-coalescing path read every session in the workspace per event, so this
    // count growing with `sessionCount` is the regression to catch.
    expect(small).toBe(4)
    expect(large).toBe(4)
  })

  it('emits a removal when the coalesced aggregate no longer has a live row', async () => {
    const workspace = createShellWorkspace(4)
    const reader = await openShellStream(workspace, { targeted: true })

    const events = workspace.commit([
      assistantDeltaEvent('00000000-0000-4000-8000-000000000002', 'about to go'),
      sessionDeletedEvent('00000000-0000-4000-8000-000000000002'),
    ])
    reader.streams.publish(events)
    const frame = await reader.next()

    expect(frame).toMatchObject({
      kind: 'session-removed',
      sessionId: '00000000-0000-4000-8000-000000000002',
    })
    await reader.close()
    workspace.close()
  })
})

describe('shell stream resume', () => {
  it('replays the cursor boundary and newer events before marking the client synchronized', async () => {
    const workspace = createShellWorkspace(20)
    const hub = new OrchestrationStreamHub()
    const streams = shellStreams(workspace, hub, true)

    const first = workspace.commit([
      assistantDeltaEvent('00000000-0000-4000-8000-000000000001', 'one'),
    ])
    const second = workspace.commit([
      assistantDeltaEvent('00000000-0000-4000-8000-000000000002', 'two'),
    ])
    streams.publish(first)
    streams.publish(second)
    const cursor = first.at(-1)?.sequence ?? 0

    workspace.resetQueryCount()
    const reader = shellReader(streams, { afterSequence: cursor })
    const boundary = await reader.next()
    const replayed = await reader.next()
    const synchronized = await reader.next()

    expect(boundary).toMatchObject({
      kind: 'session-upserted',
      session: { id: '00000000-0000-4000-8000-000000000001' },
      sequence: cursor,
    })
    expect(replayed).toMatchObject({
      kind: 'session-upserted',
      session: { id: '00000000-0000-4000-8000-000000000002' },
    })
    expect(synchronized).toEqual({ kind: 'synchronized', sequence: second.at(-1)?.sequence })
    expect(workspace.queryCount()).toBe(4)
    await reader.close()
    workspace.close()
  })

  it('sends a snapshot when the client is further behind than the gap cap', async () => {
    const workspace = createShellWorkspace(3)
    const hub = new OrchestrationStreamHub()
    const streams = shellStreams(workspace, hub, true)
    hub.observeSequence(ORCHESTRATION_RESUME_MAX_GAP + 100)

    const reader = shellReader(streams, { afterSequence: 1 })
    const first = await reader.next()
    const synchronized = await reader.next()

    expect(first.kind).toBe('snapshot')
    expect(synchronized.kind).toBe('synchronized')
    await reader.close()
    workspace.close()
  })

  it('replays the final boundary for a caught-up client without snapshotting', async () => {
    const workspace = createShellWorkspace(20)
    const hub = new OrchestrationStreamHub()
    const streams = shellStreams(workspace, hub, true)
    const events = workspace.commit([
      assistantDeltaEvent('00000000-0000-4000-8000-000000000001', 'one'),
    ])
    streams.publish(events)

    workspace.resetQueryCount()
    const reader = shellReader(streams, { afterSequence: events.at(-1)?.sequence })
    const boundary = await reader.next()
    const synchronized = await reader.next()

    expect(boundary).toMatchObject({
      kind: 'session-upserted',
      sequence: events.at(-1)?.sequence,
    })
    expect(synchronized).toEqual({ kind: 'synchronized', sequence: events.at(-1)?.sequence })
    expect(workspace.queryCount()).toBe(2)
    await reader.close()
    workspace.close()
  })
})

describe('resume plan', () => {
  it('serves the cursor just before the retained tail and refuses the one below it', () => {
    const workspace = createShellWorkspace(4)
    const hub = new OrchestrationStreamHub()
    const streams = shellStreams(workspace, hub, true)

    // Committed but never published: the hub's tail starts after these, which is
    // what an eviction looks like from `resumePlan`'s side.
    const unpublished = workspace.commit([
      assistantDeltaEvent('00000000-0000-4000-8000-000000000001', 'before the tail'),
    ])
    const retained = workspace.commit([
      assistantDeltaEvent('00000000-0000-4000-8000-000000000002', 'in the tail'),
    ])
    streams.publish(retained)

    const oldest = retained[0]?.sequence ?? 0
    expect(unpublished.at(-1)?.sequence).toBe(oldest - 1)
    expect(hub.resumePlan(oldest - 1)).toMatchObject({ kind: 'replay' })
    expect(hub.resumePlan(oldest - 2)).toMatchObject({
      kind: 'snapshot',
      reason: 'history-evicted',
    })
    workspace.close()
  })

  it('classifies every cursor a snapshot has to answer', () => {
    const hub = new OrchestrationStreamHub()
    hub.observeSequence(50)

    expect(hub.resumePlan(0)).toMatchObject({ kind: 'snapshot', reason: 'no-cursor' })
    expect(hub.resumePlan(80)).toMatchObject({ kind: 'snapshot', reason: 'cursor-ahead' })
    expect(hub.resumePlan(10)).toMatchObject({ kind: 'snapshot', reason: 'history-evicted' })
    expect(hub.resumePlan(50)).toMatchObject({ kind: 'replay', events: [] })

    hub.observeSequence(ORCHESTRATION_RESUME_MAX_GAP + 200)
    expect(hub.resumePlan(50)).toMatchObject({ kind: 'snapshot', reason: 'gap-too-large' })
  })
})

describe('event replay bounds', () => {
  it('pages a replay instead of decoding the whole log', () => {
    const workspace = createShellWorkspace(1)
    for (let index = 0; index < 1_100; index += 1) {
      workspace.eventStore.append([
        assistantDeltaEvent('00000000-0000-4000-8000-000000000000', `delta-${index}`),
      ])
    }

    const capped = workspace.eventStore.readAfter({ afterSequence: 0 })
    const paged = workspace.eventStore.readAfter({ afterSequence: 0, limit: 10 })
    const overAsked = workspace.eventStore.readAfter({ afterSequence: 0, limit: 100_000 })
    const nextPage = workspace.eventStore.readAfter({
      afterSequence: paged.at(-1)?.sequence ?? 0,
      limit: 10,
    })

    expect(capped).toHaveLength(1_000)
    expect(paged).toHaveLength(10)
    expect(overAsked).toHaveLength(1_000)
    expect(nextPage[0]?.sequence).toBe((paged.at(-1)?.sequence ?? 0) + 1)
    workspace.close()
  })
})

describe('connection handshake', () => {
  it('reports the server version and the limits a client resumes against', () => {
    const workspace = createShellWorkspace(0)
    const identity = readEnvironmentIdentity(workspace.database)
    const config = v.parse(orchestrationWsServerConfigSchema, orchestrationWsServerConfig(identity))

    expect(config.serverVersion).toBe('0.0.1')
    expect(config.protocolVersion).toBe(ORCHESTRATION_WS_PROTOCOL_VERSION)
    expect(config.capabilities).toEqual({ resume: true, synchronizedMarker: true })
    expect(config.limits.resumeMaxGap).toBe(ORCHESTRATION_RESUME_MAX_GAP)
    expect(config.environmentId).toBe(identity.id)
    expect(orchestrationWsServerConfig(identity).serverInstanceId).toBe(config.serverInstanceId)
    workspace.close()
  })
})

function shellStreams(workspace: ShellWorkspace, hub: OrchestrationStreamHub, targeted: boolean) {
  return new OrchestrationStreams(workspace.snapshots, {
    coalesceWindowMs: TEST_COALESCE_WINDOW_MS,
    database: targeted ? workspace.countedDatabase : undefined,
    hub,
  })
}

function shellReader(streams: OrchestrationStreams, options: { afterSequence?: number } = {}) {
  const controller = new AbortController()
  const stream = streams.shell({ afterSequence: options.afterSequence, signal: controller.signal })

  return {
    streams,
    close: async () => {
      controller.abort()
      await stream.return(undefined)
    },
    next: async () => {
      const result = await stream.next()
      expect(result.done).toBe(false)

      return v.parse(orchestrationShellStreamFrameSchema, result.value)
    },
    /** The next frame, or `idle` when several coalescing windows produce none. */
    settle: async (): Promise<OrchestrationShellStreamFrame | 'idle'> => {
      const idle = new Promise<'idle'>((resolve) => {
        setTimeout(() => resolve('idle'), TEST_COALESCE_WINDOW_MS * 4)
      })
      const next = stream.next().then((result) => (result.done ? 'idle' : result.value))

      return await Promise.race([next, idle])
    },
  }
}

/** Reads a delta in each of two separate coalescing windows and counts the queries. */
async function windowedDeltaQueries(sessionCount: number) {
  const workspace = createShellWorkspace(sessionCount)
  const reader = await openShellStream(workspace, { targeted: true })

  workspace.resetQueryCount()
  for (const text of ['first', 'second']) {
    reader.streams.publish(
      workspace.commit([assistantDeltaEvent('00000000-0000-4000-8000-000000000001', text)]),
    )
    await reader.next()
  }
  const queries = workspace.queryCount()

  await reader.close()
  workspace.close()

  return queries
}

async function openShellStream(workspace: ShellWorkspace, options: { targeted: boolean }) {
  const streams = shellStreams(workspace, new OrchestrationStreamHub(), options.targeted)
  const reader = shellReader(streams)
  const snapshot = await reader.next()
  const synchronized = await reader.next()
  expect(snapshot.kind).toBe('snapshot')
  expect(synchronized.kind).toBe('synchronized')

  return reader
}
