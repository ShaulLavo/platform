import { TrashIcon } from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'

import { useSessionActions } from '@/features/chat-mode/hooks/use-session-actions'
import { useSessionDeleteRequestStore } from '@/features/chat-mode/state/session-delete-request-store'
import {
  sessionDeletePrompt,
  sessionDeleteTitle,
} from '@/features/chat-mode/utils/session-delete-prompt'

/**
 * Deleting a session takes its whole event history with it and there is no undo, so it
 * never runs straight off a menu click.
 */
export function SessionDeleteDialog() {
  const request = useSessionDeleteRequestStore((state) => state.request)
  const actions = useSessionActions()
  const count = request?.threadIds.length ?? 1

  return (
    <Dialog onOpenChange={(open) => open || actions.cancelDelete()} open={request !== null}>
      <DialogContent
        className='w-[min(420px,calc(100vw-2rem))] max-w-none gap-4 rounded-lg border p-4 text-sm sm:max-w-none'
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{sessionDeleteTitle(count)}</DialogTitle>
          <DialogDescription>
            {sessionDeletePrompt({ count, title: request?.title ?? 'this session' })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => actions.cancelDelete()} type='button' variant='outline'>
            Cancel
          </Button>
          <Button
            onClick={() => request && actions.confirmDelete(request)}
            type='button'
            variant='destructive'
          >
            <TrashIcon data-icon='inline-start' />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
