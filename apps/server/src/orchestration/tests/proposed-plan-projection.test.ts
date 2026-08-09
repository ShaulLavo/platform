import { afterEach, describe, expect, it } from 'vitest'
import type { PendingOrchestrationEvent } from '../event-store'
import { projectEvents } from '../projector'
import { OrchestrationSnapshotQuery } from '../snapshot-query'
import {
  createProjectionFixture,
  proposedPlanUpsertedEvent,
  threadBootstrapEvents,
  turnStartEvent,
  THREAD_ID,
} from './factories/projection'

const planMarkdown = '# Plan\n\n1. Read the code\n2. Change it'
const requestedAt = '2026-05-24T00:05:00.000Z'
const fixtures: Array<{ close: () => void }> = []

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.close()
  }
})

describe('orchestration proposed plan projection', () => {
  it('keeps the plan markdown readable after a reload', () => {
    const fixture = project([
      ...threadBootstrapEvents(),
      proposedPlanUpsertedEvent({ planId: 'plan-1', planMarkdown }),
    ])

    // A fresh query over the same file is what a restart sees: no replay, no
    // live events, only what the projection wrote.
    const reloaded = new OrchestrationSnapshotQuery(fixture.database).threadDetailSnapshot(
      THREAD_ID,
    )

    expect(reloaded.proposedPlans).toMatchObject([
      { id: 'plan-1', implementedAt: null, planMarkdown, threadId: THREAD_ID },
    ])
  })

  it('reports an unimplemented plan as actionable in both projections', () => {
    const fixture = project([
      ...threadBootstrapEvents(),
      proposedPlanUpsertedEvent({ planId: 'plan-1', planMarkdown }),
    ])

    expect(shellThread(fixture).hasActionableProposedPlan).toBe(true)
    expect(memoryThread(fixture).hasActionableProposedPlan).toBe(true)
  })

  it('stops offering a plan once a turn is started from it', () => {
    const fixture = project([
      ...threadBootstrapEvents(),
      proposedPlanUpsertedEvent({ planId: 'plan-1', planMarkdown }),
      turnStartEvent('turn-1', requestedAt, { planId: 'plan-1', threadId: THREAD_ID }),
    ])
    const detail = fixture.snapshots.threadDetailSnapshot(THREAD_ID)

    expect(detail.proposedPlans[0]).toMatchObject({
      implementationThreadId: THREAD_ID,
      implementedAt: requestedAt,
    })
    expect(shellThread(fixture).hasActionableProposedPlan).toBe(false)
    expect(memoryThread(fixture).hasActionableProposedPlan).toBe(false)
  })

  it('never latches: a plan that arrives already implemented is not actionable', () => {
    const fixture = project([
      ...threadBootstrapEvents(),
      proposedPlanUpsertedEvent({
        implementationThreadId: THREAD_ID,
        implementedAt: requestedAt,
        planId: 'plan-1',
        planMarkdown,
      }),
    ])

    expect(shellThread(fixture).hasActionableProposedPlan).toBe(false)
    expect(memoryThread(fixture).hasActionableProposedPlan).toBe(false)
  })
})

function project(events: PendingOrchestrationEvent[]) {
  const fixture = createProjectionFixture()
  fixtures.push(fixture)
  fixture.pipeline.applyEvents(fixture.append(events))

  return fixture
}

function shellThread(fixture: ReturnType<typeof createProjectionFixture>) {
  const thread = fixture.snapshots.shellSnapshot().threads.find((entry) => entry.id === THREAD_ID)
  if (!thread) return expect.unreachable('shell snapshot is missing the thread')

  return thread
}

function memoryThread(fixture: ReturnType<typeof createProjectionFixture>) {
  const model = projectEvents(fixture.eventStore.readAfter({ afterSequence: 0 }))
  const thread = model.threads.get(THREAD_ID)
  if (!thread) return expect.unreachable('read model is missing the thread')

  return thread
}
