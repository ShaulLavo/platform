import { WarningCircleIcon } from '@phosphor-icons/react'

export function ChatPanelStatus({
  createError,
  projectError,
  shellError,
}: {
  createError: string | null
  projectError: string | null
  shellError: string | null
}) {
  const message = createError ?? projectError ?? shellError
  if (!message) return null

  return (
    <div className='text-destructive border-t px-3 py-2 text-[11px]'>
      <div className='flex min-w-0 items-center gap-1.5'>
        <WarningCircleIcon className='size-3.5 shrink-0' />
        <span className='truncate'>{message}</span>
      </div>
    </div>
  )
}
