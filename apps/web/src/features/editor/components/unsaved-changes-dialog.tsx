import { FloppyDiskIcon, TrashIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'

import { fileBackedDocumentPath } from '@/features/editor/utils/file-backed-document'
import { documentLabel } from '@/features/workspace/utils/document-label'
import { Spinner } from '@workspace/ui/components/spinner'

type UnsavedChangesDialogProps = {
  canSave: boolean
  error: string | null
  open: boolean
  path: string | null
  saving: boolean
  onCancel: () => void
  onDiscard: () => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
}

export function UnsavedChangesDialog({
  canSave,
  error,
  open,
  path,
  saving,
  onCancel,
  onDiscard,
  onOpenChange,
  onSave,
}: UnsavedChangesDialogProps) {
  // Through `documentLabel`, like the tab strip and the window title: `basename`
  // renders a synthetic id raw, so this dialog asked whether to save changes to
  // `settings:` or to an encoded diff blob.
  const name = path ? documentLabel(path) : 'this tab'
  const description = canSave
    ? `Save changes to ${name} before closing?`
    : `${name} has unsaved changes that cannot be saved directly.`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className='bg-background w-[min(420px,calc(100vw-2rem))] max-w-none rounded-lg border text-sm shadow-xl sm:max-w-none'
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {/* Only a real path on disk. `path !== name` suppressed nothing that
            mattered — every synthetic id differs from its label, so all of them
            still rendered raw — while hiding the path for a file at the root. */}
        {fileBackedDocumentPath(path) ? (
          <div className='bg-muted/30 text-muted-foreground compact:px-2.5 compact:py-1.5 truncate rounded-md border px-3 py-2 text-xs'>
            {path}
          </div>
        ) : null}
        {error ? (
          <div
            className='border-destructive/25 bg-destructive/10 text-destructive compact:gap-1.5 compact:px-2.5 compact:py-1.5 flex items-start gap-2 rounded-md border px-3 py-2 text-xs'
            role='alert'
          >
            <WarningCircleIcon className='mt-0.5 size-3.5 shrink-0' />
            <span>{error}</span>
          </div>
        ) : null}
        <DialogFooter>
          <Button disabled={saving} onClick={onCancel} type='button' variant='outline'>
            Cancel
          </Button>
          <Button disabled={saving} onClick={onDiscard} type='button' variant='destructive'>
            <TrashIcon data-icon='inline-start' />
            Discard
          </Button>
          {canSave ? (
            <Button disabled={saving} onClick={onSave} type='button'>
              {saving ? (
                <Spinner aria-hidden='true' data-icon='inline-start' role='presentation' />
              ) : (
                <FloppyDiskIcon data-icon='inline-start' />
              )}
              Save
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
