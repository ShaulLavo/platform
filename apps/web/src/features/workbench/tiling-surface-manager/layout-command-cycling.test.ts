import { describe, expect, it } from 'bun:test'

import { createClassicFirstRunWorkspaceLayout, createFileEditorSurface } from './layout-builders'
import { defaultWindowManagementHotkeyPresets } from './layout-command-presets'
import {
  commandCycleScopeKey,
  commandCycleStateShouldReset,
  layoutWithResetCommandCycleState,
  selectCommandCycleStep,
} from './layout-command-cycling'
import { commandAliasSearchMetadata } from './layout-command-catalog'
import { windowManagementCommandId } from './layout-ids'
import { openSurface } from './layout-operations'
import type {
  CommandCycleRule,
  CustomWindowFrame,
  WindowManagementCommand,
  WorkspaceLayout,
} from './layout-types'

describe('tiling surface layout command helpers', () => {
  it('advances cycling steps and resets by command, surface scope, and timeout', () => {
    const commandId = windowManagementCommandId('cycle-test')
    const layout = createClassicFirstRunWorkspaceLayout()
    const first = selectCommandCycleStep(layout, {
      commandId,
      cycleRule: cycleRule(),
      defaultFrame: frame('left'),
      nowMs: 10,
    })
    const withCycleState = {
      ...layout,
      commandCycleState: first.cycleState,
    } satisfies WorkspaceLayout
    const second = selectCommandCycleStep(withCycleState, {
      commandId,
      cycleRule: cycleRule(),
      defaultFrame: frame('left'),
      nowMs: 20,
    })
    const file = createFileEditorSurface({ path: '/repo/src/cycle.ts' })
    const changedSurface = openSurface(withCycleState, file)

    expect(first.cycleState?.stepIndex).toBe(0)
    expect(second.cycleState?.stepIndex).toBe(1)
    expect(
      commandCycleStateShouldReset(withCycleState, {
        commandId: windowManagementCommandId('other-cycle'),
        nowMs: 20,
        resetMs: 1000,
        scope: 'surface',
      }),
    ).toBe(true)
    expect(
      commandCycleStateShouldReset(changedSurface, {
        commandId,
        nowMs: 20,
        resetMs: 1000,
        scope: 'surface',
      }),
    ).toBe(true)
    expect(
      commandCycleStateShouldReset(withCycleState, {
        commandId,
        nowMs: 2000,
        resetMs: 1000,
        scope: 'surface',
      }),
    ).toBe(true)
  })

  it('builds scope keys and can clear runtime cycle state', () => {
    const commandId = windowManagementCommandId('scope-test')
    const layout = createClassicFirstRunWorkspaceLayout()
    const selection = selectCommandCycleStep(layout, {
      commandId,
      cycleRule: cycleRule(),
      defaultFrame: frame('left'),
      nowMs: 10,
    })
    const withCycleState = { ...layout, commandCycleState: selection.cycleState }

    expect(commandCycleScopeKey(layout, 'workspace')).toBe('workspace')
    expect(commandCycleScopeKey(layout, 'window')).toBe(layout.activeWindowId)
    expect(commandCycleScopeKey(layout, 'surface')).toBe(layout.activeSurfaceId)
    expect(layoutWithResetCommandCycleState(withCycleState).commandCycleState).toBeUndefined()
  })

  it('provides alias metadata and hotkey preset data for command discovery', () => {
    const command: WindowManagementCommand = {
      aliases: ['reasonable size', 'center window'],
      category: 'Window Management',
      enabled: true,
      icon: 'scan',
      id: windowManagementCommandId('reasonable-size'),
      kind: 'custom-window',
      targetFrame: frame('center'),
      title: 'Reasonable Size',
    }
    const aliases = commandAliasSearchMetadata(command)
    const presetTitles = defaultWindowManagementHotkeyPresets().map((preset) => preset.title)

    expect(aliases).toContain('center window')
    expect(presetTitles).toEqual(['Platform', 'VS Code', 'Hyprland / i3'])
  })
})

function cycleRule(): CommandCycleRule {
  return {
    resetMs: 1000,
    scope: 'surface',
    steps: [frame('left'), frame('right')],
  }
}

function frame(anchor: CustomWindowFrame['anchor']): CustomWindowFrame {
  return {
    anchor,
    height: 50,
    offsetX: 0,
    offsetY: 0,
    unit: 'percent',
    width: 50,
  }
}
