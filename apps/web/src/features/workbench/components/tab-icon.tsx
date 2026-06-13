import { fileIconStyle } from '@/lib/file-icon-style'
import { SurfaceIcon } from '@/features/workbench/components/surface-icon'
import type { WorkbenchTabModel } from '@/features/workbench/utils/tab-model'

export function TabIcon({
  className,
  tab,
}: {
  readonly className?: string
  readonly tab: WorkbenchTabModel
}) {
  const editorTab = tab.editorTab
  if (!editorTab) return <SurfaceIcon className={className} type={tab.surface.type} />

  return <span aria-hidden='true' className={className} style={fileIconStyle(editorTab.icon)} />
}
