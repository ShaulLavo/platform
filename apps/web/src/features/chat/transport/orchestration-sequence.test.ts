import { describe, expect, it } from 'vitest'
import { threadIdSchema, type OrchestrationShellStreamItem } from '@workspace/contracts'
import * as v from 'valibot'

import {
  guardOrchestrationStreamSequence,
  orchestrationStreamItemSequence,
} from './orchestration-sequence'

describe('orchestration stream sequence guards', () => {
  it('reads sequence values from snapshots and stream events', () => {
    expect(orchestrationStreamItemSequence(snapshotItem(3))).toBe(3)
    expect(orchestrationStreamItemSequence(threadRemovedItem(5))).toBe(5)
  })

  it('rejects stale and duplicate stream items', async () => {
    const accepted: number[] = []

    for await (const item of guardOrchestrationStreamSequence(
      asyncItems([
        snapshotItem(4),
        threadRemovedItem(3),
        threadRemovedItem(4),
        threadRemovedItem(6),
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
      projects: [],
      snapshotSequence: sequence,
      threads: [],
      updatedAt: '2026-05-24T00:00:00.000Z',
    },
  }
}

function threadRemovedItem(sequence: number): OrchestrationShellStreamItem {
  return {
    kind: 'thread-removed',
    sequence,
    threadId: v.parse(threadIdSchema, 'thread-1'),
  }
}

async function* asyncItems<T>(items: T[]) {
  for (const item of items) {
    yield item
  }
}
