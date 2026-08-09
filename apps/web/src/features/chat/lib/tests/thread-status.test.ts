import { threadStatus } from '@/features/chat/lib/thread-status'
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
