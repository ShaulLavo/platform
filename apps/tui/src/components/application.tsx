import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { useSyncExternalStore } from 'react'

import { LoadingState } from '@/components/loading-state'
import { Failure } from '@/connection/components/failure'
import type { SettingsSession } from '@/connection/state/session'
import { Foundation } from '@/components/foundation'
import { useTheme } from '@/theme/hooks/use-theme'
import { useSettingValue } from '@/settings/hooks/use-setting-value'
import { HostActionsContext, type HostActions } from '@/host/providers/actions-context'

type ApplicationProps = {
  session: SettingsSession
  noColor?: boolean
  onExit: () => void
  onSuspend?: () => void
  onEditText?: HostActions['editText']
}

export function Application({
  session,
  noColor = false,
  onExit,
  onSuspend,
  onEditText,
}: ApplicationProps) {
  const { height } = useTerminalDimensions()
  const short = height < 20
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const owner = state.kind === 'ready' ? state.owner : null
  const mode = useSettingValue(owner, 'workbench.colorTheme')
  const palette = useSettingValue(owner, 'workbench.palette')
  const reducedMotion = useSettingValue(owner, 'workbench.reduceMotion')
  const theme = useTheme(mode, noColor, { palette, reducedMotion })
  useKeyboard((event) => {
    if (state.kind === 'ready') return
    if (event.ctrl && event.name === 'c') {
      event.preventDefault()
      onExit()
    }
    if (event.ctrl && event.name === 'r') {
      event.preventDefault()
      void session.refresh()
    }
  })
  return (
    <box width='100%' height='100%' backgroundColor={theme.background} flexDirection='column'>
      <box
        height={short ? 1 : 3}
        flexShrink={0}
        paddingX={2}
        alignItems='center'
        gap={2}
        backgroundColor={theme.card}
        flexDirection='row'
      >
        <text fg={theme.primary}>
          <strong>PLATFORM</strong>
        </text>
        <text fg={theme.foreground}>Settings</text>
        <text fg={theme.mutedForeground}>TUI</text>
      </box>
      {state.kind === 'loading' && <LoadingState theme={theme} />}
      {state.kind === 'failed' && <Failure failure={state.failure} theme={theme} />}
      {state.kind === 'ready' && state.connection.kind === 'offline' && (
        <text fg={theme.warning} paddingX={2} flexShrink={0}>
          {short
            ? 'Offline · cached settings'
            : 'Connection lost. Showing the last loaded settings.'}
        </text>
      )}
      {state.kind === 'ready' && (
        <HostActionsContext value={{ quit: onExit, suspend: onSuspend, editText: onEditText }}>
          <Foundation session={session} state={state} theme={theme} />
        </HostActionsContext>
      )}
      {state.kind !== 'ready' && (
        <box height={3} paddingX={2} paddingTop={1} flexShrink={0}>
          <text fg={theme.mutedForeground}>{session.origin} · Ctrl+R retry · Ctrl+C quit</text>
        </box>
      )}
    </box>
  )
}
