import type { WorkbenchSpikePanelSize } from '@/features/workbench-spike/workbench-spike-types'
import { createContext } from 'react'

export type WorkbenchSpikeMetricsActions = {
  readonly onEditorPanelMounted: (panelId: string) => void
  readonly onTerminalPanelMounted: (panelId: string) => void
  readonly onTerminalPanelResized: (panelId: string, size: WorkbenchSpikePanelSize) => void
}

export const WorkbenchSpikeMetricsContext = createContext<WorkbenchSpikeMetricsActions>({
  onEditorPanelMounted: noop,
  onTerminalPanelMounted: noop,
  onTerminalPanelResized: noopTerminalResize,
})

function noop() {}

function noopTerminalResize() {}
