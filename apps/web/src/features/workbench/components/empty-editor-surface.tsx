import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'
import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'

export function EmptyEditorSurface({ surface }: SurfaceRendererProps) {
  if (surface.type !== 'placeholder') {
    return <PanelUnavailable message='This surface is not an empty editor.' />
  }

  return <section className='min-h-[320px]' />
}
