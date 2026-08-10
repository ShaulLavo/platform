import { useState } from 'react'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import { createWorkspaceProjectCommand } from '@/features/chat/lib/chat-command-builders'
import { log } from '@/lib/client-logging'
import { errorMessage } from '@/lib/error-message'

type ProjectRetryAttempt = {
  readonly error: string | null
  readonly retrying: boolean
}

const IDLE: ProjectRetryAttempt = { error: null, retrying: false }

/**
 * A second chance at preparing chat for this workspace. The first attempt happens once
 * per project id and never repeats itself, which is correct for an automatic retry and
 * useless to a user staring at a workspace that failed to open — the only thing that
 * ever fixes a first run is asking again.
 */
export function useProjectRetry({
  environment,
  rootPath,
}: {
  readonly environment: ChatEnvironment
  readonly rootPath: string
}) {
  const [attempt, setAttempt] = useState<ProjectRetryAttempt>(IDLE)

  function retryProject() {
    if (attempt.retrying) return

    setAttempt({ error: null, retrying: true })
    void requestWorkspaceProject({ environment, rootPath, setAttempt })
  }

  return { error: attempt.error, retrying: attempt.retrying, retryProject }
}

async function requestWorkspaceProject({
  environment,
  rootPath,
  setAttempt,
}: {
  environment: ChatEnvironment
  rootPath: string
  setAttempt: (attempt: ProjectRetryAttempt) => void
}) {
  try {
    const result = await environment.dispatchCommand(createWorkspaceProjectCommand({ rootPath }))
    setAttempt(IDLE)
    log.info({
      action: 'chat.project.retry',
      area: 'chat',
      commandType: 'project.create',
      deduped: result.deduped,
      outcome: 'ok',
      rootPath,
      sequence: result.sequence,
    })
  } catch (error) {
    const reason = errorMessage(error, 'Could not prepare chat for this workspace.')
    setAttempt({ error: reason, retrying: false })
    log.warn({
      action: 'chat.project.retry',
      area: 'chat',
      commandType: 'project.create',
      outcome: 'error',
      reason,
      rootPath,
    })
  }
}
