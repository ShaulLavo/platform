import { useSyncExternalStore } from 'react'

import {
  recentCommandIds,
  subscribeRecentCommands,
} from '@/components/command-palette/state/recent-commands-store'

export function useRecentCommandIds() {
  return useSyncExternalStore(subscribeRecentCommands, recentCommandIds, recentCommandIds)
}
