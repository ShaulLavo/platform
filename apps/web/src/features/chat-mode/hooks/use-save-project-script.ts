import type { OrchestrationProjectScript } from '@workspace/contracts'

import { createProjectScriptsCommand } from '@/features/chat/lib/chat-command-builders'
import { notifyChatCommandError } from '@/features/chat/notify-command-error'
import { selectChatProjects } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { useOptionalChatModeSession } from '@/features/chat-mode/providers/session-context'

/**
 * Promotes a script the user actually ran into the project's saved list.
 *
 * Without a writer, `project.scripts` could only ever be empty and the palette's
 * "Project Scripts" group was permanently dead UI. This is the cheapest honest
 * writer: the list becomes "the commands you run in this project", which is
 * useful on its own and needs no editor to exist first.
 *
 * Deliberately not silent about ordering — a re-run moves the script to the
 * front, so the group reads most-recent-first and the thing you keep running is
 * the thing at the top.
 */
export function useSaveProjectScript() {
  // Optional, not required: the command palette calls this, and the palette
  // mounts above `ChatModeSessionProvider` in both layouts. Demanding the
  // provider here took the whole palette down with a CONTEXT_MISSING error.
  // There is no project to save a script to without a session, so the writer is
  // simply inert — which is what the caller already handles for a missing
  // project.
  const session = useOptionalChatModeSession()
  const projects = useChatProjectionStore(selectChatProjects)

  return (script: OrchestrationProjectScript) => {
    if (!session) return

    const { environment, rootPath } = session
    const project = projects.find((candidate) => candidate.workspaceRoot === rootPath)
    if (!project) return

    // Nothing to write when it is already at the front: an event per run of the
    // same script is churn the projection would broadcast to every client for
    // no visible change.
    if (project.scripts[0]?.command === script.command) return

    const remaining = project.scripts.filter((saved) => saved.command !== script.command)

    void environment
      .dispatchCommand(
        createProjectScriptsCommand({
          projectId: project.id,
          scripts: [script, ...remaining],
        }),
      )
      .catch((error: unknown) => notifyChatCommandError(error, 'Could not save the project script'))
  }
}
