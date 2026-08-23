import type { SettingsValues } from '@workspace/contracts'
import { createContext } from 'react'

export const WorkbenchDensityBootContext = createContext<
  SettingsValues['workbench.density'] | null
>(null)
