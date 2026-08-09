import { WarningCircleIcon } from '@phosphor-icons/react'
import { cn } from '@workspace/ui/lib/utils'

/**
 * Every non-renderable diff still says something. A diff pane must never be a
 * blank rectangle the reader has to interpret.
 */
export function DiffNotice({
  message,
  tone = 'muted',
}: {
  message: string
  tone?: 'error' | 'muted'
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 p-6 text-center text-xs',
        tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
      )}
      role='status'
    >
      {tone === 'error' && <WarningCircleIcon aria-hidden='true' className='size-4 shrink-0' />}
      <span>{message}</span>
    </div>
  )
}
