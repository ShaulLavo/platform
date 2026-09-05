import { useEnvironmentId } from '@/lib/environments/hooks/use-environment-id'
import {
  selectChatProjectionSlice,
  useChatProjectionStore,
  type ChatProjectionSlice,
} from '@/features/chat/state/chat-projection-store'

export function useActiveChatProjection<T>(selector: (slice: ChatProjectionSlice) => T): T {
  const environmentId = useEnvironmentId()
  return useChatProjectionStore((state) =>
    selector(selectChatProjectionSlice(state, environmentId)),
  )
}
