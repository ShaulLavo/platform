import { describe, expect, it } from 'bun:test'

import { workbenchDockviewTheme, workbenchDockviewUsesChromeTabs } from './workbench-dockview-tabs'

describe('workbench Dockview tabs', () => {
  it('defaults production workbench tabs to the Chrome presentation', () => {
    expect(workbenchDockviewUsesChromeTabs('chrome')).toBe(true)
    expect(workbenchDockviewUsesChromeTabs('dockview-default')).toBe(false)
  })

  it('syncs Dockview theme colors without overriding native tab behavior', () => {
    const theme = workbenchDockviewTheme({ resolvedTheme: 'dark' })

    expect(theme).toEqual({
      className: 'dockview-theme-platform',
      colorScheme: 'dark',
      name: 'platform-dark',
    })
    expect('dndTabIndicator' in theme).toBe(false)
    expect('scrollbars' in theme).toBe(false)
    expect('tabGroupIndicator' in theme).toBe(false)
  })
})
