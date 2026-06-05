import type {
  WorkbenchSpikePanel,
  WorkbenchSpikePanelType,
  WorkbenchSpikeSerializedState,
} from '@/features/workbench-spike/workbench-spike-types'
import type { SerializedDockview } from 'dockview-react'

export function createWorkbenchSpikeSerializedState({
  activePanelId,
  layout,
  panels,
}: {
  activePanelId: string | null
  layout: SerializedDockview
  panels: readonly WorkbenchSpikePanel[]
}): WorkbenchSpikeSerializedState {
  return {
    activePanelId,
    layout,
    panels,
    version: 1,
  }
}

export function formatWorkbenchSpikeSerializedState(state: WorkbenchSpikeSerializedState | null) {
  if (!state) return 'No serialized layout saved yet.'

  return JSON.stringify(state, null, 2)
}

export function parseWorkbenchSpikeSerializedState(
  value: unknown,
): WorkbenchSpikeSerializedState | null {
  if (!isRecord(value)) return null
  if (value.version !== 1) return null
  if (!isSerializedDockview(value.layout)) return null
  if (!Array.isArray(value.panels)) return null
  if (!isNullableString(value.activePanelId)) return null
  if (!value.panels.every(isWorkbenchSpikePanel)) return null

  return {
    activePanelId: value.activePanelId,
    layout: value.layout,
    panels: value.panels,
    version: 1,
  }
}

function isSerializedDockview(value: unknown): value is SerializedDockview {
  if (!isRecord(value)) return false
  if (!isRecord(value.grid)) return false

  return isRecord(value.panels)
}

function isWorkbenchSpikePanel(value: unknown): value is WorkbenchSpikePanel {
  if (!isRecord(value)) return false
  if (!isPanelType(value.type)) return false
  if (typeof value.id !== 'string') return false
  if (typeof value.title !== 'string') return false
  if (typeof value.subtitle !== 'string') return false
  if (typeof value.description !== 'string') return false

  return typeof value.fixtureText === 'string' || value.fixtureText === undefined
}

function isPanelType(value: unknown): value is WorkbenchSpikePanelType {
  return value === 'file' || value === 'diff' || value === 'terminal' || value === 'search'
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
