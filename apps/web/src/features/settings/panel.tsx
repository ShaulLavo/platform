import { KeybindingSection } from './components/keybinding-section'
import { ModelSection } from './components/model-section'
import { ProviderSection } from './components/provider-section'
import { Status } from './components/status'
import { useSettings } from './hooks/use-settings'

export function SettingsPanel() {
  const settings = useSettings()

  if (settings.isPending) return <Status>Loading settings…</Status>
  if (settings.isError) return <Status tone='destructive'>Settings could not be loaded.</Status>

  return (
    <div className='flex flex-col gap-6 overflow-y-auto p-4'>
      <ProviderSection instances={settings.data.providerInstances} />
      <ModelSection preferences={settings.data.models} />
      <KeybindingSection overrides={settings.data.keybindings} />
    </div>
  )
}
