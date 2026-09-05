import { useSyncExternalStore, type ReactNode } from 'react'
import { LoadingState } from '@workspace/ui/components/loading-state'
import { useEnvironmentId } from '@/lib/environments/hooks/use-environment-id'
import { transportFor, subscribeTransports } from '@/features/chat/state/active-transports'
import { ChatTransportContext } from '@/features/chat/providers/transport-context'

export function ChatTransportProvider({ children }: { readonly children: ReactNode }) {
  const environmentId = useEnvironmentId()
  const transport = useSyncExternalStore(subscribeTransports, () => transportFor(environmentId))
  if (!transport)
    return (
      <LoadingState label='Connecting chat'>
        <div className='skeleton-sweep h-4 w-48' />
      </LoadingState>
    )
  return <ChatTransportContext value={transport}>{children}</ChatTransportContext>
}
