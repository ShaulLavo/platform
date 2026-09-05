import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { railEnvironments } from '@/features/chat-mode/state/rail-environments'
import { useEnvironmentsStore } from '@/lib/environments/state/store'

export function useRailEnvironments() {
  const projection = useChatProjectionStore((state) => state)
  const environments = useEnvironmentsStore((state) => state)
  return railEnvironments(projection, environments)
}
