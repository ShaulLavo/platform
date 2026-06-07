import { expect, test } from '../../../../test/fixtures'

import {
  commandPaletteItemDisabledReason,
  commandPaletteSelectionLayoutOperation,
  layoutCommandPaletteItems,
} from '@/components/command-palette/command-palette-utils'
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

const leftHalfFrame: CustomWindowFrame = {
  anchor: 'left',
  height: 100,
  offsetX: 0,
  offsetY: 0,
  unit: 'percent',
  width: 50,
}
