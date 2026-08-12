import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { useChatModeSession } from '@/features/chat-mode/providers/session-context'

/**
 * The checkout the session's tools should act on.
 *
 * A session may run in its own worktree, which is a different directory on a
 * different branch than the project root. Pointing the terminal, the changes
 * panel or the file tree at the root while the agent works in a worktree makes
 * `git status`, `git diff` and every test command report on files the session
 * never touched — and it does it silently, which is the worst version.
 *
 * Falls back to the project root, which is also what `worktreePath` holds for
 * every session that has no worktree of its own.
 */
export function useSessionToolRoot() {
  const { activeSession, rootPath } = useChatModeSession()
  const worktreePath = useChatProjectionStore((state) =>
    activeSession.threadId
      ? (state.sidebarThreadSummaryById[activeSession.threadId]?.worktreePath ?? null)
      : null,
  )

  return worktreePath ?? rootPath
}
