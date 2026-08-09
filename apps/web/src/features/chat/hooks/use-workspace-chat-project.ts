import type { OrchestrationProjectShell } from '@workspace/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'

import { errorMessage } from '@/lib/error-message'
import type { ChatEnvironment } from '../environment/chat-environment'
import { createWorkspaceProjectCommand, workspaceProjectId } from '../lib/chat-command-builders'
import { selectChatProjects } from '../state/chat-projection-selectors'
import { useChatProjectionStore } from '../state/chat-projection-store'

export type WorkspaceChatProjectState = {
  error: string | null
  project: OrchestrationProjectShell | null
  status: 'ready' | 'waiting'
}

type ProjectFailure = { message: string; projectId: string }

export function useWorkspaceChatProject({
  environment,
  rootPath,
}: {
  environment: ChatEnvironment
  rootPath: string
}): WorkspaceChatProjectState {
  const projects = useChatProjectionStore(selectChatProjects)
  const bootstrapComplete = useChatProjectionStore((state) => state.bootstrapComplete)
  const [failure, setFailure] = useState<ProjectFailure | null>(null)
  const dispatchedProjectId = useRef<string | null>(null)
  const projectId = useMemo(() => workspaceProjectId(rootPath), [rootPath])
  const project = projects.find((candidate) => candidate.id === projectId) ?? null

  useEffect(() => {
    if (!bootstrapComplete) return
    if (project) return
    if (dispatchedProjectId.current === projectId) return

    dispatchedProjectId.current = projectId
    void createWorkspaceProject({ environment, projectId, rootPath, setFailure })
  }, [bootstrapComplete, environment, project, projectId, rootPath])

  return {
    error: failure?.projectId === projectId ? failure.message : null,
    project,
    status: project ? 'ready' : 'waiting',
  }
}

async function createWorkspaceProject({
  environment,
  projectId,
  rootPath,
  setFailure,
}: {
  environment: ChatEnvironment
  projectId: string
  rootPath: string
  setFailure: (failure: ProjectFailure) => void
}) {
  try {
    await environment.dispatchCommand(createWorkspaceProjectCommand({ rootPath }))
  } catch (error) {
    setFailure({
      message: errorMessage(error, 'Could not prepare chat for this workspace.'),
      projectId,
    })
  }
}
