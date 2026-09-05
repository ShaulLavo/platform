import type { OrchestrationProjectShell } from '@workspace/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'

import { errorMessage } from '@/lib/error-message'
import type { ChatTransport } from '@/features/chat/transport/chat-transport'
import {
  createWorkspaceProjectCommand,
  workspaceProjectId,
} from '@/features/chat/utils/command-builders'
import { selectChatProjects } from '../state/chat-projection-selectors'
import { useChatProjectionStore } from '../state/chat-projection-store'

export type WorkspaceChatProjectState = {
  error: string | null
  project: OrchestrationProjectShell | null
  status: 'ready' | 'waiting'
}

type ProjectFailure = { message: string; projectId: string; transport: ChatTransport }

export function useWorkspaceChatProject({
  transport,
  rootPath,
}: {
  transport: ChatTransport
  rootPath: string
}): WorkspaceChatProjectState {
  const projects = useChatProjectionStore(selectChatProjects)
  const bootstrapComplete = useChatProjectionStore((state) => state.bootstrapComplete)
  const [failure, setFailure] = useState<ProjectFailure | null>(null)
  const dispatchedProject = useRef<{ projectId: string; transport: ChatTransport } | null>(null)
  const projectId = useMemo(() => workspaceProjectId(rootPath), [rootPath])
  const project = projects.find((candidate) => candidate.id === projectId) ?? null

  useEffect(() => {
    if (!bootstrapComplete) return
    if (project) return
    if (
      dispatchedProject.current?.projectId === projectId &&
      dispatchedProject.current.transport === transport
    )
      return

    dispatchedProject.current = { projectId, transport }
    void createWorkspaceProject({ transport, projectId, rootPath, setFailure })
  }, [bootstrapComplete, transport, project, projectId, rootPath])

  return {
    error:
      failure?.projectId === projectId && failure.transport === transport ? failure.message : null,
    project,
    status: project ? 'ready' : 'waiting',
  }
}

async function createWorkspaceProject({
  transport,
  projectId,
  rootPath,
  setFailure,
}: {
  transport: ChatTransport
  projectId: string
  rootPath: string
  setFailure: (failure: ProjectFailure) => void
}) {
  try {
    await transport.dispatchCommand(createWorkspaceProjectCommand({ rootPath }))
  } catch (error) {
    if (transport.closed) return
    setFailure({
      transport,
      message: errorMessage(error, 'Could not prepare chat for this workspace.'),
      projectId,
    })
  }
}
