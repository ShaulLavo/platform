import type { ProjectId } from '@workspace/contracts'

import { createSessionWorktree } from '@/features/git/api'
import { useSessionIsolationStore } from '@/features/chat-mode/state/session-isolation-store'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'

/**
 * Creates the checkout a session will run in, when the user asked for one.
 *
 * Returns null both when no isolation was requested and when preparing it
 * failed. A failure is surfaced and then the session starts against the project
 * root anyway: refusing to send would lose the message the user just typed, and
 * running in the shared root is the behaviour every session had until now — a
 * worse outcome than they asked for, not a broken one.
 *
 * The intent is consumed before the request, so a send that is retried after a
 * network error cannot ask for a second worktree.
 */
export function usePrepareSessionWorktree() {
  const consumeIsolation = useSessionIsolationStore((state) => state.consumeIsolation)

  return async ({ rootPath }: { projectId: ProjectId; rootPath: string }) => {
    if (!consumeIsolation()) return null

    try {
      const result = await createSessionWorktree({
        // The session id the worktree is named after: one per project-scoped
        // draft, and the service is idempotent on it.
        path: rootPath,
        sessionId: `draft-${crypto.randomUUID()}`,
      })

      return { branch: result.worktree.branch, path: result.worktree.absolutePath }
    } catch (error) {
      reportError(toClientError(error))

      return null
    }
  }
}
