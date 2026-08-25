import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'

export function RawConflictReloadDialog({
  onCancel,
  onConfirm,
  open,
}: {
  readonly onCancel: () => void
  readonly onConfirm: () => void
  readonly open: boolean
}) {
  return (
    <Dialog onOpenChange={(next) => next || onCancel()} open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Discard local settings edits?</DialogTitle>
          <DialogDescription>
            Reload replaces this dirty buffer with the latest confirmed settings.json.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onCancel} type='button' variant='outline'>
            Cancel
          </Button>
          <Button onClick={onConfirm} type='button' variant='destructive'>
            Discard and reload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
