import {
  DEFAULT_PROVIDER_INSTANCE_ID,
  projectIdSchema,
  proposedPlanIdSchema,
  type OrchestrationProposedPlan,
} from '@workspace/contracts'
import * as v from 'valibot'

import { createDraftThreadSubmission } from '@/features/chat/lib/chat-command-builders'
import {
  actionableProposedPlan,
  planImplementationPrompt,
  planImplementationThreadTitle,
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

test('a thread split off to build a plan is named after the plan', () => {
  expect(planImplementationThreadTitle(PLAN_MARKDOWN)).toBe('Implement Ship the retry queue')
})

test('a plan with no heading still names its thread something a rail row can read', () => {
  expect(planImplementationThreadTitle('- step one\n- step two')).toBe('Implement plan')
})

test('a heading long enough to fill the rail is cut down like any other title', () => {
  const title = planImplementationThreadTitle(`# ${'retry queue '.repeat(10)}`)

  expect(title.startsWith('Implement retry queue')).toBe(true)
  expect(title.endsWith('...')).toBe(true)
})

test('a heading that reads like a secret never becomes a thread title', () => {
  expect(planImplementationThreadTitle('# rotate the openai api key')).toBe('Implement plan')
})

test('the new thread carries the plan title instead of the implementation header', () => {
  const command = draftCommand()

  // The prompt's first line is the instruction carrying the plan, so the
  // derived title would read "Please implement this plan" without the override.
  expect(command.bootstrap?.createThread?.title).toBe('Implement Ship the retry queue')
  expect(command.titleSeed).toBe('Implement Ship the retry queue')
})

test('the new thread points back at the plan it was split off to build', () => {
  expect(draftCommand().sourceProposedPlan).toEqual({ planId: 'plan-1', threadId: 'thread-1' })
})

test('the new thread keeps the project and the prompt the draft builder chose', () => {
  const command = draftCommand()

  expect(command.bootstrap?.createThread?.projectId).toBe('project-1')
  expect(command.bootstrap?.createThread?.worktreePath).toBe('/repo/platform')
  // Thread creation and the first turn are one command, so a rejected dispatch
  // leaves no thread behind to clean up.
  expect(command.bootstrap?.createThread).toBeDefined()
  expect(command.message.text).toContain('Drain it on boot')
})

function draftCommand() {
  return createDraftThreadSubmission({
    createdAt: '2026-05-28T00:00:02.000Z',
    modelSelection: {
      model: 'claude-opus-5',
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    },
    projectId: v.parse(projectIdSchema, 'project-1'),
    rootPath: '/repo/platform',
    sourceProposedPlan: {
      planId: planId('plan-1'),
      threadId: 'thread-1' as OrchestrationProposedPlan['threadId'],
    },
    text: planImplementationPrompt(PLAN_MARKDOWN),
    title: planImplementationThreadTitle(PLAN_MARKDOWN),
  }).command
}

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
