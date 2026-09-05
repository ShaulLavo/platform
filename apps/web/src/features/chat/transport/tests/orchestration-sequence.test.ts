import { chatWorktree as fixtureWorktree } from '../../../../../test/factories/chat'
import { describe, expect, it } from 'vitest'
import { sessionIdSchema, type OrchestrationShellStreamItem } from '@workspace/contracts'
import * as v from 'valibot'

import {
  guardOrchestrationStreamSequence,
  orchestrationStreamItemSequence,
} from '@workspace/client-core/transport/utils/sequence'

describe('orchestration stream sequence guards', () => {
  it('reads sequence values from snapshots and stream events', () => {
    expect(orchestrationStreamItemSequence(snapshotItem(3))).toBe(3)
    expect(orchestrationStreamItemSequence(sessionRemovedItem(5))).toBe(5)
  })

  it('rejects stale and duplicate stream items', async () => {
    const accepted: number[] = []

    for await (const item of guardOrchestrationStreamSequence(
      asyncItems([
        snapshotItem(4),
        sessionRemovedItem(3),
        sessionRemovedItem(4),
        sessionRemovedItem(6),
      ]),
    )) {
      accepted.push(orchestrationStreamItemSequence(item))
    }

    expect(accepted).toEqual([4, 6])
  })
})

function snapshotItem(sequence: number): OrchestrationShellStreamItem {
  return {
    kind: 'snapshot',
    snapshot: {
      worktrees: [fixtureWorktree()],
      projects: [],
      snapshotSequence: sequence,
      sessions: [],
      updatedAt: '2026-05-24T00:00:00.000Z',
    },
  }
}

function sessionRemovedItem(sequence: number): OrchestrationShellStreamItem {
  return {
    kind: 'session-removed',
    sequence,
    sessionId: v.parse(sessionIdSchema, 'ad686244-5b2e-59be-805f-ef86eac80feb'),
  }
}

async function* asyncItems<T>(items: T[]) {
  for (const item of items) {
    yield item
  }
}
