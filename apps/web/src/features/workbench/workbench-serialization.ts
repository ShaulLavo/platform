import {
  restoreWorkbenchPanel,
  type WorkbenchPanelRegistry,
} from '@/features/workbench/workbench-registry'

import type {
  SerializedWorkbenchPanel,
  SerializedWorkbenchState,
  WorkbenchPanel,
  WorkbenchRestoreContext,
  WorkbenchState,
} from './workbench-panel-types'
import { SERIALIZED_WORKBENCH_STATE_VERSION } from './workbench-panel-types'

export type WorkbenchRestoreFallbackReason =
  | 'invalid-layout'
  | 'invalid-state'
  | 'unsupported-version'

export type WorkbenchRestoreResult =
  | {
      readonly state: WorkbenchState
      readonly status: 'restored'
    }
  | {
      readonly reason: WorkbenchRestoreFallbackReason
      readonly state: WorkbenchState
      readonly status: 'fallback'
    }

export function createDefaultWorkbenchState(): WorkbenchState {
  return {
    activePanelId: null,
    layout: null,
    panels: [],
    version: SERIALIZED_WORKBENCH_STATE_VERSION,
  }
}

export function createSerializedWorkbenchState({
  activePanelId,
  layout,
  panels,
  registry,
}: {
  activePanelId: string | null
  layout: WorkbenchState['layout']
  panels: readonly WorkbenchPanel[]
  registry: WorkbenchPanelRegistry
}): SerializedWorkbenchState {
  const serializedPanels = panels.flatMap((panel) => serializeWorkbenchPanel(panel, registry))

  return {
    activePanelId: activePanelIdForPanels(activePanelId, serializedPanels),
    layout,
    panels: serializedPanels,
    version: SERIALIZED_WORKBENCH_STATE_VERSION,
  }
}

export function restoreSerializedWorkbenchState(
  value: unknown,
  registry: WorkbenchPanelRegistry,
  context: WorkbenchRestoreContext,
): WorkbenchRestoreResult {
  if (!isRecord(value)) return fallback('invalid-state')
  if (value.version !== SERIALIZED_WORKBENCH_STATE_VERSION) return fallback('unsupported-version')
  if (!Array.isArray(value.panels)) return fallback('invalid-state')
  if (!isNullableString(value.activePanelId)) return fallback('invalid-state')

  const panels = restoreSerializedWorkbenchPanels(value.panels, registry, context)
  const activePanelId = activePanelIdForPanels(value.activePanelId, panels)
  const state = {
    activePanelId,
    layout: null,
    panels,
    version: SERIALIZED_WORKBENCH_STATE_VERSION,
  }

  if (value.layout === null) return { state, status: 'restored' }
  if (!isSerializedDockviewLayout(value.layout)) {
    return { reason: 'invalid-layout', state, status: 'fallback' }
  }

  return {
    state: { ...state, layout: value.layout },
    status: 'restored',
  }
}

function fallback(reason: WorkbenchRestoreFallbackReason): WorkbenchRestoreResult {
  return {
    reason,
    state: createDefaultWorkbenchState(),
    status: 'fallback',
  }
}

function serializeWorkbenchPanel(
  panel: WorkbenchPanel,
  registry: WorkbenchPanelRegistry,
): SerializedWorkbenchPanel[] {
  const serialized = registry.get(panel.type)?.serialize(panel)
  if (!serialized) return []

  return [serialized]
}

function restoreSerializedWorkbenchPanels(
  values: readonly unknown[],
  registry: WorkbenchPanelRegistry,
  context: WorkbenchRestoreContext,
) {
  const panels: WorkbenchPanel[] = []
  const seenPanelIds = new Set<string>()

  for (const value of values) {
    const panel = restoreWorkbenchPanel(registry, value, context)
    if (!panel) continue
    if (seenPanelIds.has(panel.id)) continue

    seenPanelIds.add(panel.id)
    panels.push(panel)
  }

  return panels
}

function activePanelIdForPanels(
  activePanelId: string | null,
  panels: readonly { readonly id: string }[],
) {
  if (!activePanelId) return panels.at(0)?.id ?? null
  if (panels.some((panel) => panel.id === activePanelId)) return activePanelId

  return panels.at(0)?.id ?? null
}

function isSerializedDockviewLayout(value: unknown) {
  if (!isRecord(value)) return false
  if (!isRecord(value.grid)) return false

  return isRecord(value.panels)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
