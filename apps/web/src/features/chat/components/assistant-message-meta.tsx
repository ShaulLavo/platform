import { useEffect, useState } from 'react'

import { formatAssistantMessageMeta, formatChatElapsed } from '../lib/chat-formatters'

export function AssistantMessageMeta({
  createdAt,
  durationEnd,
  durationStart,
  streaming,
}: {
  createdAt: string
  durationEnd: string
  durationStart: string
  streaming: boolean
}) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!streaming) return

    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [streaming])

  const endIso = streaming ? new Date(nowMs).toISOString() : durationEnd
  const elapsed = formatChatElapsed(durationStart, endIso)

  return <>{formatAssistantMessageMeta(createdAt, elapsed)}</>
}
