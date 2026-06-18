import type { PlatformCommandId } from '@/keymap/types'

import type { ColorModePaletteItem, ViewPaletteItem } from './command-palette-types'

export const paletteModeCommands: ReadonlySet<PlatformCommandId> = new Set([
  'workspace.gotoSymbol',
  'workspace.quickOpenView',
  'workspace.selectColorMode',
  'workspace.showAllEditors',
  'workspace.showCommandPalette',
  'workspace.showQuickAccess',
])

export const selectedFileCommands: ReadonlySet<PlatformCommandId> = new Set([
  'workspace.closeCurrentTab',
  'workspace.gotoSymbol',
  'workspace.revertFile',
  'workspace.saveFile',
])

export const hiddenCommandPaletteCommands: ReadonlySet<PlatformCommandId> = new Set([
  'workspace.setDarkTheme',
  'workspace.setLightTheme',
  'workspace.setSystemTheme',
  'workspace.showCommandPalette',
])

export const workspaceOptionalCommands: ReadonlySet<PlatformCommandId> = new Set([
  'workspace.openFilePicker',
  'workspace.selectColorMode',
  'workspace.setDarkTheme',
  'workspace.setLightTheme',
  'workspace.setSystemTheme',
  'workspace.showCommandPalette',
])

export const viewPaletteItems: readonly ViewPaletteItem[] = [
  {
    command: 'workspace.focusFileTree',
    description: 'Focus the workspace file explorer.',
    title: 'Explorer',
    value: 'view:explorer',
  },
  {
    command: 'workspace.focusGit',
    description: 'Focus source control.',
    title: 'Source Control',
    value: 'view:source-control',
  },
  {
    command: 'workspace.openSearchEditor',
    description: 'Open workspace search results in an editor tab.',
    title: 'Search',
    value: 'view:search',
  },
  {
    command: 'workspace.focusEditor',
    description: 'Focus the active editor.',
    title: 'Editor',
    value: 'view:editor',
  },
  {
    command: 'workspace.openFilePicker',
    description: 'Choose a workspace folder.',
    title: 'Open Folder',
    value: 'view:open-folder',
  },
]

export const colorModePaletteItems: readonly ColorModePaletteItem[] = [
  {
    command: 'workspace.setLightTheme',
    description: 'Use light color mode.',
    mode: 'light',
    title: 'Light',
    value: 'color-mode:light',
  },
  {
    command: 'workspace.setDarkTheme',
    description: 'Use dark color mode.',
    mode: 'dark',
    title: 'Dark',
    value: 'color-mode:dark',
  },
  {
    command: 'workspace.setSystemTheme',
    description: 'Follow the system color mode.',
    mode: 'system',
    title: 'System',
    value: 'color-mode:system',
  },
]
