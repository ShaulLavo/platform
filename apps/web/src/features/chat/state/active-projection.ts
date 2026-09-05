import { activeEnvironmentId } from '@/lib/environments/state/domain'
import {
  selectChatProjectionSlice,
  useChatProjectionStore,
} from '@/features/chat/state/chat-projection-store'

export function activeChatProjection() {
  return selectChatProjectionSlice(useChatProjectionStore.getState(), activeEnvironmentId())
}
