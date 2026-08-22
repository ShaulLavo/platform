import type { OrchestrationProjectShell, ProjectId, ThreadId } from '@workspace/contracts'
import { createContext, use } from 'react'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import type { ProjectionThread } from '@/features/chat/state/chat-projection-store'
import type { ActiveSession } from '@/features/chat-mode/utils/active-session'
import { clientErrors } from '@/lib/structured-errors'

export type ChatModeSession = {
  readonly activeSession: ActiveSession
  readonly environment: ChatEnvironment
  readonly error: string | null
  /** Opens the folder picker so a directory can join the rail as a project. */
  readonly addProject: () => void
  readonly openProject: (workspaceRoot: string) => void
  readonly project: OrchestrationProjectShell | null
  readonly ready: boolean
  /** True while a retry is in flight, so the button can say so instead of doing nothing. */
  readonly retrying: boolean
  /** Asks the server again for this workspace's project. The way out of a failed first run. */
  readonly retryProject: () => void
  /** The active project's workspace root — what chat sends, not where the editor is. */
  readonly rootPath: string
  readonly selectSession: (projectId: ProjectId, threadId: ThreadId) => void
  readonly startDraft: (projectId: ProjectId) => void
  readonly threads: readonly ProjectionThread[]
}

export const ChatModeSessionContext = createContext<ChatModeSession | null>(null)

/**
 * The session when there is one, `null` when there is not.
 *
 * For surfaces that render outside chat mode. `AppCommandSurface` — and so the
 * command palette — is a sibling of `WorkspaceView`, not a descendant, so it
 * mounts above `ChatModeSessionProvider` in both layouts. Anything it reaches
 * has to cope with the provider being absent rather than throw the whole palette
 * away.
 */
export function useOptionalChatModeSession() {
  return use(ChatModeSessionContext)
}

export function useChatModeSession() {
  const session = use(ChatModeSessionContext)
  if (!session) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useChatModeSession must be used within ChatModeSessionProvider',
    })
  }

  return session
}
