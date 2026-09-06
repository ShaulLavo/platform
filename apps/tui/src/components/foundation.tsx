import { CommandProvider } from '@/commands/providers/command-provider'
import { Workspace } from '@/components/workspace'
import { connectionFailure } from '@/connection/utils/failure'
import type { SessionState, SettingsSession } from '@/connection/state/session'
import { recordRecentCommand } from '@/storage/recents'
import type { Theme } from '@/theme/utils/theme'
import { useSettingValue } from '@/settings/hooks/use-setting-value'
import { useRenderer } from '@opentui/react'
import { useState } from 'react'
import { Toast } from '@/components/toast'
import { Status } from '@/components/status'

export function Foundation({
  session,
  state,
  theme,
}: {
  session: SettingsSession
  state: Extract<SessionState, { kind: 'ready' }>
  theme: Theme
}) {
  const overrides = useSettingValue(state.owner, 'keybindings.overrides')
  const renderer = useRenderer()
  const [failure, setFailure] = useState<string | null>(null)
  return (
    <CommandProvider
      signal={session.signal}
      scope={{ screen: 'settings', environmentId: state.descriptor.environmentId, projectId: null }}
      handlers={{}}
      overrides={overrides}
      kitty={renderer.capabilities?.kitty_keyboard ?? false}
      onExecuted={(id) => recordRecentCommand(state.storage, id)}
      onError={(error) => {
        const reason = connectionFailure(error)
        setFailure(reason.message)
        session.record({ action: 'tui.command.failed', ...reason })
      }}
    >
      <Workspace session={session} state={state} theme={theme} />
      {failure && (
        <Toast message={failure} tone='error' theme={theme} onDismiss={() => setFailure(null)} />
      )}
      <Status state={state} theme={theme} />
    </CommandProvider>
  )
}
