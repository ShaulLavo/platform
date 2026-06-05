import type { WorkbenchPanel } from './workbench-panel-types'
import { WorkbenchPanelUnavailable } from './workbench-panel-unavailable'

export function WorkbenchUnsupportedPanel({ panel }: { readonly panel: WorkbenchPanel }) {
  return (
    <WorkbenchPanelUnavailable message={`${panel.type} panels are not enabled in this phase.`} />
  )
}
