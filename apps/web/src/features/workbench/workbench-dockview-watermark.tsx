import type { IWatermarkPanelProps } from 'dockview-react'

export function WorkbenchDockviewWatermark(_props: IWatermarkPanelProps) {
  return (
    <div className='workbench-dockview-watermark'>
      <div className='text-foreground text-sm font-medium'>No editor panels open</div>
      <div className='text-muted-foreground text-xs'>Open a file from the explorer.</div>
    </div>
  )
}
