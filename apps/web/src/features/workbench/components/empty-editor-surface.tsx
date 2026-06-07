import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'
import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import { WINDOW_MANAGEMENT_SETTINGS_PLACEHOLDER_CONTEXT_KEY } from '@/features/tiling-surface-manager/engine/layout-builders'

export function EmptyEditorSurface({ surface }: SurfaceRendererProps) {
  if (surface.type !== 'placeholder') {
    return <PanelUnavailable message='This surface is not an empty editor.' />
  }
  if (surface.stateKey === WINDOW_MANAGEMENT_SETTINGS_PLACEHOLDER_CONTEXT_KEY) {
    return <WindowManagementSettingsPlaceholder />
  }

  return <section className='min-h-[320px]' />
}

function WindowManagementSettingsPlaceholder() {
  return (
    <section className='bg-background flex h-full min-h-[320px] min-w-0 flex-col overflow-hidden'>
      <header className='border-border/70 bg-muted/20 shrink-0 border-b px-4 py-3'>
        <h2 className='text-foreground truncate text-sm font-medium'>Window Management Settings</h2>
      </header>
      <div className='space-y-4 overflow-auto p-4'>
        <div className='border-border bg-card overflow-hidden rounded-md border'>
          <div className='border-border grid grid-cols-[1.4fr_0.8fr_1fr_1fr_0.8fr] border-b px-3 py-2 text-xs font-medium'>
            <span>Name</span>
            <span>Type</span>
            <span>Alias</span>
            <span>Hotkey</span>
            <span>Enabled</span>
          </div>
          <div className='text-muted-foreground grid grid-cols-[1.4fr_0.8fr_1fr_1fr_0.8fr] px-3 py-2 text-xs'>
            <span>Platform Defaults</span>
            <span>Preset</span>
            <span>platform</span>
            <span>Active</span>
            <span>Yes</span>
          </div>
          <div className='text-muted-foreground grid grid-cols-[1.4fr_0.8fr_1fr_1fr_0.8fr] px-3 py-2 text-xs'>
            <span>Custom Window Commands</span>
            <span>Command</span>
            <span>Editable</span>
            <span>Optional</span>
            <span>Yes</span>
          </div>
          <div className='text-muted-foreground grid grid-cols-[1.4fr_0.8fr_1fr_1fr_0.8fr] px-3 py-2 text-xs'>
            <span>Saved Layout Commands</span>
            <span>Layout</span>
            <span>Editable</span>
            <span>Optional</span>
            <span>Yes</span>
          </div>
        </div>
        <div className='border-border bg-card grid gap-0 overflow-hidden rounded-md border text-xs sm:grid-cols-2'>
          <SettingsRow label='Default Gap' value='Theme spacing' />
          <SettingsRow label='Cycling Mode' value='Command scoped' />
          <SettingsRow label='Display Wrapping' value='Enabled when displays are available' />
          <SettingsRow label='OS Compatibility' value='Browser-safe bindings' />
        </div>
      </div>
    </section>
  )
}

function SettingsRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className='border-border flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0 sm:border-r sm:even:border-r-0'>
      <span className='text-foreground font-medium'>{label}</span>
      <span className='text-muted-foreground text-right'>{value}</span>
    </div>
  )
}
