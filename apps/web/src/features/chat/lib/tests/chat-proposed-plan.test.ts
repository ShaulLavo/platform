import { proposedPlanIdSchema, type OrchestrationProposedPlan } from '@workspace/contracts'
import * as v from 'valibot'

import {
  actionableProposedPlan,
  planImplementationPrompt,
  proposedPlanExportFilename,
  proposedPlanExportMarkdown,
  resolvePlanFollowUpSubmission,
} from '@/features/chat/lib/chat-proposed-plan'
import { expect, test } from '../../../../../test/fixtures'

const PLAN_MARKDOWN = '# Ship the retry queue\n\n1. Add the queue\n2. Drain it on boot\n'

test('an empty composer resolves to implementing the plan as written', () => {
  const submission = resolvePlanFollowUpSubmission({
    draftText: '   \n ',
    planMarkdown: PLAN_MARKDOWN,
  })

  expect(submission).toEqual({
    implementsPlan: true,
    interactionMode: 'default',
    text: planImplementationPrompt(PLAN_MARKDOWN),
  })
  expect(submission.text).toContain('Drain it on boot')
})

test('typed feedback resolves to another planning turn, not an implementation', () => {
  const submission = resolvePlanFollowUpSubmission({
    draftText: '  drop step 2  ',
    planMarkdown: PLAN_MARKDOWN,
  })

  expect(submission).toEqual({
    implementsPlan: false,
    interactionMode: 'plan',
    text: 'drop step 2',
  })
})

test('the newest plan nothing was built from is the actionable one', () => {
  const plans = [
    plan({ id: planId('plan-1'), updatedAt: '2026-05-28T00:00:01.000Z' }),
    plan({ id: planId('plan-2') }),
  ]

  expect(actionableProposedPlan(plans)?.id).toBe('plan-2')
})

test('an implemented plan is never actionable again', () => {
  const plans = [plan({ id: planId('plan-1'), implementedAt: '2026-05-28T00:00:03.000Z' })]

  expect(actionableProposedPlan(plans)).toBeNull()
})

test('an older open plan still wins over a newer implemented one', () => {
  const plans = [
    plan({ id: planId('plan-1'), updatedAt: '2026-05-28T00:00:01.000Z' }),
    plan({
      id: planId('plan-2'),
      implementedAt: '2026-05-28T00:00:09.000Z',
      updatedAt: '2026-05-28T00:00:05.000Z',
    }),
  ]

  expect(actionableProposedPlan(plans)?.id).toBe('plan-1')
})

test('the export keeps the heading the card strips and ends in a newline', () => {
  const exported = proposedPlanExportMarkdown('# Ship the retry queue\n\nStep one   ')

  expect(exported).toBe('# Ship the retry queue\n\nStep one\n')
})

test('the export filename is the plan title as a markdown slug', () => {
  expect(proposedPlanExportFilename(PLAN_MARKDOWN)).toBe('ship-the-retry-queue.md')
})

test('a title with no usable characters still produces a filename', () => {
  expect(proposedPlanExportFilename('# ***\n\nbody')).toBe('plan.md')
})

function plan(overrides: Partial<OrchestrationProposedPlan> = {}): OrchestrationProposedPlan {
  return {
    createdAt: '2026-05-28T00:00:02.000Z',
    id: planId('plan-1'),
    implementationThreadId: null,
    implementedAt: null,
    planMarkdown: PLAN_MARKDOWN,
    threadId: 'thread-1',
    turnId: 'turn-1',
    updatedAt: '2026-05-28T00:00:02.000Z',
    ...overrides,
  } as OrchestrationProposedPlan
}

function planId(value: string) {
  return v.parse(proposedPlanIdSchema, value)
}
