import type { SettingsValues } from '@workspace/contracts'
import { useContext } from 'react'

import { useSettingsProjection } from '@/features/settings/hooks/use-settings-projection'
import { WorkbenchDensityBootContext } from '@/features/settings/providers/density-context'

export function useWorkbenchDensity(): SettingsValues['workbench.density'] {
  const projection = useSettingsProjection()
  const bootDensity = useContext(WorkbenchDensityBootContext)
  const snapshotDensity = projection?.values['workbench.density']
  if (snapshotDensity) return snapshotDensity

  // Freeze virtual geometry to the value this window painted. Another window
  // may update the shared mirror while this one's settings query is pending.
  if (bootDensity) return bootDensity

  return document.documentElement.dataset.density === 'compact' ? 'compact' : 'cozy'
}
