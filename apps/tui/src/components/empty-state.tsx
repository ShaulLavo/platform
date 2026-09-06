import type { Theme } from '@/theme/utils/theme'

export function EmptyState({
  title,
  description,
  theme,
}: {
  title: string
  description?: string
  theme: Theme
}) {
  return (
    <box flexGrow={1} padding={2} flexDirection='column' gap={1}>
      <text fg={theme.foreground}>{title}</text>
      {description && <text fg={theme.mutedForeground}>{description}</text>}
    </box>
  )
}
