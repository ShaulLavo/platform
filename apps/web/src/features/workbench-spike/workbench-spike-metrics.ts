import type {
  WorkbenchSpikeMetrics,
  WorkbenchSpikePanelSize,
} from '@/features/workbench-spike/workbench-spike-types'

export function createWorkbenchSpikeMetrics(): WorkbenchSpikeMetrics {
  return {
    activePanelId: null,
    editorMountsByPanelId: {},
    layoutEvents: 0,
    terminalMountsByPanelId: {},
    terminalSizeByPanelId: {},
  }
}

export function recordWorkbenchSpikeActivePanel(
  metrics: WorkbenchSpikeMetrics,
  activePanelId: string | null,
): WorkbenchSpikeMetrics {
  return {
    ...metrics,
    activePanelId,
  }
}

export function recordWorkbenchSpikeLayoutEvent(
  metrics: WorkbenchSpikeMetrics,
): WorkbenchSpikeMetrics {
  return {
    ...metrics,
    layoutEvents: metrics.layoutEvents + 1,
  }
}

export function recordWorkbenchSpikeEditorMount(
  metrics: WorkbenchSpikeMetrics,
  panelId: string,
): WorkbenchSpikeMetrics {
  return {
    ...metrics,
    editorMountsByPanelId: incrementRecord(metrics.editorMountsByPanelId, panelId),
  }
}

export function recordWorkbenchSpikeTerminalMount(
  metrics: WorkbenchSpikeMetrics,
  panelId: string,
): WorkbenchSpikeMetrics {
  return {
    ...metrics,
    terminalMountsByPanelId: incrementRecord(metrics.terminalMountsByPanelId, panelId),
  }
}

export function recordWorkbenchSpikeTerminalSize(
  metrics: WorkbenchSpikeMetrics,
  panelId: string,
  size: WorkbenchSpikePanelSize,
): WorkbenchSpikeMetrics {
  return {
    ...metrics,
    terminalSizeByPanelId: {
      ...metrics.terminalSizeByPanelId,
      [panelId]: size,
    },
  }
}

function incrementRecord(record: Readonly<Record<string, number>>, key: string) {
  return {
    ...record,
    [key]: (record[key] ?? 0) + 1,
  }
}
