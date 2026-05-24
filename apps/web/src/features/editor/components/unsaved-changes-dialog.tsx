import {
  CircleNotchIcon,
  FloppyDiskIcon,
  TrashIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'

import { basename } from '@/lib/path-formatters'

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
  const name = path ? basename(path) : 'this tab'
  const description = canSave
    ? `Save changes to ${name} before closing?`
    : `${name} has unsaved changes that cannot be saved directly.`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className='bg-background w-[min(420px,calc(100vw-2rem))] max-w-none gap-4 rounded-lg border p-4 text-sm shadow-xl sm:max-w-none'
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {path ? (
          <div className='bg-muted/30 text-muted-foreground truncate rounded-md border px-3 py-2 text-xs'>
            {path}
          </div>
        ) : null}
        {error ? (
          <div
            className='border-destructive/25 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-xs'
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
                <CircleNotchIcon className='animate-spin' data-icon='inline-start' />
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
