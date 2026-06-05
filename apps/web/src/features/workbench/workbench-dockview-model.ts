import {
  activeEditorPaneTab,
  editorPaneLeaves,
  type EditorPaneLeaf,
  type EditorPaneLayout,
  type EditorPaneTab,
} from '@/features/editor/state/editor-pane-state'
import { parseDiffDocumentId } from '@/features/git/diff-document'
import type { AddPanelOptions, DockviewApi, IDockviewPanel } from 'dockview-react'

import { createDiffWorkbenchPanel, createFileWorkbenchPanel } from './workbench-panel-ids'
import type { WorkbenchPanel, WorkbenchPanelRegistry } from './workbench-panel-types'
import { workbenchPanelDescriptor } from './workbench-registry'

export type WorkbenchDockviewPanelParams = {
  readonly panel: WorkbenchPanel
}

export type WorkbenchDockviewPanelRecord = {
  readonly paneId: string
  readonly panel: WorkbenchPanel
  readonly tabId: string
}

export function workbenchDockviewPanelRecordsForEditorLayout(
  layout: EditorPaneLayout,
): readonly WorkbenchDockviewPanelRecord[] {
  const activePanelId = workbenchDockviewActivePanelIdForEditorLayout(layout)
  const records = new Map<string, WorkbenchDockviewPanelRecord>()

  for (const pane of editorPaneLeaves(layout.root)) {
    appendWorkbenchDockviewPaneRecords(records, pane, activePanelId)
  }

  return Array.from(records.values())
}

export function workbenchDockviewActivePanelIdForEditorLayout(layout: EditorPaneLayout) {
  const tab = activeEditorPaneTab(layout)
  if (!tab) return null

  return workbenchDockviewPanelForPath(tab.path).id
}

export function workbenchDockviewRecordMap(records: readonly WorkbenchDockviewPanelRecord[]) {
  return new Map(records.map((record) => [record.panel.id, record]))
}

export function syncWorkbenchDockviewPanels({
  activePanelId,
  api,
  records,
  registry,
}: {
  readonly activePanelId: string | null
  readonly api: DockviewApi
  readonly records: readonly WorkbenchDockviewPanelRecord[]
  readonly registry: WorkbenchPanelRegistry
}) {
  const recordsById = workbenchDockviewRecordMap(records)

  removeStaleDockviewPanels(api, recordsById)
  for (const record of records) {
    addOrUpdateDockviewPanel(api, record, registry)
  }
  syncWorkbenchDockviewPanelOrder(api, records)
  activateDockviewPanel(api, activePanelId)
}

export function workbenchDockviewPanelForPath(path: string): WorkbenchPanel {
  if (parseDiffDocumentId(path)) return createDiffWorkbenchPanel(path)

  return createFileWorkbenchPanel(path)
}

function workbenchDockviewPanelRecordForTab(
  paneId: string,
  tab: EditorPaneTab,
): WorkbenchDockviewPanelRecord {
  return {
    paneId,
    panel: workbenchDockviewPanelForPath(tab.path),
    tabId: tab.id,
  }
}

function appendWorkbenchDockviewPaneRecords(
  records: Map<string, WorkbenchDockviewPanelRecord>,
  pane: EditorPaneLeaf,
  activePanelId: string | null,
) {
  for (const tab of pane.tabs) {
    appendWorkbenchDockviewTabRecord(records, pane.id, tab, activePanelId)
  }
}

function appendWorkbenchDockviewTabRecord(
  records: Map<string, WorkbenchDockviewPanelRecord>,
  paneId: string,
  tab: EditorPaneTab,
  activePanelId: string | null,
) {
  const record = workbenchDockviewPanelRecordForTab(paneId, tab)
  if (records.has(record.panel.id) && record.panel.id !== activePanelId) return

  records.set(record.panel.id, record)
}

function removeStaleDockviewPanels(
  api: DockviewApi,
  recordsById: ReadonlyMap<string, WorkbenchDockviewPanelRecord>,
) {
  for (const panel of Array.from(api.panels)) {
    if (recordsById.has(panel.id)) continue

    api.removePanel(panel)
  }
}

function addOrUpdateDockviewPanel(
  api: DockviewApi,
  record: WorkbenchDockviewPanelRecord,
  registry: WorkbenchPanelRegistry,
) {
  const descriptor = workbenchPanelDescriptor(registry, record.panel.type)
  if (!descriptor) return

  const panel = api.getPanel(record.panel.id)
  const options = dockviewPanelOptions(record.panel, descriptor)
  if (!panel) {
    api.addPanel(options)
    return
  }

  updateDockviewPanel(panel, options)
}

function dockviewPanelOptions(
  panel: WorkbenchPanel,
  descriptor: NonNullable<ReturnType<typeof workbenchPanelDescriptor>>,
): AddPanelOptions<WorkbenchDockviewPanelParams> {
  return {
    component: descriptor.component,
    id: panel.id,
    params: { panel },
    renderer: descriptor.rendererPolicy(panel),
    title: descriptor.title(panel),
  }
}

function updateDockviewPanel(
  panel: IDockviewPanel,
  options: AddPanelOptions<WorkbenchDockviewPanelParams>,
) {
  if (panel.api.title !== options.title) panel.api.setTitle(options.title ?? '')
  if (panel.api.renderer !== options.renderer) panel.api.setRenderer(options.renderer ?? 'always')

  panel.api.updateParameters(options.params ?? {})
}

function syncWorkbenchDockviewPanelOrder(
  api: DockviewApi,
  records: readonly WorkbenchDockviewPanelRecord[],
) {
  const panelOrder = new Map(records.map((record, index) => [record.panel.id, index]))

  for (const group of api.groups) {
    for (const tabGroup of group.model.getTabGroups()) {
      const nextPanelIds = Array.from(tabGroup.panelIds).sort(
        (left, right) => panelOrderIndex(panelOrder, left) - panelOrderIndex(panelOrder, right),
      )

      for (const [index, panelId] of nextPanelIds.entries()) {
        if (tabGroup.panelIds[index] === panelId) continue

        group.model.movePanelWithinGroup(tabGroup.id, panelId, index)
      }
    }
  }
}

function panelOrderIndex(order: ReadonlyMap<string, number>, panelId: string) {
  return order.get(panelId) ?? Number.MAX_SAFE_INTEGER
}

function activateDockviewPanel(api: DockviewApi, activePanelId: string | null) {
  if (!activePanelId) return

  const panel = api.getPanel(activePanelId)
  if (!panel) return
  if (panel.api.isActive) return

  panel.api.setActive()
}
