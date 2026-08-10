import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  proposedPlanIdSchema,
  threadIdSchema,
  type ClientOrchestrationCommand,
  type OrchestrationProposedPlan,
  type OrchestrationThreadDetailSnapshot,
  type ThreadId,
} from '@workspace/contracts'
import * as v from 'valibot'

import { PlanFollowUpBanner } from '@/features/chat/components/plan-follow-up-banner'
import { ChatPlanFollowUpProvider } from '@/features/chat/providers/plan-follow-up-provider'
import {
  resetChatInputDraftStore,
  useChatInputDraftStore,
  type ChatInputDraftTarget,
} from '@/features/chat/state/chat-input-draft-store'
import { useChatOptimisticStore } from '@/features/chat/state/chat-optimistic-store'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { unsupportedChatEnvironment } from '../../../../../test/factories/chat-environment'
import { expect, test } from '../../../../../test/fixtures'
import { thread as threadFactory } from '../../../../../test/factories/chat'
import { renderWithProviders } from '../../../../../test/render'

const PLAN_MARKDOWN = '# Ship the retry queue\n\n1. Add the queue\n2. Drain it on boot'
const THREAD_ID = v.parse(threadIdSchema, 'thread-1')
const draftTarget: ChatInputDraftTarget = {
  draftKey: THREAD_ID,
  rootPath: '/repo/platform',
}

test('a plan waiting on the user offers to implement it', () => {
  renderBanner()

  expect(screen.getByRole('status', { name: 'Plan ready' })).toHaveTextContent(
    'Ship the retry queue',
  )
  expect(screen.getByRole('button', { name: 'Implement' })).toBeEnabled()
})

test('typed feedback turns the same action into a refinement', async () => {
  renderBanner()

  useChatInputDraftStore.getState().setPrompt(draftTarget, 'drop step 2')

  expect(await screen.findByRole('button', { name: 'Refine' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Implement' })).not.toBeInTheDocument()
})

test('implementing starts a turn that points back at the plan it came from', async () => {
  const { dispatched } = renderBanner()

  await userEvent.click(screen.getByRole('button', { name: 'Implement' }))

  expect(dispatched).toHaveLength(1)
  expect(dispatched[0]).toMatchObject({
    interactionMode: 'default',
    sourceProposedPlan: { planId: 'plan-1', threadId: 'thread-1' },
    threadId: 'thread-1',
    type: 'thread.turn.start',
  })
})

test('the implementation turn carries the plan itself as the prompt', async () => {
  const { dispatched } = renderBanner()

  await userEvent.click(screen.getByRole('button', { name: 'Implement' }))

  const command = dispatched[0]
  expect(command?.type === 'thread.turn.start' && command.message.text).toContain(
    'Drain it on boot',
  )
})

test('refining stays in plan mode and never claims the plan was implemented', async () => {
  const { dispatched } = renderBanner()
  useChatInputDraftStore.getState().setPrompt(draftTarget, 'drop step 2')

  await userEvent.click(await screen.findByRole('button', { name: 'Refine' }))

  expect(dispatched[0]).toMatchObject({
    interactionMode: 'plan',
    message: { text: 'drop step 2' },
    type: 'thread.turn.start',
  })
  expect(dispatched[0]).not.toHaveProperty('sourceProposedPlan', expect.anything())
})

test('a sent follow-up leaves the composer draft empty', async () => {
  renderBanner()
  useChatInputDraftStore.getState().setPrompt(draftTarget, 'drop step 2')

  await userEvent.click(await screen.findByRole('button', { name: 'Refine' }))

  expect(useChatInputDraftStore.getState().getDraft(draftTarget).prompt).toBe('')
})

test('an implemented plan offers nothing — the loop is closed', () => {
  renderBanner({ plan: { implementedAt: '2026-05-28T00:00:09.000Z' } })

  expect(screen.queryByRole('status', { name: 'Plan ready' })).not.toBeInTheDocument()
})

test('a thread already running a turn hides the action so no duplicate build starts', () => {
  renderBanner({ busy: true })

  expect(screen.queryByRole('button', { name: 'Implement' })).not.toBeInTheDocument()
})

test('a plan can be built in a thread of its own, seeded with the plan itself', async () => {
  const { dispatched } = renderBanner()

  await userEvent.click(screen.getByRole('button', { name: 'Implement in a new thread' }))

  const command = dispatched[0]
  expect(command).toMatchObject({
    bootstrap: {
      createThread: { projectId: 'project-1', title: 'Implement Ship the retry queue' },
    },
    interactionMode: 'default',
    sourceProposedPlan: { planId: 'plan-1', threadId: 'thread-1' },
    type: 'thread.turn.start',
  })
  expect(command?.type === 'thread.turn.start' && command.message.text).toContain(
    'Drain it on boot',
  )
  expect(command?.type === 'thread.turn.start' && command.threadId).not.toBe(THREAD_ID)
})

test('the thread a plan was split into is handed to the host to show', async () => {
  const { created, dispatched } = renderBanner()

  await userEvent.click(screen.getByRole('button', { name: 'Implement in a new thread' }))

  // Reported rather than selected here: the sidebar panel and the chat stage
  // keep their selection in different places, and only the host knows which.
  const command = dispatched[0]
  expect(created).toEqual([command?.type === 'thread.turn.start' ? command.threadId : null])
})

test('a rejected split leaves the stage on the thread that has the plan', async () => {
  const { created } = renderBanner({ dispatch: () => Promise.reject(new Error('offline')) })

  await userEvent.click(screen.getByRole('button', { name: 'Implement in a new thread' }))

  // No thread was created, so nothing should be handed over to show.
  expect(created).toEqual([])
  expect(await screen.findByRole('button', { name: 'Implement in a new thread' })).toBeEnabled()
})

test('typed feedback withdraws the new-thread action — there is no plan to build yet', async () => {
  renderBanner()

  useChatInputDraftStore.getState().setPrompt(draftTarget, 'drop step 2')

  expect(await screen.findByRole('button', { name: 'Refine' })).toBeEnabled()
  expect(
    screen.queryByRole('button', { name: 'Implement in a new thread' }),
  ).not.toBeInTheDocument()
})

test('a rejected dispatch drops the optimistic message so the timeline stays honest', async () => {
  renderBanner({ dispatch: () => Promise.reject(new Error('offline')) })

  await userEvent.click(screen.getByRole('button', { name: 'Implement' }))

  expect(
    Object.keys(useChatOptimisticStore.getState().messagesByThreadId[THREAD_ID] ?? {}),
  ).toHaveLength(0)
  expect(await screen.findByRole('button', { name: 'Implement' })).toBeEnabled()
})

function renderBanner({
  busy = false,
  dispatch,
  plan: planOverrides,
}: {
  busy?: boolean
  dispatch?: () => Promise<{ deduped: boolean; sequence: number }>
  plan?: Partial<OrchestrationProposedPlan>
} = {}) {
  resetChatInputDraftStore()
  useChatOptimisticStore.setState({ messagesByThreadId: {} })
  useChatProjectionStore.getState().resetChatProjection()

  // The factory's default thread is mid-turn, which is exactly the busy case.
  const seeded = threadFactory(busy ? {} : { latestTurn: null, session: null })
  const snapshot: OrchestrationThreadDetailSnapshot = {
    checkpoints: [],
    proposedPlans: [proposedPlan(planOverrides)],
    snapshotSequence: 1,
    // The store's ChatThread drops `deletedAt`; the wire snapshot still carries it.
    thread: { ...seeded, deletedAt: null },
  }
  useChatProjectionStore.getState().syncThreadDetailSnapshot(snapshot)

  const created: ThreadId[] = []
  const dispatched: ClientOrchestrationCommand[] = []
  const environment = unsupportedChatEnvironment({
    dispatchCommand: async (command) => {
      dispatched.push(command)
      if (dispatch) return dispatch()

      return { deduped: false, sequence: 1 }
    },
    replayEvents: async () => ({ events: [] }),
    shellStream: async function* () {},
    threadDetailSnapshot: async () => snapshot,
    threadDetailStream: async function* () {},
  })

  renderWithProviders(
    <ChatPlanFollowUpProvider
      draftTarget={draftTarget}
      environment={environment}
      threadId={seeded.id}
      onThreadCreated={(threadId) => created.push(threadId)}
    >
      <PlanFollowUpBanner draftTarget={draftTarget} />
    </ChatPlanFollowUpProvider>,
  )

  return { created, dispatched }
}

function proposedPlan(
  overrides: Partial<OrchestrationProposedPlan> = {},
): OrchestrationProposedPlan {
  return {
    createdAt: '2026-05-28T00:00:02.000Z',
    id: v.parse(proposedPlanIdSchema, 'plan-1'),
    implementationThreadId: null,
    implementedAt: null,
    planMarkdown: PLAN_MARKDOWN,
    threadId: THREAD_ID,
    turnId: 'turn-1',
    updatedAt: '2026-05-28T00:00:02.000Z',
    ...overrides,
  } as OrchestrationProposedPlan
}
