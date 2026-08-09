import {
  threadIdSchema,
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

const threadId = v.parse(threadIdSchema, 'thread-composer-controls')
const draftTarget: ChatInputDraftTarget = {
  draftKey: threadId,
  rootPath: '/repo/platform',
}

test('the trigger reports the thread values while the draft has no override', () => {
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

test('choosing an access level also sets it on the thread itself', async () => {
  const { dispatched } = renderMenu()

  await openMenu()
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /Ask first/ }))

  expect(dispatched).toHaveLength(1)
  expect(dispatched[0]).toMatchObject({
    runtimeMode: 'approval-required',
    threadId,
    type: 'thread.runtime-mode.set',
  })
})

test('plan mode lands in the draft and shows on the composer', async () => {
  renderMenu()

  await openMenu()
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /Plan/ }))

  expect(draft().interactionMode).toBe('plan')
  expect(trigger()).toHaveTextContent('Plan')
})

test('plan mode is set on the thread, not only on the next turn', async () => {
  const { dispatched } = renderMenu()

  await openMenu()
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /Plan/ }))

  expect(dispatched[0]).toMatchObject({
    interactionMode: 'plan',
    threadId,
    type: 'thread.interaction-mode.set',
  })
})

test('a rejected thread sync leaves the pick on the composer so the turn still carries it', async () => {
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
  thread: { interactionMode?: InteractionMode; runtimeMode?: RuntimeMode } = {},
  dispatch?: () => Promise<{ deduped: boolean; sequence: number }>,
) {
  resetChatInputDraftStore()

  const dispatched: ClientOrchestrationCommand[] = []
  const dispatchCommand = async (command: ClientOrchestrationCommand) => {
    dispatched.push(command)
    if (dispatch) return dispatch()

    return { deduped: false, sequence: 1 }
  }

  renderWithProviders(
    <ChatComposerModesProvider
      dispatchCommand={dispatchCommand}
      draftTarget={draftTarget}
      threadId={threadId}
    >
      <ComposerControlsMenu
        disabled={false}
        draftTarget={draftTarget}
        interactionMode={thread.interactionMode ?? 'default'}
        runtimeMode={thread.runtimeMode ?? 'full-access'}
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
