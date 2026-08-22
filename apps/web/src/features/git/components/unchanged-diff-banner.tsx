import { ArrowsLeftRightIcon } from '@phosphor-icons/react'

/**
 * One line of chrome above a diff that has no changes in it — a pure rename, a mode change, two
 * sides that happen to match. The file itself is still drawn below; this only answers the question
 * the empty diff raises, which nothing in the rows can.
 */
export function UnchangedDiffBanner({ message }: { message: string }) {
  return (
    <div
      className='text-muted-foreground border-border flex shrink-0 items-center gap-1.5 border-b px-3 py-1.5 text-xs'
      role='status'
    >
      <ArrowsLeftRightIcon aria-hidden='true' className='size-3.5 shrink-0' />
      <span className='truncate'>{message}</span>
    </div>
  )
}
