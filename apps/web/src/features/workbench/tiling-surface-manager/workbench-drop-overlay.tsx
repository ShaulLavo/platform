import { layoutRectStyle } from './workbench-layout-style'
import type { DropZoneLayoutRect } from './layout-geometry'

export function WorkbenchDropOverlay({
  dropZoneRects,
}: {
  readonly dropZoneRects: readonly DropZoneLayoutRect[]
}) {
  if (dropZoneRects.length === 0) return null

  return (
    <div
      aria-label='Workbench drop targets'
      className='pointer-events-none absolute inset-0 z-40'
      data-workbench-drop-overlay=''
    >
      {dropZoneRects.map((dropZone) => (
        <div
          aria-label={dropZoneLabel(dropZone)}
          className='data-[kind=window-center]:bg-ring/10 data-[kind=window-edge]:bg-ring/12 data-[kind=root-edge]:bg-primary/10 data-[kind=parent-edge]:bg-accent/20 absolute rounded-[4px] border border-transparent opacity-0 transition-opacity'
          data-drop-zone-id={dropZone.id}
          data-kind={dropZone.kind}
          key={dropZone.id}
          role='button'
          style={layoutRectStyle(dropZone.rect)}
          tabIndex={-1}
        />
      ))}
    </div>
  )
}

function dropZoneLabel(dropZone: DropZoneLayoutRect) {
  if (dropZone.kind === 'window-center') return `Drop on window ${dropZone.windowId}`
  if (dropZone.edge) return `Drop ${dropZone.kind} ${dropZone.edge}`

  return `Drop ${dropZone.kind}`
}
