import { StrictMode, useEffect } from 'react'
import { waitFor } from '@testing-library/react'
import { ChatTransportProvider } from '@/features/chat/providers/transport-provider'
import { useChatTransport } from '@/features/chat/hooks/use-chat-transport'
import { closeChatTransportsForEnvironmentSwitch } from '@/features/chat/state/active-transports'
import type { ChatTransport } from '@/features/chat/transport/chat-transport'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

function TransportProbe({ observe }: { readonly observe: (transport: ChatTransport) => void }) {
  const transport = useChatTransport()
  useEffect(() => observe(transport), [observe, transport])
  return <span>{transport.closed ? 'closed' : 'ready'}</span>
}

test('StrictMode leaves a live transport and unmount permanently closes its owner', async () => {
  const seen: ChatTransport[] = []
  const observe = (transport: ChatTransport) => {
    seen.push(transport)
  }
  const view = renderWithProviders(
    <StrictMode>
      <ChatTransportProvider>
        <TransportProbe observe={observe} />
      </ChatTransportProvider>
    </StrictMode>,
  )
  await waitFor(() => expect(view.getByText('ready')).toBeTruthy())
  expect(seen.at(-1)?.closed).toBe(false)
  view.unmount()
  expect(seen.every((transport) => transport.closed)).toBe(true)
})

test('synchronous environment cleanup closes a mounted transport before React unmounts', async () => {
  const seen: ChatTransport[] = []
  const observe = (transport: ChatTransport) => {
    seen.push(transport)
  }
  const view = renderWithProviders(
    <ChatTransportProvider>
      <TransportProbe observe={observe} />
    </ChatTransportProvider>,
  )
  await waitFor(() => expect(seen.length).toBeGreaterThan(0))
  closeChatTransportsForEnvironmentSwitch()
  expect(seen.every((transport) => transport.closed)).toBe(true)
  view.unmount()
})
