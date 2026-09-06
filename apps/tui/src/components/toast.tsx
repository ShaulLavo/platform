import { useEffect, useEffectEvent } from 'react'

import type { Theme } from '@/theme/utils/theme'

export function Toast({
  message,
  tone = 'info',
  theme,
  onDismiss,
  durationMs = 4_000,
}: {
  message: string
  tone?: 'success' | 'error' | 'warning' | 'info'
  theme: Theme
  onDismiss?: () => void
  durationMs?: number
}) {
  const dismiss = useEffectEvent(() => onDismiss?.())
  const dismissible = onDismiss !== undefined
  useEffect(() => {
    if (!dismissible || durationMs === 0) return
    const timer = setTimeout(dismiss, durationMs)
    return () => clearTimeout(timer)
  }, [message, dismissible, durationMs])
  const color = tone === 'error' ? theme.destructive : theme[tone]
  return (
    <box
      border={['top']}
      borderColor={color}
      backgroundColor={theme.popover}
      paddingX={2}
      flexShrink={0}
    >
      <text fg={color}>
        {tone.toUpperCase()} · {message}
      </text>
    </box>
  )
}
