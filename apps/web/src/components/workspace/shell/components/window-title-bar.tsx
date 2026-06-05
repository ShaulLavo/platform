import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { isDesktop } from '@/lib/platform/bridge'

// Electrobun's preload turns elements carrying this class into native window-drag
// regions (mousedown -> startWindowMove). See electrobun/preload/dragRegions.
const DRAG_REGION_CLASS = 'electrobun-webkit-app-region-drag'

// Horizontal room reserved on the left so the macOS traffic lights never sit on
// top of app content. The dots span ~70px from the window edge.
const TRAFFIC_LIGHT_INSET = 90

export function WindowTitleBar() {
  const rootFolder = useEditorWorkspaceState((state) => state.rootFolder)

  if (!isDesktop()) return null

  return (
    <div
      className={`${DRAG_REGION_CLASS} bg-background relative flex h-[var(--titlebar-height)] shrink-0 items-center select-none`}
      style={{ paddingLeft: TRAFFIC_LIGHT_INSET }}
    >
      <span className='text-muted-foreground pointer-events-none absolute inset-x-0 truncate px-20 text-center text-xs font-medium'>
        {rootFolder?.name ?? 'Platform'}
      </span>
    </div>
  )
}
