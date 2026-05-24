import type { OrchestrationProjectShell } from '@workspace/contracts'
import { useEffect, useMemo, useState } from 'react'

import type { ChatEnvironment } from '../environment/chat-environment'
import { createWorkspaceProjectCommand, workspaceProjectId } from '../lib/chat-command-builders'
import { selectChatProjects } from '../state/chat-projection-selectors'
import { useChatProjectionStore } from '../state/chat-projection-store'

export type WorkspaceChatProjectState = {
  error: string | null
  project: OrchestrationProjectShell | null
  status: 'creating' | 'ready' | 'waiting'
}

export function useWorkspaceChatProject({
  environment,
  rootPath,
}: {
  environment: ChatEnvironment
  rootPath: string
}): WorkspaceChatProjectState {
  const projects = useChatProjectionStore(selectChatProjects)
  const bootstrapComplete = useChatProjectionStore((state) => state.bootstrapComplete)
  const [error, setError] = useState<string | null>(null)
  const [creatingProjectId, setCreatingProjectId] = useState<string | null>(null)
  const projectId = useMemo(() => workspaceProjectId(rootPath), [rootPath])
  const project = projects.find((candidate) => candidate.id === projectId) ?? null
  const status = project ? 'ready' : creatingProjectId === projectId ? 'creating' : 'waiting'

  useEffect(() => {
    setCreatingProjectId(null)
    setError(null)
  }, [projectId])

  useEffect(() => {
    if (!bootstrapComplete) return
    if (project) return
    if (creatingProjectId === projectId) return

    setCreatingProjectId(projectId)
    void createWorkspaceProject(environment, rootPath, setError)
  }, [bootstrapComplete, creatingProjectId, environment, project, projectId, rootPath])

  return {
    error,
    project,
    status,
  }
}

async function createWorkspaceProject(
  environment: ChatEnvironment,
  rootPath: string,
  setError: (message: string | null) => void,
) {
  try {
    await environment.dispatchCommand(
      createWorkspaceProjectCommand({
        createdAt: new Date().toISOString(),
        rootPath,
      }),
    )
  } catch (error) {
    setError(chatProjectErrorMessage(error))
  }
}

function chatProjectErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return 'Could not prepare chat for this workspace.'
}
