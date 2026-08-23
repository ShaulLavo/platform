import { GearSixIcon } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'

import { SettingsPage } from '@/features/settings/components/page'

/**
 * Settings with no folder open.
 *
 * With a folder, settings are an editor tab — both layouts render the same
 * `CodePanel`, so one surface covers workbench and chat mode. Without one there
 * is no tab strip to put a tab in, and that is exactly when first-run provider
 * setup happens, so this shell exists to be reachable and, unlike a bare
 * full-screen surface, to have a way out.
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  readonly onOpenChange: (open: boolean) => void
  readonly open: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex h-[min(720px,calc(100svh-4rem))] w-[min(880px,calc(100vw-3rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none'>
        <DialogHeader className='border-border/60 compact:px-3 compact:py-2 gap-1 border-b px-4 py-3'>
          <DialogTitle className='compact:gap-1.5 flex items-center gap-2 text-sm'>
            <span className='border-info/20 bg-info/10 text-info compact:size-6 flex size-7 items-center justify-center rounded-md border'>
              <GearSixIcon weight='duotone' />
            </span>
            Settings
          </DialogTitle>
          <DialogDescription>
            Providers, models, and keybindings for this machine.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open so the settings query is not held warm — and
            so closing the dialog discards any half-typed provider config. */}
        {open ? <SettingsPage /> : null}
      </DialogContent>
    </Dialog>
  )
}
