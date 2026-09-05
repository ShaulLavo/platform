import { createInitialChatProjectionSlice } from '@/features/chat/state/chat-projection-store'
import { syncChatProjectionShellSnapshot } from '@/features/chat/state/chat-projection-writers'
import type { SessionRailEnvironment } from '@/features/chat-mode/utils/session-rail-model'
import { sessionShell, shellSnapshot, TEST_ENVIRONMENT_ID } from './chat'

export function railEnvironment(
  overrides: Partial<SessionRailEnvironment> = {},
  sessions = [
    sessionShell({
      attentionState: 'settled',
      attentionReason: null,
      latestTurn: null,
      runtime: null,
    }),
  ],
): SessionRailEnvironment {
  return {
    environmentId: TEST_ENVIRONMENT_ID,
    label: 'Primary',
    isPrimary: true,
    slice: syncChatProjectionShellSnapshot(
      createInitialChatProjectionSlice(),
      shellSnapshot({ sessions }),
    ),
    ...overrides,
  }
}
