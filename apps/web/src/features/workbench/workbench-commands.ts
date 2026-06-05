import {
  createDiffWorkbenchPanel,
  createFileWorkbenchPanel,
  createSearchWorkbenchPanel,
  createTerminalWorkbenchPanel,
} from '@/features/workbench/workbench-panel-ids'

import type {
  WorkbenchDiffEditorPanel,
  WorkbenchFileEditorPanel,
  WorkbenchPanel,
  WorkbenchState,
  WorkbenchTerminalPanel,
} from './workbench-panel-types'

export type WorkbenchOpenPlacement = 'active-group' | 'beside-active-panel' | 'below-active-panel'

export type WorkbenchResolvedPlacement =
  | { readonly type: 'active-group' }
  | {
      readonly direction: 'below' | 'right'
      readonly referencePanelId: string | null
      readonly type: 'split'
    }

export type WorkbenchOpenFilePanelInput = {
  readonly path: string
  readonly placement?: WorkbenchOpenPlacement
  readonly type: 'file'
}

export type WorkbenchOpenDiffPanelInput = {
  readonly diffDocumentId: string
  readonly placement?: WorkbenchOpenPlacement
  readonly type: 'diff'
}

export type WorkbenchOpenTerminalPanelInput = {
  readonly placement?: WorkbenchOpenPlacement
  readonly sessionId: string
  readonly title?: string | null
  readonly type: 'terminal'
}

export type WorkbenchOpenSearchPanelInput = {
  readonly placement?: WorkbenchOpenPlacement
  readonly type: 'search'
}

export type WorkbenchOpenPanelInput =
  | WorkbenchOpenFilePanelInput
  | WorkbenchOpenDiffPanelInput
  | WorkbenchOpenTerminalPanelInput
  | WorkbenchOpenSearchPanelInput

export type WorkbenchCommandEffect =
  | {
      readonly panelId: string
      readonly type: 'focus-panel'
    }
  | {
      readonly panel: WorkbenchPanel
      readonly placement: WorkbenchResolvedPlacement
      readonly type: 'add-panel'
    }

export type WorkbenchCommandResult = {
  readonly effect: WorkbenchCommandEffect | null
  readonly state: WorkbenchState
}

export function openWorkbenchPanel(
  state: WorkbenchState,
  input: WorkbenchOpenPanelInput,
): WorkbenchCommandResult {
  if (input.type === 'file') return openFileWorkbenchPanel(state, input)
  if (input.type === 'diff') return openDiffWorkbenchPanel(state, input)
  if (input.type === 'terminal') return openTerminalWorkbenchPanel(state, input)

  return openSearchWorkbenchPanel(state, input)
}

export function focusWorkbenchPanel(
  state: WorkbenchState,
  panelId: string,
): WorkbenchCommandResult {
  if (!state.panels.some((panel) => panel.id === panelId)) {
    return { effect: null, state }
  }

  return {
    effect: { panelId, type: 'focus-panel' },
    state: { ...state, activePanelId: panelId },
  }
}

function openFileWorkbenchPanel(
  state: WorkbenchState,
  input: WorkbenchOpenFilePanelInput,
): WorkbenchCommandResult {
  const existing = state.panels.find(
    (panel): panel is WorkbenchFileEditorPanel =>
      panel.type === 'file' && panel.path === input.path,
  )
  if (existing) return focusWorkbenchPanel(state, existing.id)

  return addWorkbenchPanel(state, createFileWorkbenchPanel(input.path), input.placement)
}

function openDiffWorkbenchPanel(
  state: WorkbenchState,
  input: WorkbenchOpenDiffPanelInput,
): WorkbenchCommandResult {
  const existing = state.panels.find(
    (panel): panel is WorkbenchDiffEditorPanel =>
      panel.type === 'diff' && panel.diffDocumentId === input.diffDocumentId,
  )
  if (existing) return focusWorkbenchPanel(state, existing.id)

  return addWorkbenchPanel(state, createDiffWorkbenchPanel(input.diffDocumentId), input.placement)
}

function openTerminalWorkbenchPanel(
  state: WorkbenchState,
  input: WorkbenchOpenTerminalPanelInput,
): WorkbenchCommandResult {
  const existing = state.panels.find(
    (panel): panel is WorkbenchTerminalPanel =>
      panel.type === 'terminal' && panel.sessionId === input.sessionId,
  )
  if (existing) return focusWorkbenchPanel(state, existing.id)

  const panel = createTerminalWorkbenchPanel({
    sessionId: input.sessionId,
    title: input.title ?? null,
  })
  return addWorkbenchPanel(state, panel, input.placement ?? 'below-active-panel')
}

function openSearchWorkbenchPanel(
  state: WorkbenchState,
  input: WorkbenchOpenSearchPanelInput,
): WorkbenchCommandResult {
  const existing = state.panels.find((panel) => panel.type === 'search')
  if (existing) return focusWorkbenchPanel(state, existing.id)

  return addWorkbenchPanel(state, createSearchWorkbenchPanel(), input.placement)
}

function addWorkbenchPanel(
  state: WorkbenchState,
  panel: WorkbenchPanel,
  placement: WorkbenchOpenPlacement = 'active-group',
): WorkbenchCommandResult {
  return {
    effect: {
      panel,
      placement: resolvePlacement(state, placement),
      type: 'add-panel',
    },
    state: {
      ...state,
      activePanelId: panel.id,
      panels: state.panels.concat(panel),
    },
  }
}

function resolvePlacement(
  state: WorkbenchState,
  placement: WorkbenchOpenPlacement,
): WorkbenchResolvedPlacement {
  if (placement === 'active-group') return { type: 'active-group' }
  if (placement === 'below-active-panel') {
    return {
      direction: 'below',
      referencePanelId: state.activePanelId,
      type: 'split',
    }
  }

  return {
    direction: 'right',
    referencePanelId: state.activePanelId,
    type: 'split',
  }
}
