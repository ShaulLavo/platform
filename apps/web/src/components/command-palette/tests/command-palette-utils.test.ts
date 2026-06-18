import { expect, test } from '../../../../test/fixtures'

import {
  commandDisabledReason,
  commandPaletteItems,
  fileBackedPath,
  groupedCommandItems,
  quickAccessMode,
  quickAccessQuery,
} from '@/components/command-palette/command-palette-utils'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'
import { platformCommandSpecs } from '@/keymap/command-registry'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'

test('command palette items expose platform command metadata and shortcuts', () => {
  const items = commandPaletteItems(platformCommandSpecs, defaultPlatformKeyBindings('linux'))
  const quickOpen = items.find((item) => item.id === 'workspace.showQuickAccess')

  expect(quickOpen).toMatchObject({
    category: 'Workspace',
    command: { command: 'workspace.showQuickAccess', kind: 'platform' },
    shortcut: expect.stringMatching(/P$/u),
    title: 'Quick Open',
  })
  expect(quickOpen?.keywords).toContain('workbench.action.quickOpen')
})

test('command groups rank strong command matches above earlier weak fuzzy groups', () => {
  const items = commandPaletteItems(platformCommandSpecs, defaultPlatformKeyBindings('linux'))
  const groups = groupedCommandItems(items, '> color')

  expect(groups[0]?.[0]).toBe('Appearance')
  expect(groups[0]?.[1].map((item) => item.id)).toEqual(['workspace.selectColorMode'])
  expect(groups.flatMap(([, groupItems]) => groupItems.map((item) => item.id))).not.toContain(
    'workspace.toggleSidebarVisibility',
  )
})

test('workspace commands require a workspace unless explicitly optional', () => {
  expect(
    commandDisabledReason('workspace.focusEditor', {
      activeFilePath: null,
      hasWorkspace: false,
    }),
  ).toBe('No workspace open.')
  expect(
    commandDisabledReason('workspace.showCommandPalette', {
      activeFilePath: null,
      hasWorkspace: false,
    }),
  ).toBeNull()
})

test('selected-file commands require a file-backed active editor', () => {
  expect(
    commandDisabledReason('workspace.saveFile', {
      activeFilePath: null,
      hasWorkspace: true,
    }),
  ).toBe('No file-backed surface is active.')
  expect(
    commandDisabledReason('workspace.saveFile', {
      activeFilePath: searchBufferDocumentId('/repo'),
      hasWorkspace: true,
    }),
  ).toBe('No file-backed surface is active.')
  expect(
    commandDisabledReason('workspace.saveFile', {
      activeFilePath: '/repo/src/app.ts',
      hasWorkspace: true,
    }),
  ).toBeNull()
})

test('file-backed paths exclude transient search buffers', () => {
  expect(fileBackedPath(null)).toBeNull()
  expect(fileBackedPath(searchBufferDocumentId('/repo'))).toBeNull()
  expect(fileBackedPath('/repo/src/app.ts')).toBe('/repo/src/app.ts')
})

test('quick access prefixes select the expected mode and query', () => {
  expect(quickAccessMode('view git')).toBe('views')
  expect(quickAccessQuery('view git')).toBe('git')
  expect(quickAccessMode('color dark')).toBe('colorMode')
  expect(quickAccessQuery('> save')).toBe('save')
  expect(quickAccessMode('@ Component')).toBe('symbols')
})
