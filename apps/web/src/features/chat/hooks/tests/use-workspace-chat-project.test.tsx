import {
  TEST_ENVIRONMENT_ID,
  TEST_PROJECT_ID,
  TEST_WORKTREE_ID,
  shellSnapshot,
} from '../../../../../test/factories/chat'
import { renderHook, waitFor } from '@testing-library/react'
import { useWorkspaceChatProject } from '@/features/chat/hooks/use-workspace-chat-project'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { unsupportedChatTransport } from '../../../../../test/factories/chat-transport'
import { expect, test } from '../../../../../test/fixtures'

test('a fresh transport prepares the same workspace again', async () => {
  useChatProjectionStore.getState().resetChatProjection()
  useChatProjectionStore
    .getState()
    .syncShellSnapshot(
      TEST_ENVIRONMENT_ID,
      shellSnapshot({ projects: [], worktrees: [], sessions: [] }),
    )
  const dispatched: string[] = []
  const transportA = unsupportedChatTransport({
    dispatchCommand: async () => {
      dispatched.push('A')
      return {
        result: {
          projectId: TEST_PROJECT_ID,
          worktreeId: TEST_WORKTREE_ID,
          disposition: 'existing-worktree' as const,
        },
        deduped: false,
        sequence: 1,
      }
    },
  })
  const transportB = unsupportedChatTransport({
    dispatchCommand: async () => {
      dispatched.push('B')
      return {
        result: {
          projectId: TEST_PROJECT_ID,
          worktreeId: TEST_WORKTREE_ID,
          disposition: 'existing-worktree' as const,
        },
        deduped: false,
        sequence: 1,
      }
    },
  })
  const view = renderHook(
    ({ transport }) => useWorkspaceChatProject({ transport, rootPath: '/workspace/shared' }),
    {
      initialProps: { transport: transportA },
    },
  )
  await waitFor(() => expect(dispatched).toEqual(['A']))
  view.rerender({ transport: transportB })
  await waitFor(() => expect(dispatched).toEqual(['A', 'B']))
  view.unmount()
  useChatProjectionStore.getState().resetChatProjection()
})
