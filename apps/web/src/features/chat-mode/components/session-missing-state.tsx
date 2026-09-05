import { PlusIcon } from '@phosphor-icons/react'

import { StageNotice } from '@/features/chat-mode/components/stage-notice'
import { useChatModeSession } from '@/features/chat-mode/providers/session-context'
import { startSessionDraft } from '@/features/chat-mode/state/session-commands'
import { Button } from '@workspace/ui/components/button'

/**
 * The remembered session is not in this project any more — deleted here, or created on
 * another machine. Saying so is the whole point: the same pick used to sit on "Opening
 * session" forever, which is indistinguishable from an app that stopped responding.
 */
export function SessionMissingState() {
  const { project, transport } = useChatModeSession()

  return (
    <StageNotice
      detail='It was deleted, or it belongs to a machine this workspace has not synced with.'
      title='That session is gone'
    >
      {project ? (
        <Button
          size='sm'
          type='button'
          onClick={() =>
            startSessionDraft({ environmentId: transport.environmentId, projectId: project.id })
          }
        >
          <PlusIcon data-icon='inline-start' />
          Start a new session
        </Button>
      ) : null}
    </StageNotice>
  )
}
