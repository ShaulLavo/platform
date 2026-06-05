import type { DockviewTheme } from 'dockview-react'

import type { ResolvedTheme } from '@/components/theme-context'

export type WorkbenchDockviewTabPresentation = 'chrome' | 'dockview-default'

export const DEFAULT_WORKBENCH_DOCKVIEW_TAB_PRESENTATION: WorkbenchDockviewTabPresentation =
  'chrome'

export function workbenchDockviewTheme({
  resolvedTheme,
}: {
  readonly resolvedTheme: ResolvedTheme
}): DockviewTheme {
  return {
    className: 'dockview-theme-platform',
    colorScheme: resolvedTheme,
    name: `platform-${resolvedTheme}`,
  }
}

export function workbenchDockviewUsesChromeTabs(tabPresentation: WorkbenchDockviewTabPresentation) {
  return tabPresentation === 'chrome'
}
