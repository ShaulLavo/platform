import type { SerializedDockview } from 'dockview-react'

export type WorkbenchSpikePanelType = 'file' | 'diff' | 'terminal' | 'search'

export type WorkbenchSpikePanel = {
  readonly id: string
  readonly type: WorkbenchSpikePanelType
  readonly title: string
  readonly subtitle: string
  readonly description: string
  readonly fixtureText?: string
}

export type WorkbenchSpikePanelParams = {
  readonly panel: WorkbenchSpikePanel
}

export type WorkbenchSpikeSerializedState = {
  readonly activePanelId: string | null
  readonly layout: SerializedDockview
  readonly panels: readonly WorkbenchSpikePanel[]
  readonly version: 1
}

export type WorkbenchSpikePanelSize = {
  readonly cols: number
  readonly height: number
  readonly rows: number
  readonly width: number
}

export type WorkbenchSpikeMetrics = {
  readonly activePanelId: string | null
  readonly editorMountsByPanelId: Readonly<Record<string, number>>
  readonly layoutEvents: number
  readonly terminalMountsByPanelId: Readonly<Record<string, number>>
  readonly terminalSizeByPanelId: Readonly<Record<string, WorkbenchSpikePanelSize>>
}
