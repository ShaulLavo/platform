import { useEffect, useState } from 'react'

import { formatWorkingTimer } from '../lib/chat-formatters'

export function WorkingTimer({ startedAt }: { startedAt: string }) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [startedAt])

  return (
    <span className='tabular-nums'>
      {formatWorkingTimer(startedAt, new Date(nowMs).toISOString()) ?? '0s'}
    </span>
  )
}
