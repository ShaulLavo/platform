import { TEST_ENVIRONMENT_ID as FIXTURE_ENVIRONMENT_ID } from '../../../../../test/factories/chat'
import {
  sessionIdSchema,
  type ClientOrchestrationCommand,
  type InteractionMode,
  type RuntimeMode,
} from '@workspace/contracts'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as v from 'valibot'

import { ComposerControlsMenu } from '@/features/chat/components/composer-controls-menu'
import { ChatComposerModesProvider } from '@/features/chat/providers/composer-modes-provider'
import {
  resetChatInputDraftStore,
  useChatInputDraftStore,
  type ChatInputDraftTarget,
} from '@/features/chat/state/chat-input-draft-store'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

const sessionId = v.parse(sessionIdSchema, '0b1cf4bb-c595-5929-9994-7174e9f096ef')
const draftTarget: ChatInputDraftTarget = {
  environmentId: FIXTURE_ENVIRONMENT_ID,
  draftKey: sessionId,
  rootPath: '/repo/platform',
}

test('the trigger reports the session values while the draft has no override', () => {
  renderMenu()

  expect(trigger()).toHaveTextContent('Full access')
  expect(trigger()).not.toHaveTextContent('Plan')
})

test('choosing an access level writes it to the draft and back onto the trigger', async () => {
  renderMenu()

  await openMenu()
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /Ask first/ }))

  expect(draft().runtimeMode).toBe('approval-required')
  expect(trigger()).toHaveTextContent('Ask first')
})

test('choosing an access level also sets it on the session itself', async () => {
  const { dispatched } = renderMenu()

  await openMenu()
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /Ask first/ }))

  expect(dispatched).toHaveLength(1)
  expect(dispatched[0]).toMatchObject({
    runtimeMode: 'approval-required',
    sessionId,
    type: 'session.runtime-mode.set',
  })
})

test('plan mode lands in the draft and shows on the composer', async () => {
  renderMenu()

  await openMenu()
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /Plan/ }))

  expect(draft().interactionMode).toBe('plan')
  expect(trigger()).toHaveTextContent('Plan')
})

test('plan mode is set on the session, not only on the next turn', async () => {
  const { dispatched } = renderMenu()

  await openMenu()
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /Plan/ }))

  expect(dispatched[0]).toMatchObject({
    interactionMode: 'plan',
    sessionId,
    type: 'session.interaction-mode.set',
  })
})

test('a rejected session sync leaves the pick on the composer so the turn still carries it', async () => {
  renderMenu({}, () => Promise.reject(new Error('offline')))

  await openMenu()
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /Ask first/ }))

  expect(draft().runtimeMode).toBe('approval-required')
  expect(await screen.findByRole('button', { name: 'Agent access and mode' })).toHaveTextContent(
    'Ask first',
  )
})

test('an override survives a reopen as the checked option', async () => {
  renderMenu({ interactionMode: 'plan', runtimeMode: 'approval-required' })

  await openMenu()
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /Auto-accept edits/ }))
  await userEvent.keyboard('{Escape}')
  await openMenu()

  const checked = await screen.findAllByRole('menuitemradio', { checked: true })
  expect(checked.map((item) => item.textContent)).toEqual([
    expect.stringContaining('Auto-accept edits'),
    expect.stringContaining('Plan'),
  ])
})

function renderMenu(
  session: { interactionMode?: InteractionMode; runtimeMode?: RuntimeMode } = {},
  dispatch?: () => Promise<{ result: null; deduped: boolean; sequence: number }>,
) {
  resetChatInputDraftStore()

  const dispatched: ClientOrchestrationCommand[] = []
  const dispatchCommand = async (command: ClientOrchestrationCommand) => {
    dispatched.push(command)
    if (dispatch) return dispatch()

    return { result: null, deduped: false, sequence: 1 }
  }

  renderWithProviders(
    <ChatComposerModesProvider
      dispatchCommand={dispatchCommand}
      draftTarget={draftTarget}
      sessionId={sessionId}
    >
      <ComposerControlsMenu
        disabled={false}
        draftTarget={draftTarget}
        interactionMode={session.interactionMode ?? 'default'}
        runtimeMode={session.runtimeMode ?? 'full-access'}
      />
    </ChatComposerModesProvider>,
  )

  return { dispatched }
}

function trigger() {
  return screen.getByRole('button', { name: 'Agent access and mode' })
}

async function openMenu() {
  await userEvent.click(trigger())
}

function draft() {
  return useChatInputDraftStore.getState().getDraft(draftTarget)
}
