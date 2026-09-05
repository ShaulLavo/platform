import { StrictMode } from 'react'
import { act } from '@testing-library/react'
import { ChatTransportProvider } from '@/features/chat/providers/transport-provider'
import { useChatTransport } from '@/features/chat/hooks/use-chat-transport'
import { registerChatTransport } from '@/features/chat/state/active-transports'
import { createChatTransport } from '@/features/chat/transport/create-chat-transport'
import { activeServerOrigin } from '@/lib/client'
import { useEnvironmentsStore } from '@/lib/environments/state/store'
import { selectServerConnection } from '@workspace/client-core/environments/state/store'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

function TransportProbe() {
  const transport = useChatTransport()
  return <span>{transport.closed ? 'closed' : 'ready'}</span>
}

test('StrictMode and workbench unmount preserve the application-owned transport until disconnect', () => {
  const transport = createChatTransport(activeServerOrigin())
  const disconnect = registerChatTransport(transport)
  const view = renderWithProviders(
    <StrictMode>
      <ChatTransportProvider>
        <TransportProbe />
      </ChatTransportProvider>
    </StrictMode>,
  )
  expect(view.getByText('ready')).toBeTruthy()
  view.unmount()
  expect(transport.closed).toBe(false)
  disconnect()
  expect(transport.closed).toBe(true)
})

test('identity drift keeps the retained chat readable', () => {
  const previous = useEnvironmentsStore.getState()
  const origin = activeServerOrigin()
  const transport = createChatTransport(origin)
  const disconnect = registerChatTransport(transport)
  const view = renderWithProviders(
    <ChatTransportProvider>
      <TransportProbe />
    </ChatTransportProvider>,
  )
  try {
    act(() => {
      useEnvironmentsStore.setState({
        connectionByOrigin: {
          ...previous.connectionByOrigin,
          [origin]: {
            ...selectServerConnection(previous, origin),
            phase: 'identity-drift',
            expected: transport.environmentId,
            received: 'replacement',
          },
        },
      })
    })
    view.rerender(
      <ChatTransportProvider>
        <TransportProbe />
      </ChatTransportProvider>,
    )
    expect(view.getByText('ready')).toBeTruthy()
  } finally {
    view.unmount()
    disconnect()
    useEnvironmentsStore.setState(previous, true)
  }
})
