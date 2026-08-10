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

import { useProjectActions } from '@/features/chat-mode/hooks/use-project-actions'
import { useProjectDeleteRequestStore } from '@/features/chat-mode/state/project-delete-request-store'
import { projectDeletePrompt } from '@/features/chat-mode/utils/project-delete-prompt'

/**
 * Deleting a project cascades onto every session it owns and there is no undo,
 * so it never runs straight off a menu click.
 */
export function ProjectDeleteDialog() {
  const request = useProjectDeleteRequestStore((state) => state.request)
  const actions = useProjectActions()

  return (
    <Dialog onOpenChange={(open) => open || actions.cancelDelete()} open={request !== null}>
      <DialogContent
        className='w-[min(420px,calc(100vw-2rem))] max-w-none gap-4 rounded-lg border p-4 text-sm sm:max-w-none'
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Delete project</DialogTitle>
          <DialogDescription>
            {projectDeletePrompt({
              sessionCount: request?.sessionCount ?? 0,
              title: request?.title ?? 'this project',
            })}
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
