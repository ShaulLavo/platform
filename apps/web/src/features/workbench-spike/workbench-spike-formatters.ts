import type {
  WorkbenchSpikeMetrics,
  WorkbenchSpikePanelSize,
} from '@/features/workbench-spike/workbench-spike-types'

export function formatWorkbenchSpikeMounts(record: Readonly<Record<string, number>>) {
  const entries = Object.entries(record)
  if (entries.length === 0) return 'none'

  return entries.map(([panelId, count]) => `${panelId}: ${count}`).join(', ')
}

export function formatWorkbenchSpikeTerminalSize(size: WorkbenchSpikePanelSize | undefined) {
  if (!size) return 'pending'

  return `${size.cols}x${size.rows} cells, ${Math.round(size.width)}x${Math.round(size.height)} px`
}

export function latestWorkbenchSpikeTerminalSize(metrics: WorkbenchSpikeMetrics) {
  const sizes = Object.values(metrics.terminalSizeByPanelId)
  if (sizes.length === 0) return undefined

  return sizes.at(-1)
}
