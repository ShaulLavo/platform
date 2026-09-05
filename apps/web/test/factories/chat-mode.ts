import { createInitialChatProjectionSlice } from '@/features/chat/state/chat-projection-store'
import { syncChatProjectionShellSnapshot } from '@/features/chat/state/chat-projection-writers'
import {
  selectChatProjects,
  selectChatSessions,
  selectChatWorktrees,
} from '@/features/chat/state/chat-projection-selectors'
import type { ChatProjectionSlice } from '@/features/chat/state/chat-projection-store'
import type { SessionRailEnvironment } from '@/features/chat-mode/utils/session-rail-model'
import { sessionShell, shellSnapshot, TEST_ENVIRONMENT_ID } from './chat'

export function railEnvironment(
  overrides: Partial<SessionRailEnvironment> & { slice?: ChatProjectionSlice } = {},
  sessions = [
    sessionShell({
      attentionState: 'settled',
      attentionReason: null,
      latestTurn: null,
      runtime: null,
    }),
  ],
): SessionRailEnvironment {
  const slice =
    overrides.slice ??
    syncChatProjectionShellSnapshot(createInitialChatProjectionSlice(), shellSnapshot({ sessions }))
  return {
    environmentId: TEST_ENVIRONMENT_ID,
    label: 'Primary',
    isPrimary: true,
    phase: 'live',
    projects: selectChatProjects(slice),
    worktrees: selectChatWorktrees(slice),
    sessions: selectChatSessions(slice),
    ...overrides,
  }
}
