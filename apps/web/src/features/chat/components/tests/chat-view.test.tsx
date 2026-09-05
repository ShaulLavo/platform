import { act, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { messageIdSchema } from '@workspace/contracts'
import * as v from 'valibot'
import { FakeOrchestrationSocket } from '@workspace/client-core/test/orchestration-socket'
import { registerChatTransport } from '@/features/chat/state/active-transports'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { initializePromptStashStore } from '@/features/chat/state/prompt-stash-store'
import { environmentScopedStorage } from '@/lib/environments/state/scoped-storage'
import { createChatTransport } from '@/features/chat/transport/create-chat-transport'
import { activeServerOrigin } from '@/lib/client'
import { expect, test } from '../../../../../test/fixtures'
import {
  chatMessage,
  session,
  shellSnapshot,
  TEST_ENVIRONMENT_ID,
} from '../../../../../test/factories/chat'
import { renderCachedChatSelection } from '../../../../../test/factories/chat-view'

test('selecting a cached session keeps its transcript readable and resumes detail when a live transport returns', async () => {
  const previousProjection = useChatProjectionStore.getState()
  initializePromptStashStore(environmentScopedStorage(TEST_ENVIRONMENT_ID))
  const cached = session({
    latestTurn: null,
    runtime: null,
    messages: [chatMessage({ role: 'user', text: 'Cached question' })],
  })
  useChatProjectionStore.getState().syncShellSnapshot(
    TEST_ENVIRONMENT_ID,
    shellSnapshot({
      projects: [cached.project],
      worktrees: [cached.worktree],
      sessions: [cached],
    }),
  )
  useChatProjectionStore.getState().syncSessionDetailSnapshot(TEST_ENVIRONMENT_ID, {
    checkpoints: [],
    proposedPlans: [],
    snapshotSequence: 1,
    session: { ...cached, deletedAt: null, deletion: null },
  })
  const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  const socket = new FakeOrchestrationSocket()
  const createSocket = vi.fn(() => socket)
  const closed = createChatTransport(activeServerOrigin(), { createSocket })
  closed.close()
  let disconnect = registerChatTransport(closed)
  const view = renderCachedChatSelection(cached.id)
  try {
    fireEvent.click(view.getByRole('button', { name: 'Open cached session' }))
    expect(view.getByText('Cached question')).toBeInTheDocument()
    expect(createSocket).not.toHaveBeenCalled()
    const live = createChatTransport(activeServerOrigin(), { createSocket })
    act(() => {
      disconnect = registerChatTransport(live)
    })
    expect(createSocket).toHaveBeenCalledTimes(1)
    act(() => socket.open())
    await waitFor(() =>
      expect(socket.sent.map((frame) => JSON.parse(frame))).toContainEqual(
        expect.objectContaining({
          method: 'subscribeSession',
          sessionId: cached.id,
          afterSequence: 1,
        }),
      ),
    )
    expect(view.getByText('Cached question')).toBeInTheDocument()
    const subscription = JSON.parse(socket.sent[0]!)
    act(() =>
      socket.deliver({
        kind: 'subscription.next',
        subscriptionId: subscription.subscriptionId,
        item: {
          kind: 'snapshot',
          snapshot: {
            checkpoints: [],
            proposedPlans: [],
            snapshotSequence: 2,
            session: {
              ...cached,
              deletedAt: null,
              deletion: null,
              messages: [
                ...cached.messages,
                chatMessage({
                  id: v.parse(messageIdSchema, 'recovered-message'),
                  text: 'Recovered reply',
                }),
              ],
            },
          },
        },
      }),
    )
    await waitFor(() => expect(view.getByText('Recovered reply')).toBeInTheDocument())
  } finally {
    view.unmount()
    disconnect()
    height.mockRestore()
    useChatProjectionStore.setState(previousProjection, true)
  }
})
