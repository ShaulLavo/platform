import { GearSixIcon } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'

import { SettingsPanel } from '@/features/settings/panel'

/**
 * Settings are machine-wide, not document-scoped, so they get a dialog rather
 * than an editor tab or a sidebar surface: the same `Mod+,` has to land in the
 * workbench and in chat mode, and neither layout owns the other's tab strip.
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
        <DialogHeader className='border-border/60 gap-1 border-b px-4 py-3'>
          <DialogTitle className='flex items-center gap-2 text-sm'>
            <span className='border-info/20 bg-info/10 text-info flex size-7 items-center justify-center rounded-md border'>
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
        {open ? <SettingsPanel /> : null}
      </DialogContent>
    </Dialog>
  )
}
