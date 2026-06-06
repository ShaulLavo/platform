import type {
  CommandCycleRule,
  CommandCycleState,
  CustomWindowFrame,
  WindowId,
  WindowManagementCommandId,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

export type CommandCycleSelectionInput = {
  readonly commandId: WindowManagementCommandId
  readonly cycleRule?: CommandCycleRule
  readonly defaultFrame: CustomWindowFrame
  readonly nowMs: number
  readonly targetWindowId?: WindowId
}

export type CommandCycleSelection = {
  readonly cycleState?: CommandCycleState
  readonly frame: CustomWindowFrame
}

export function selectCommandCycleStep(
  layout: WorkspaceLayout,
  input: CommandCycleSelectionInput,
): CommandCycleSelection {
  if (!input.cycleRule || input.cycleRule.steps.length === 0) {
    return { frame: input.defaultFrame }
  }

  const targetWindowId = input.targetWindowId ?? layout.activeWindowId
  const scopeKey = commandCycleScopeKey(layout, input.cycleRule.scope, targetWindowId)
  const stepIndex = nextCommandCycleStepIndex(layout, {
    commandId: input.commandId,
    nowMs: input.nowMs,
    resetMs: input.cycleRule.resetMs,
    scopeKey,
    stepCount: input.cycleRule.steps.length,
  })

  return {
    cycleState: {
      commandId: input.commandId,
      scopeKey,
      stepIndex,
      updatedAtMs: input.nowMs,
    },
    frame: input.cycleRule.steps[stepIndex] ?? input.defaultFrame,
  }
}

export function commandCycleScopeKey(
  layout: WorkspaceLayout,
  scope: CommandCycleRule['scope'],
  targetWindowId?: WindowId,
) {
  if (scope === 'workspace') return 'workspace'

  const windowId = targetWindowId ?? layout.activeWindowId
  if (!windowId) return 'workspace'
  if (scope === 'window') return windowId

  return layout.windowsById[windowId]?.activeSurfaceId ?? windowId
}

export function commandCycleStateShouldReset(
  layout: WorkspaceLayout,
  input: {
    readonly commandId: WindowManagementCommandId
    readonly nowMs: number
    readonly resetMs: number
    readonly scope: CommandCycleRule['scope']
    readonly targetWindowId?: WindowId
  },
) {
  const state = layout.commandCycleState
  if (!state) return false
  if (state.commandId !== input.commandId) return true
  if (input.nowMs - state.updatedAtMs > input.resetMs) return true

  const scopeKey = commandCycleScopeKey(layout, input.scope, input.targetWindowId)
  return state.scopeKey !== scopeKey
}

export function layoutWithResetCommandCycleState(layout: WorkspaceLayout): WorkspaceLayout {
  if (!layout.commandCycleState) return layout

  return {
    ...layout,
    commandCycleState: undefined,
  }
}

function nextCommandCycleStepIndex(
  layout: WorkspaceLayout,
  input: {
    readonly commandId: WindowManagementCommandId
    readonly nowMs: number
    readonly resetMs: number
    readonly scopeKey: string
    readonly stepCount: number
  },
) {
  const state = layout.commandCycleState
  if (!state) return 0
  if (state.commandId !== input.commandId) return 0
  if (state.scopeKey !== input.scopeKey) return 0
  if (input.nowMs - state.updatedAtMs > input.resetMs) return 0

  return (state.stepIndex + 1) % input.stepCount
}
