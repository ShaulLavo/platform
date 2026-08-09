import type { OrchestrationProjectShell, ProjectId, ThreadId } from '@workspace/contracts'
import { createContext, use } from 'react'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import type { ChatSidebarThreadSummary } from '@/features/chat/state/chat-projection-store'
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
  /** The active project's workspace root — what chat sends, not where the editor is. */
  readonly rootPath: string
  readonly selectSession: (projectId: ProjectId, threadId: ThreadId) => void
  readonly startDraft: (projectId: ProjectId) => void
  readonly threads: readonly ChatSidebarThreadSummary[]
}

export const ChatModeSessionContext = createContext<ChatModeSession | null>(null)

export function useChatModeSession() {
  const session = use(ChatModeSessionContext)
  if (!session) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useChatModeSession must be used within ChatModeSessionProvider',
    })
  }

  return session
}
