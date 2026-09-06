import { useCommands } from '@/commands/hooks/use-commands'
import { useTerminalDimensions } from '@opentui/react'
import type { SessionState } from '@/connection/state/session'
import type { Theme } from '@/theme/utils/theme'

export function Status({
  state,
  theme,
}: {
  state: Extract<SessionState, { kind: 'ready' }>
  theme: Theme
}) {
  const { bindings } = useCommands()
  const { width, height } = useTerminalDimensions()
  const compact = width < 70 || height < 20
  const offline = state.connection.kind === 'offline'
  const palette = bindings.find(
    (binding) => binding.command === 'workspace.showCommandPalette',
  )?.keys
  const files = bindings.find((binding) => binding.command === 'workspace.showQuickAccess')?.keys
  const refresh = bindings.find((binding) => binding.command === 'workspace.reconnect')?.keys
  const hints = [
    palette && `${palette} commands`,
    !offline && files && `${files} files`,
    (!compact || offline) && refresh && `${refresh} refresh`,
  ].filter(Boolean)
  const connection = [
    state.connection.kind === 'live' ? 'Live' : 'Disconnected',
    state.descriptor.label,
  ].join(' · ')
  return (
    <box
      height={compact ? 2 : 3}
      paddingX={2}
      paddingTop={compact ? 0 : 1}
      flexShrink={0}
      overflow='hidden'
    >
      <text fg={theme.mutedForeground}>
        {compact ? `${connection}\n${hints.join(' · ')}` : [connection, ...hints].join(' · ')}
      </text>
    </box>
  )
}
