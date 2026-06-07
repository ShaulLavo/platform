import { expect, test } from '../../../../test/fixtures'

import {
  commandPaletteItemDisabledReason,
  commandPaletteSelectionLayoutOperation,
  layoutCommandPaletteItems,
  windowManagementActionPaletteItems,
} from '@/components/command-palette/command-palette-utils'
import { defaultWindowManagementHotkeyPresets } from '@/features/tiling-surface-manager/engine/layout-command-presets'
import { createClassicFirstRunWorkspaceLayout } from '@/features/tiling-surface-manager/engine/layout-builders'
import { CLOSE_ACTIVE_SURFACE_COMMAND_ID } from '@/features/tiling-surface-manager/engine/layout-command-catalog'
import {
  layoutCommandId,
  windowManagementCommandId,
} from '@/features/tiling-surface-manager/engine/layout-ids'
import type {
  CustomWindowFrame,
  CustomWindowManagementCommand,
  WorkspaceLayout,
  WorkspaceLayoutCommand,
} from '@/features/tiling-surface-manager/engine/layout-types'

test('layout command palette items expose custom and saved commands without built-in duplicates', () => {
  const customCommand: CustomWindowManagementCommand = {
    aliases: ['custom half'],
    category: 'Window Management',
    enabled: true,
    icon: 'panel-left',
    id: windowManagementCommandId('custom-left-half'),
    kind: 'custom-window',
    targetFrame: leftHalfFrame,
    title: 'Custom Left Half',
  }
  const savedCommand: WorkspaceLayoutCommand = {
    aliases: ['review layout'],
    enabled: true,
    icon: 'layout',
    id: layoutCommandId('review-layout'),
    slots: [
      {
        frame: leftHalfFrame,
        id: 'search',
        surfaceType: 'search-results',
      },
    ],
    title: 'Review Layout',
  }
  const layout: WorkspaceLayout = {
    ...createClassicFirstRunWorkspaceLayout(),
    layoutCommandsById: {
      [savedCommand.id]: savedCommand,
    },
    windowCommandsById: {
      [customCommand.id]: customCommand,
    },
  }

  const items = layoutCommandPaletteItems(layout)
  const customItem = items.find((item) => item.title === 'Custom Left Half')
  const savedItem = items.find((item) => item.title === 'Review Layout')

  expect(items.some((item) => item.id === `layout:${CLOSE_ACTIVE_SURFACE_COMMAND_ID}`)).toBe(false)
  expect(customItem?.command.kind).toBe('custom-window')
  expect(customItem?.category).toBe('Window Management')
  expect(customItem?.keywords).toContain('custom half')
  expect(savedItem?.command.kind).toBe('saved-layout')
  expect(savedItem?.category).toBe('Saved Layouts')
  expect(savedItem?.keywords).toContain('review layout')
  expect(
    customItem ? commandPaletteSelectionLayoutOperation(customItem.command, 42) : null,
  ).toMatchObject({
    command: customCommand,
    nowMs: 42,
    type: 'applyCustomWindowCommand',
  })
  expect(
    savedItem ? commandPaletteSelectionLayoutOperation(savedItem.command, 42) : null,
  ).toMatchObject({
    command: savedCommand,
    type: 'applyLayoutCommand',
  })
})

test('layout command palette items keep selector disabled reasons', () => {
  const customCommand: CustomWindowManagementCommand = {
    aliases: [],
    category: 'Window Management',
    enabled: false,
    icon: 'panel-left',
    id: windowManagementCommandId('disabled-left-half'),
    kind: 'custom-window',
    targetFrame: leftHalfFrame,
    title: 'Disabled Left Half',
  }
  const layout: WorkspaceLayout = {
    ...createClassicFirstRunWorkspaceLayout(),
    windowCommandsById: {
      [customCommand.id]: customCommand,
    },
  }
  const item = layoutCommandPaletteItems(layout).find(
    (candidate) => candidate.title === customCommand.title,
  )
  if (!item) throw new Error('Expected custom window command item')

  expect(
    commandPaletteItemDisabledReason(item, {
      activeFilePath: null,
      hasWorkspace: true,
      workspaceLayout: layout,
    }),
  ).toBe('Command is disabled.')
})

test('window management action items create definitions, settings, and hotkey preset operations', () => {
  const layout = createClassicFirstRunWorkspaceLayout()
  const items = windowManagementActionPaletteItems(layout)
  const customItem = items.find((item) => item.title === 'Create Custom Window Command')
  const layoutItem = items.find((item) => item.title === 'Create Layout Command')
  const settingsItem = items.find((item) => item.title === 'Window Management Settings')
  const preset = defaultWindowManagementHotkeyPresets()[0]
  if (!preset) throw new Error('Expected default hotkey preset')

  const presetItem = items.find((item) => item.title === `Apply ${preset.title} Hotkey Preset`)

  expect(
    customItem ? commandPaletteSelectionLayoutOperation(customItem.command, 1) : null,
  ).toMatchObject({
    command: expect.objectContaining({
      enabled: true,
      kind: 'custom-window',
      title: 'Custom Left Half',
    }),
    type: 'upsertCustomWindowCommand',
  })
  expect(
    layoutItem ? commandPaletteSelectionLayoutOperation(layoutItem.command, 1) : null,
  ).toMatchObject({
    command: expect.objectContaining({
      enabled: true,
      title: 'Saved Current Workspace',
    }),
    type: 'upsertLayoutCommand',
  })
  expect(
    settingsItem ? commandPaletteSelectionLayoutOperation(settingsItem.command, 1) : null,
  ).toMatchObject({
    surface: expect.objectContaining({
      title: 'Window Management Settings',
      type: 'placeholder',
    }),
    type: 'openSurface',
  })
  expect(
    presetItem ? commandPaletteSelectionLayoutOperation(presetItem.command, 1) : null,
  ).toMatchObject({
    preset,
    type: 'applyHotkeyPreset',
  })
})

const leftHalfFrame: CustomWindowFrame = {
  anchor: 'left',
  height: 100,
  offsetX: 0,
  offsetY: 0,
  unit: 'percent',
  width: 50,
}
