import type {
  WorkbenchSpikePanel,
  WorkbenchSpikePanelParams,
  WorkbenchSpikePanelType,
} from '@/features/workbench-spike/workbench-spike-types'
import type { AddPanelPositionOptions, DockviewApi } from 'dockview-react'

export const WORKBENCH_SPIKE_DOCKVIEW_COMPONENT = 'workbenchSpikePanel'

const FILE_FIXTURE = `import { createWorkbenchPanel } from './registry'

export function openWorkbenchPanel(path: string) {
  const panel = createWorkbenchPanel({
    type: 'file',
    path,
  })

  return panel
}
`

export function createInitialWorkbenchSpikePanels(): readonly WorkbenchSpikePanel[] {
  return [
    {
      description: 'Actual editor host backed by an in-memory EditorTextBuffer and view session.',
      fixtureText: FILE_FIXTURE,
      id: 'file:/repo/src/workbench-panel.ts',
      subtitle: 'src/workbench-panel.ts',
      title: 'workbench-panel.ts',
      type: 'file',
    },
    {
      description: 'Diff panel metadata restored through the same registry path as files.',
      id: 'diff:working-tree:src/workbench-panel.ts',
      subtitle: 'working tree',
      title: 'workbench-panel.ts diff',
      type: 'diff',
    },
    {
      description: 'Singleton search surface that can share a group with editors and diffs.',
      id: 'search:workspace',
      subtitle: 'workspace search',
      title: 'Search',
      type: 'search',
    },
    createWorkbenchSpikeTerminalPanel(1),
  ]
}

export function createWorkbenchSpikeTerminalPanel(index: number): WorkbenchSpikePanel {
  return {
    description: 'Ghostty terminal renderer without a server socket, used to validate Dockview resize.',
    id: `terminal:spike:${index}`,
    subtitle: `session ${index}`,
    title: `Terminal ${index}`,
    type: 'terminal',
  }
}

export function addWorkbenchSpikeDefaultLayout(
  api: DockviewApi,
  panels: readonly WorkbenchSpikePanel[],
) {
  const filePanel = findWorkbenchSpikePanel(panels, 'file')
  const diffPanel = findWorkbenchSpikePanel(panels, 'diff')
  const searchPanel = findWorkbenchSpikePanel(panels, 'search')
  const terminalPanel = findWorkbenchSpikePanel(panels, 'terminal')
  const anchor = filePanel ? addWorkbenchSpikePanel(api, filePanel) : null

  if (anchor && diffPanel) {
    addWorkbenchSpikePanel(api, diffPanel, {
      direction: 'within',
      referencePanel: anchor.id,
    })
  }
  if (anchor && searchPanel) {
    addWorkbenchSpikePanel(api, searchPanel, {
      direction: 'right',
      referencePanel: anchor.id,
    })
  }
  if (anchor && terminalPanel) {
    addWorkbenchSpikePanel(api, terminalPanel, {
      direction: 'below',
      referencePanel: anchor.id,
    })
  }
}

export function addWorkbenchSpikePanel(
  api: DockviewApi,
  panel: WorkbenchSpikePanel,
  position?: AddPanelPositionOptions,
) {
  return api.addPanel<WorkbenchSpikePanelParams>({
    component: WORKBENCH_SPIKE_DOCKVIEW_COMPONENT,
    id: panel.id,
    params: { panel },
    position,
    renderer: rendererForWorkbenchSpikePanel(panel),
    title: panel.title,
  })
}

export function findWorkbenchSpikePanel(
  panels: readonly WorkbenchSpikePanel[],
  type: WorkbenchSpikePanelType,
) {
  return panels.find((panel) => panel.type === type) ?? null
}

function rendererForWorkbenchSpikePanel(panel: WorkbenchSpikePanel) {
  if (panel.type === 'file') return 'always'
  if (panel.type === 'terminal') return 'always'

  return 'onlyWhenVisible'
}
