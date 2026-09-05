import { TEST_ENVIRONMENT_ID as FIXTURE_ENVIRONMENT_ID } from '../../../../../test/factories/chat'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { sessionIdSchema, type ClientOrchestrationCommand } from '@workspace/contracts'
import { screen } from '@testing-library/react'
import { createRef } from 'react'
import * as v from 'valibot'
import { afterEach, beforeEach } from 'vitest'

import { ChatInputActions } from '@/features/chat/components/chat-input-actions'
import { providerListQueryOptions } from '@/features/chat/utils/provider-query'
import { ChatComposerModesProvider } from '@/features/chat/providers/composer-modes-provider'
import { ChatModelPickerProvider } from '@/features/chat/providers/model-picker-provider'
import { ChatProviderSignInProvider } from '@/features/chat/providers/provider-sign-in-provider'
import {
  resetChatInputDraftStore,
  type ChatInputDraftTarget,
} from '@/features/chat/state/chat-input-draft-store'
import { expect, test } from '../../../../../test/fixtures'
import { createTestQueryClient, renderWithProviders } from '../../../../../test/render'

const sessionId = v.parse(sessionIdSchema, 'd587e342-74d2-5b84-b545-b7a49b2bae30')
const draftTarget: ChatInputDraftTarget = {
  environmentId: FIXTURE_ENVIRONMENT_ID,
  draftKey: sessionId,
  rootPath: '/repo/platform',
}
const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')

let measuredWidth = 800

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return measuredWidth
    },
  })
})

afterEach(() => {
  if (!clientWidthDescriptor) return

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidthDescriptor)
})

test('a wide composer keeps the status on the control row', () => {
  measuredWidth = 800
  const { container } = renderActions()

  const row = actionsRow(container)
  expect(row).toHaveAttribute('data-compact', 'false')
  // One line: the status shares the row with the controls.
  expect(row?.childElementCount).toBe(1)
  expect(screen.getByTitle('Working')).toBeVisible()
})

test('a narrow composer compacts rather than squeezing the controls', () => {
  // The side panel is ~300px: the row cannot hold its labels and the send
  // button at once, and a viewport breakpoint cannot see that.
  measuredWidth = 300
  const { container } = renderActions()

  const row = actionsRow(container)
  expect(row).toHaveAttribute('data-compact', 'true')
  // The status wraps onto its own line rather than disappearing — it is the only
  // place a send failure is ever reported.
  expect(row?.childElementCount).toBe(2)
  expect(row?.lastElementChild).toHaveTextContent('Working')
})

function actionsRow(container: HTMLElement) {
  return container.querySelector('[data-composer-actions]')
}

function renderActions() {
  resetChatInputDraftStore()

  const queryClient = createTestQueryClient()
  queryClient.setQueryData(providerListQueryOptions().queryKey, { providers: [] })

  async function dispatchCommand(_command: ClientOrchestrationCommand) {
    return { result: null, deduped: false, sequence: 1 }
  }

  return renderWithProviders(
    <ChatProviderSignInProvider>
      <ChatComposerModesProvider
        dispatchCommand={dispatchCommand}
        draftTarget={draftTarget}
        sessionId={sessionId}
      >
        <ChatModelPickerProvider
          draftTarget={draftTarget}
          locked={false}
          modelSelection={null}
          persistModelSelection={() => {}}
        >
          <LexicalComposer
            initialConfig={{
              namespace: 'chat-input-actions-test',
              onError: (error) => {
                throw error
              },
            }}
          >
            <ChatInputActions
              busy={false}
              disabled={false}
              draftTarget={draftTarget}
              interactionMode='default'
              runtimeMode='full-access'
              sendButtonRef={createRef<HTMLButtonElement>()}
              sendDisabled={false}
              statusLabel='Working'
              onSelectImageFiles={() => {}}
              onStop={() => {}}
              onSubmit={async () => true}
            />
          </LexicalComposer>
        </ChatModelPickerProvider>
      </ChatComposerModesProvider>
    </ChatProviderSignInProvider>,
    { queryClient },
  )
}
