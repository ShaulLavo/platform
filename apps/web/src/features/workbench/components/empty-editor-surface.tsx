import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'
import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import { WINDOW_MANAGEMENT_SETTINGS_PLACEHOLDER_CONTEXT_KEY } from '@workspace/tiling/utils/layout-builders'
import { WindowManagementSettingsSurface } from '@/features/workbench/components/window-management-settings-surface'

export function EmptyEditorSurface({ surface }: SurfaceRendererProps) {
  if (surface.type !== 'placeholder') {
    return <PanelUnavailable message='This surface is not an empty editor.' />
  }
  if (surface.stateKey === WINDOW_MANAGEMENT_SETTINGS_PLACEHOLDER_CONTEXT_KEY) {
    return <WindowManagementSettingsSurface />
  }

  return <section className='min-h-[320px]' />
}
