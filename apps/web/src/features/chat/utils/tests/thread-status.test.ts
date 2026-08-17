import { proposedPlanIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import { threadStatus } from '@/features/chat/utils/thread-status'
import { sidebarThreadSummary } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'

test('a running turn reads as working', () => {
  expect(threadStatus(sidebarThreadSummary())).toBe('working')
})

test('needing the user outranks a turn that is still running', () => {
  // The run cannot finish until the approval is answered, so "working" would send
  // the user away from the one session that is actually blocked on them.
  const status = threadStatus(sidebarThreadSummary({ pendingApprovalCount: 1 }))

  expect(status).toBe('waiting')
})

test('a proposed plan waiting on a decision counts as waiting', () => {
  const status = threadStatus(
    sidebarThreadSummary({ hasActionableProposedPlan: true, latestTurn: null, session: null }),
  )

  expect(status).toBe('waiting')
})

test('a plan already being implemented reads as working, not waiting', () => {
  // The implementing turn is the answer to the plan; the plan's own
  // `implementedAt` stamp arrives a sync later.
  const source = sidebarThreadSummary({ hasActionableProposedPlan: true })
  const status = threadStatus({
    ...source,
    latestTurn: source.latestTurn
      ? {
          ...source.latestTurn,
          sourceProposedPlan: {
            planId: v.parse(proposedPlanIdSchema, 'plan-1'),
            threadId: source.id,
          },
          state: 'running',
        }
      : null,
  })

  expect(status).toBe('working')
})

test('a failed turn reads as failed', () => {
  const source = sidebarThreadSummary()
  const status = threadStatus({
    ...source,
    latestTurn: source.latestTurn ? { ...source.latestTurn, state: 'error' } : null,
    session: null,
  })

  expect(status).toBe('failed')
})

test('a settled thread is idle', () => {
  const status = threadStatus(sidebarThreadSummary({ latestTurn: null, session: null }))

  expect(status).toBe('idle')
})
