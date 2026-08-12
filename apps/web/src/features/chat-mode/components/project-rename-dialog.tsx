import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { useState } from 'react'

import { createProjectMetaCommand } from '@/features/chat/lib/chat-command-builders'
import { useChatModeSession } from '@/features/chat-mode/providers/session-context'
import { useProjectRenameRequestStore } from '@/features/chat-mode/state/project-rename-request-store'

/**
 * Renaming a project was impossible: the server accepted `title` and nothing
 * ever sent it, so the only way to fix a name was to delete the project —
 * cascading every session — and add the folder again.
 */
export function ProjectRenameDialog() {
  const request = useProjectRenameRequestStore((state) => state.request)
  const dismissRename = useProjectRenameRequestStore((state) => state.dismissRename)
  const { environment } = useChatModeSession()
  // Keyed on the request so opening the dialog for a second project starts from
  // that project's name rather than the previous one's edited text.
  const [title, setTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  if (request && editingId !== request.projectId) {
    setEditingId(request.projectId)
    setTitle(request.title)
  }

  const trimmed = title.trim()
  const canSave = trimmed.length > 0 && trimmed !== request?.title

  function save() {
    if (!request || !canSave) return

    void environment.dispatchCommand(
      createProjectMetaCommand({ projectId: request.projectId, title: trimmed }),
    )
    dismissRename()
  }

  return (
    <Dialog onOpenChange={(open) => open || dismissRename()} open={request !== null}>
      <DialogContent
        className='w-[min(420px,calc(100vw-2rem))] max-w-none gap-4 rounded-lg border p-4 text-sm sm:max-w-none'
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
        </DialogHeader>
        <Input
          aria-label='Project name'
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return

            event.preventDefault()
            save()
          }}
          value={title}
        />
        <DialogFooter>
          <Button onClick={() => dismissRename()} type='button' variant='outline'>
            Cancel
          </Button>
          <Button disabled={!canSave} onClick={() => save()} type='button'>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
