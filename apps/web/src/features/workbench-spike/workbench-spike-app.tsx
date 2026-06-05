import type { ComponentType } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type IDisposable,
} from 'dockview-react'

import {
  addWorkbenchSpikeDefaultLayout,
  addWorkbenchSpikePanel,
  createInitialWorkbenchSpikePanels,
  createWorkbenchSpikeTerminalPanel,
  findWorkbenchSpikePanel,
} from '@/features/workbench-spike/workbench-spike-panels'
import { WorkbenchSpikeDockviewPanel } from '@/features/workbench-spike/workbench-spike-dockview-panel'
import {
  createWorkbenchSpikeMetrics,
  recordWorkbenchSpikeActivePanel,
  recordWorkbenchSpikeEditorMount,
  recordWorkbenchSpikeLayoutEvent,
  recordWorkbenchSpikeTerminalMount,
  recordWorkbenchSpikeTerminalSize,
} from '@/features/workbench-spike/workbench-spike-metrics'
import { WorkbenchSpikeMetricsContext } from '@/features/workbench-spike/workbench-spike-metrics-context'
import {
  createWorkbenchSpikeSerializedState,
  formatWorkbenchSpikeSerializedState,
} from '@/features/workbench-spike/workbench-spike-serialization'
import {
  clearWorkbenchSpikeState,
  readWorkbenchSpikeState,
  writeWorkbenchSpikeState,
} from '@/features/workbench-spike/workbench-spike-storage'
import { WorkbenchSpikeToolbar } from '@/features/workbench-spike/workbench-spike-toolbar'
import type {
  WorkbenchSpikePanel,
  WorkbenchSpikePanelSize,
  WorkbenchSpikeSerializedState,
} from '@/features/workbench-spike/workbench-spike-types'
import { WorkbenchSpikeWatermark } from '@/features/workbench-spike/workbench-spike-watermark'

const dockviewComponents = {
  workbenchSpikePanel: WorkbenchSpikeDockviewPanel as ComponentType<IDockviewPanelProps>,
}

export function WorkbenchSpikeApp() {
  const apiRef = useRef<DockviewApi | null>(null)
  const disposablesRef = useRef<IDisposable[]>([])
  const panelSequenceRef = useRef(2)
  const panelsRef = useRef<readonly WorkbenchSpikePanel[]>([])
  const [metrics, setMetrics] = useState(createWorkbenchSpikeMetrics)
  const [panels, setPanels] = useState<readonly WorkbenchSpikePanel[]>([])
  const [savedState, setSavedState] = useState<WorkbenchSpikeSerializedState | null>(() =>
    readWorkbenchSpikeState(),
  )
  const [serializedStateText, setSerializedStateText] = useState(() =>
    formatWorkbenchSpikeSerializedState(readWorkbenchSpikeState()),
  )
  const metricsActions = {
    onEditorPanelMounted: (panelId: string) =>
      setMetrics((current) => recordWorkbenchSpikeEditorMount(current, panelId)),
    onTerminalPanelMounted: (panelId: string) =>
      setMetrics((current) => recordWorkbenchSpikeTerminalMount(current, panelId)),
    onTerminalPanelResized: (panelId: string, size: WorkbenchSpikePanelSize) =>
      setMetrics((current) => recordWorkbenchSpikeTerminalSize(current, panelId, size)),
  }

  function persistCurrentState() {
    const api = apiRef.current
    if (!api) return null

    const state = createWorkbenchSpikeSerializedState({
      activePanelId: api.activePanel?.id ?? null,
      layout: api.toJSON(),
      panels: panelsRef.current,
    })
    writeWorkbenchSpikeState(state)
    setSavedState(state)
    setSerializedStateText(formatWorkbenchSpikeSerializedState(state))
    return state
  }

  function handleReady(event: DockviewReadyEvent) {
    apiRef.current = event.api
    replaceDisposables(disposablesRef.current, [
      event.api.onDidActivePanelChange((panel) =>
        setMetrics((current) => recordWorkbenchSpikeActivePanel(current, panel?.id ?? null)),
      ),
      event.api.onDidLayoutChange(() => {
        setMetrics(recordWorkbenchSpikeLayoutEvent)
        persistCurrentState()
      }),
    ])
    restoreOrSeedWorkbench(event.api, setWorkbenchPanels)
  }

  useEffect(() => {
    return () => replaceDisposables(disposablesRef.current, [])
  }, [])

  function setWorkbenchPanels(nextPanels: readonly WorkbenchSpikePanel[]) {
    panelsRef.current = nextPanels
    setPanels(nextPanels)
  }

  function restoreOrSeedWorkbench(
    api: DockviewApi,
    updatePanels: (nextPanels: readonly WorkbenchSpikePanel[]) => void,
  ) {
    const state = readWorkbenchSpikeState()
    if (state) {
      updatePanels(state.panels)
      api.fromJSON(state.layout)
      setSavedState(state)
      setSerializedStateText(formatWorkbenchSpikeSerializedState(state))
      return
    }

    const nextPanels = createInitialWorkbenchSpikePanels()
    updatePanels(nextPanels)
    addWorkbenchSpikeDefaultLayout(api, nextPanels)
    persistCurrentState()
  }

  function handleAddTerminal() {
    const api = apiRef.current
    if (!api) return

    const panel = createWorkbenchSpikeTerminalPanel(panelSequenceRef.current)
    panelSequenceRef.current += 1
    setWorkbenchPanels([...panelsRef.current, panel])
    addWorkbenchSpikePanel(api, panel, terminalPlacement(api))
    persistCurrentState()
  }

  function handleAddSearch() {
    const api = apiRef.current
    const existing = findWorkbenchSpikePanel(panelsRef.current, 'search')
    if (!api || !existing) return

    api.getPanel(existing.id)?.api.setActive()
    persistCurrentState()
  }

  function handleRestore() {
    const api = apiRef.current
    const state = readWorkbenchSpikeState()
    if (!api || !state) return

    setWorkbenchPanels(state.panels)
    api.fromJSON(state.layout)
    setSavedState(state)
    setSerializedStateText(formatWorkbenchSpikeSerializedState(state))
  }

  function handleReset() {
    const api = apiRef.current
    if (!api) return

    clearWorkbenchSpikeState()
    api.clear()
    const nextPanels = createInitialWorkbenchSpikePanels()
    setWorkbenchPanels(nextPanels)
    addWorkbenchSpikeDefaultLayout(api, nextPanels)
    persistCurrentState()
  }

  return (
    <WorkbenchSpikeMetricsContext value={metricsActions}>
      <main className='workbench-spike-root'>
        <WorkbenchSpikeToolbar
          metrics={metrics}
          panelCount={panels.length}
          savedState={savedState}
          onAddSearch={handleAddSearch}
          onAddTerminal={handleAddTerminal}
          onReset={handleReset}
          onRestore={handleRestore}
          onSave={persistCurrentState}
        />
        <section className='workbench-spike-layout dockview-theme-platform'>
          <DockviewReact
            components={dockviewComponents}
            defaultRenderer='always'
            disableFloatingGroups
            singleTabMode='default'
            watermarkComponent={WorkbenchSpikeWatermark}
            onReady={handleReady}
          />
        </section>
        <aside className='workbench-spike-serialized'>
          <h2>Serialized Workbench State</h2>
          <pre>{serializedStateText}</pre>
        </aside>
      </main>
    </WorkbenchSpikeMetricsContext>
  )
}

function terminalPlacement(api: DockviewApi) {
  const activePanel = api.activePanel
  if (!activePanel) return { direction: 'below' as const }

  return {
    direction: 'below' as const,
    referencePanel: activePanel.id,
  }
}

function replaceDisposables(target: IDisposable[], next: IDisposable[]) {
  for (const disposable of target) disposable.dispose()
  target.splice(0, target.length, ...next)
}
