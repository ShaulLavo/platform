import { useSyncExternalStore } from 'react'

import {
  recentCommandIds,
  subscribeRecentCommands,
} from '@/features/command-palette/state/recent-commands-store'

export function useRecentCommandIds() {
  return useSyncExternalStore(subscribeRecentCommands, recentCommandIds, recentCommandIds)
}
