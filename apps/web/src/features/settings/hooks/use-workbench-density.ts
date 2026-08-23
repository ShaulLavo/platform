import type { SettingsValues } from '@workspace/contracts'
import { useContext } from 'react'

import { WorkbenchDensityBootContext } from '../providers/density-context'
import { useSettings } from './use-settings'

export function useWorkbenchDensity(): SettingsValues['workbench.density'] {
  const settings = useSettings()
  const bootDensity = useContext(WorkbenchDensityBootContext)
  const snapshotDensity = settings.data?.values['workbench.density']
  if (snapshotDensity) return snapshotDensity

  // Freeze virtual geometry to the value this window painted. Another window
  // may update the shared mirror while this one's settings query is pending.
  if (bootDensity) return bootDensity

  return document.documentElement.dataset.density === 'compact' ? 'compact' : 'cozy'
}
