import { WarningCircleIcon } from '@phosphor-icons/react'

export function PanelUnavailable({ message }: { readonly message: string }) {
  return (
    <div className='workbench-panel-unavailable text-muted-foreground'>
      <WarningCircleIcon className='size-4' />
      <span>{message}</span>
    </div>
  )
}
