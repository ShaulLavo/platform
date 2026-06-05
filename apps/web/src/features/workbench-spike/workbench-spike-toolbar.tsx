import {
  ArrowsClockwiseIcon,
  FloppyDiskIcon,
  MagnifyingGlassIcon,
  TerminalWindowIcon,
  TrashIcon,
} from '@phosphor-icons/react'

import {
  formatWorkbenchSpikeMounts,
  formatWorkbenchSpikeTerminalSize,
  latestWorkbenchSpikeTerminalSize,
} from '@/features/workbench-spike/workbench-spike-formatters'
import type {
  WorkbenchSpikeMetrics,
  WorkbenchSpikeSerializedState,
} from '@/features/workbench-spike/workbench-spike-types'

export function WorkbenchSpikeToolbar({
  metrics,
  panelCount,
  savedState,
  onAddSearch,
  onAddTerminal,
  onReset,
  onRestore,
  onSave,
}: {
  metrics: WorkbenchSpikeMetrics
  panelCount: number
  savedState: WorkbenchSpikeSerializedState | null
  onAddSearch: () => void
  onAddTerminal: () => void
  onReset: () => void
  onRestore: () => void
  onSave: () => void
}) {
  return (
    <header className='workbench-spike-toolbar'>
      <div className='workbench-spike-title-block'>
        <span className='workbench-spike-panel-kicker'>Phase 0 spike</span>
        <h1>Dockview Workbench</h1>
      </div>
      <div className='workbench-spike-actions'>
        <button type='button' onClick={onAddTerminal}>
          <TerminalWindowIcon aria-hidden size={15} weight='bold' />
          Terminal
        </button>
        <button type='button' onClick={onAddSearch}>
          <MagnifyingGlassIcon aria-hidden size={15} weight='bold' />
          Search
        </button>
        <button type='button' onClick={onSave}>
          <FloppyDiskIcon aria-hidden size={15} weight='bold' />
          Save
        </button>
        <button type='button' disabled={!savedState} onClick={onRestore}>
          <ArrowsClockwiseIcon aria-hidden size={15} weight='bold' />
          Restore
        </button>
        <button type='button' onClick={onReset}>
          <TrashIcon aria-hidden size={15} weight='bold' />
          Reset
        </button>
      </div>
      <dl className='workbench-spike-metrics'>
        <div>
          <dt>panels</dt>
          <dd>{panelCount}</dd>
        </div>
        <div>
          <dt>active</dt>
          <dd>{metrics.activePanelId ?? 'none'}</dd>
        </div>
        <div>
          <dt>layout events</dt>
          <dd>{metrics.layoutEvents}</dd>
        </div>
        <div>
          <dt>editor mounts</dt>
          <dd>{formatWorkbenchSpikeMounts(metrics.editorMountsByPanelId)}</dd>
        </div>
        <div>
          <dt>terminal mounts</dt>
          <dd>{formatWorkbenchSpikeMounts(metrics.terminalMountsByPanelId)}</dd>
        </div>
        <div>
          <dt>terminal size</dt>
          <dd>{formatWorkbenchSpikeTerminalSize(latestWorkbenchSpikeTerminalSize(metrics))}</dd>
        </div>
      </dl>
    </header>
  )
}
