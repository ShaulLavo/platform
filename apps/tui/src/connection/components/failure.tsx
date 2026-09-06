import type { ConnectionFailure } from '@/connection/utils/failure'
import type { Theme } from '@/theme/utils/theme'

export function Failure({ failure, theme }: { failure: ConnectionFailure; theme: Theme }) {
  return (
    <box flexGrow={1} padding={2} flexDirection='column' gap={1}>
      <text fg={theme.destructive}>
        <strong>Connection unavailable</strong>
      </text>
      <text fg={theme.foreground}>{failure.message}</text>
      <text fg={theme.mutedForeground}>{failure.fix}</text>
      <text fg={theme.mutedForeground}>Ctrl+R retry · Ctrl+C quit</text>
    </box>
  )
}
