import type { IDockviewPanelProps } from 'dockview-react'

import { WorkbenchSpikeEditorPanel } from '@/features/workbench-spike/workbench-spike-editor-panel'
import { WorkbenchSpikeTerminalPanel } from '@/features/workbench-spike/workbench-spike-terminal-panel'
import type { WorkbenchSpikePanelParams } from '@/features/workbench-spike/workbench-spike-types'

export function WorkbenchSpikeDockviewPanel({
  params,
}: IDockviewPanelProps<WorkbenchSpikePanelParams>) {
  const panel = params.panel

  if (panel.type === 'file') return <WorkbenchSpikeEditorPanel panel={panel} />
  if (panel.type === 'terminal') return <WorkbenchSpikeTerminalPanel panel={panel} />

  return (
    <section className='workbench-spike-panel workbench-spike-info-panel'>
      <div className='workbench-spike-panel-kicker'>{panel.type}</div>
      <h2>{panel.title}</h2>
      <p>{panel.description}</p>
      <dl>
        <dt>Panel ID</dt>
        <dd>{panel.id}</dd>
        <dt>Restore key</dt>
        <dd>{panel.subtitle}</dd>
      </dl>
    </section>
  )
}
