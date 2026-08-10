import { ArrowClockwiseIcon, FolderPlusIcon } from '@phosphor-icons/react'

import { StageNotice } from '@/features/chat-mode/components/stage-notice'
import { useChatModeSession } from '@/features/chat-mode/providers/session-context'
import { Button } from '@workspace/ui/components/button'

/**
 * What the stage shows before this workspace has a project. A composer greyed out with
 * no explanation is the shape of a broken app, and first run and a failed setup are
 * exactly the two moments a user has no way to tell the difference — so this says which
 * of the two it is and offers the one action that resolves either.
 */
export function StageEmptyState() {
  const { addProject, error, retrying, retryProject, rootPath } = useChatModeSession()

  if (!rootPath) {
    return (
      <StageNotice
        detail='Chat sessions belong to a project, and a project is a folder on this machine.'
        title='No folder open'
      >
        <Button size='sm' type='button' onClick={addProject}>
          <FolderPlusIcon data-icon='inline-start' />
          Open a folder
        </Button>
      </StageNotice>
    )
  }

  return (
    <StageNotice
      detail={error ?? `Preparing chat for ${rootPath}.`}
      failed={Boolean(error)}
      title={error ? 'Chat could not open this folder' : 'Setting up chat'}
    >
      <Button disabled={retrying} size='sm' type='button' variant='outline' onClick={retryProject}>
        <ArrowClockwiseIcon data-icon='inline-start' />
        {retrying ? 'Trying…' : 'Try again'}
      </Button>
      <Button size='sm' type='button' variant='ghost' onClick={addProject}>
        <FolderPlusIcon data-icon='inline-start' />
        Open another folder
      </Button>
    </StageNotice>
  )
}
