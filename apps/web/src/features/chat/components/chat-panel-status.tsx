import { HourglassMediumIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import { useServerConnectionStore } from '../state/server-connection-store'

export function ChatPanelStatus({
  createError,
  projectError,
  shellError,
}: {
  createError: string | null
  projectError: string | null
  shellError: string | null
}) {
  const slowRequestCount = useServerConnectionStore((state) => state.slowRequestCount)
  const message = createError ?? projectError ?? shellError
  // Errors win: a request being slow while something is already broken is not
  // the thing the user needs told.
  if (message) {
    return (
      <StatusLine tone='destructive'>
        <WarningCircleIcon className='size-3.5 shrink-0' />
        <span className='truncate'>{message}</span>
      </StatusLine>
    )
  }
  if (slowRequestCount === 0) return null

  // Said out loud because the alternative is silence: one flat timeout makes a
  // forty-second answer look exactly like a stuck one for the whole forty
  // seconds, and the user has no way to tell whether to wait.
  return (
    <StatusLine tone='warning'>
      <HourglassMediumIcon className='size-3.5 shrink-0' />
      <span className='truncate'>
        Waiting on the server (<span className='tabular-nums'>{slowRequestCount}</span>{' '}
        {slowRequestCount === 1 ? 'request' : 'requests'})
      </span>
    </StatusLine>
  )
}

function StatusLine({
  children,
  tone,
}: {
  readonly children: ReactNode
  readonly tone: 'destructive' | 'warning'
}) {
  return (
    <div
      className={
        tone === 'destructive'
          ? 'text-destructive compact:px-2 compact:py-1.5 border-t px-3 py-2 text-[11px]'
          : 'text-warning compact:px-2 compact:py-1.5 border-t px-3 py-2 text-[11px]'
      }
    >
      <div className='compact:gap-1 flex min-w-0 items-center gap-1.5'>{children}</div>
    </div>
  )
}
