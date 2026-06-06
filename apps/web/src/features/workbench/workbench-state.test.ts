import { describe, expect, it } from 'vitest'

import { snapshotDiffDocumentId } from '@/features/git/diff-document'
import type { FileDiff } from '@/features/git/types'

import {
  createDefaultWorkbenchState,
  createFileWorkbenchPanel,
  createSerializedWorkbenchState,
  createTerminalWorkbenchPanel,
  defaultWorkbenchPanelRegistry,
  diffWorkbenchPanelId,
  fileWorkbenchPanelId,
  focusWorkbenchPanel,
  openWorkbenchPanel,
  restoreSerializedWorkbenchState,
  terminalWorkbenchPanelId,
  WORKBENCH_SEARCH_PANEL_ID,
  workbenchPanelDescriptor,
  workbenchPanelTooltip,
  type SerializedWorkbenchState,
  type WorkbenchState,
} from './index'

const rootPath = '/repo'

describe('workbench state and registry', () => {
  it('opens and focuses singleton file, diff, and search panels', () => {
    const fileResult = openWorkbenchPanel(createDefaultWorkbenchState(), {
      path: '/repo/src/app.ts',
      type: 'file',
    })
    const diffDocumentId = snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts'))
    const diffResult = openWorkbenchPanel(fileResult.state, {
      diffDocumentId,
      placement: 'beside-active-panel',
      type: 'diff',
    })
    const searchResult = openWorkbenchPanel(diffResult.state, {
      placement: 'below-active-panel',
      type: 'search',
    })
    const focusedFile = openWorkbenchPanel(searchResult.state, {
      path: '/repo/src/app.ts',
      type: 'file',
    })

    expect(searchResult.state.panels.map((panel) => panel.id)).toEqual([
      fileWorkbenchPanelId('/repo/src/app.ts'),
      diffWorkbenchPanelId(diffDocumentId),
      WORKBENCH_SEARCH_PANEL_ID,
    ])
    expect(diffResult.effect).toMatchObject({
      placement: {
        direction: 'right',
        referencePanelId: fileWorkbenchPanelId('/repo/src/app.ts'),
        type: 'split',
      },
      type: 'add-panel',
    })
    expect(searchResult.effect).toMatchObject({
      placement: {
        direction: 'below',
        referencePanelId: diffWorkbenchPanelId(diffDocumentId),
        type: 'split',
      },
      type: 'add-panel',
    })
    expect(focusedFile.effect).toEqual({
      panelId: fileWorkbenchPanelId('/repo/src/app.ts'),
      type: 'focus-panel',
    })
    expect(focusedFile.state.panels).toHaveLength(3)
  })

  it('creates terminal panels by session and defaults them below the active panel', () => {
    const initial = openWorkbenchPanel(createDefaultWorkbenchState(), {
      path: '/repo/src/app.ts',
      type: 'file',
    }).state
    const firstTerminal = openWorkbenchPanel(initial, {
      sessionId: 'session-1',
      title: 'zsh',
      type: 'terminal',
    })
    const secondTerminal = openWorkbenchPanel(firstTerminal.state, {
      sessionId: 'session-2',
      type: 'terminal',
    })
    const focusedTerminal = openWorkbenchPanel(secondTerminal.state, {
      sessionId: 'session-1',
      type: 'terminal',
    })

    expect(firstTerminal.effect).toMatchObject({
      placement: {
        direction: 'below',
        referencePanelId: fileWorkbenchPanelId('/repo/src/app.ts'),
        type: 'split',
      },
      type: 'add-panel',
    })
    expect(secondTerminal.state.panels.map((panel) => panel.id)).toEqual([
      fileWorkbenchPanelId('/repo/src/app.ts'),
      terminalWorkbenchPanelId('session-1'),
      terminalWorkbenchPanelId('session-2'),
    ])
    expect(focusedTerminal.effect).toEqual({
      panelId: terminalWorkbenchPanelId('session-1'),
      type: 'focus-panel',
    })
    expect(focusedTerminal.state.panels).toHaveLength(3)
  })

  it('restores valid metadata, drops stale panels, and falls back on invalid layout only', () => {
    const diffDocumentId = snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts'))
    const payload = serializedState({
      activePanelId: 'missing-panel',
      layout: { grid: {}, panels: {} },
      panels: [
        { id: 'ignored-file-id', path: '/repo/src/app.ts', type: 'file' },
        { diffDocumentId, id: 'ignored-diff-id', type: 'diff' },
        { id: 'outside', path: '/other/src/app.ts', type: 'file' },
        {
          id: terminalWorkbenchPanelId('term-1'),
          sessionId: 'term-1',
          title: null,
          type: 'terminal',
        },
        { id: WORKBENCH_SEARCH_PANEL_ID, type: 'search' },
      ],
    })

    const result = restoreSerializedWorkbenchState(payload, defaultWorkbenchPanelRegistry, {
      rootPath,
    })

    expect(result.status).toBe('restored')
    expect(result.state.layout).toEqual({ grid: {}, panels: {} })
    expect(result.state.activePanelId).toBe(fileWorkbenchPanelId('/repo/src/app.ts'))
    expect(result.state.panels.map((panel) => panel.id)).toEqual([
      fileWorkbenchPanelId('/repo/src/app.ts'),
      diffWorkbenchPanelId(diffDocumentId),
      terminalWorkbenchPanelId('term-1'),
      WORKBENCH_SEARCH_PANEL_ID,
    ])
  })

  it('preserves restorable panels when Dockview layout payload is invalid', () => {
    const payload = serializedState({
      activePanelId: fileWorkbenchPanelId('/repo/src/app.ts'),
      layout: { grid: null, panels: {} },
      panels: [
        { id: fileWorkbenchPanelId('/repo/src/app.ts'), path: '/repo/src/app.ts', type: 'file' },
      ],
    })

    const result = restoreSerializedWorkbenchState(payload, defaultWorkbenchPanelRegistry, {
      rootPath,
    })

    expect(result).toMatchObject({
      reason: 'invalid-layout',
      status: 'fallback',
      state: {
        activePanelId: fileWorkbenchPanelId('/repo/src/app.ts'),
        layout: null,
      },
    })
    expect(result.state.panels).toEqual([createFileWorkbenchPanel('/repo/src/app.ts')])
  })

  it('serializes through the registry and clamps active panel to live metadata', () => {
    const state: WorkbenchState = {
      ...createDefaultWorkbenchState(),
      activePanelId: 'stale',
      panels: [
        createFileWorkbenchPanel('/repo/src/app.ts'),
        createTerminalWorkbenchPanel({ sessionId: 'term-1', title: 'zsh' }),
      ],
    }

    const serialized = createSerializedWorkbenchState({
      activePanelId: state.activePanelId,
      layout: state.layout,
      panels: state.panels,
      registry: defaultWorkbenchPanelRegistry,
    })

    expect(serialized.activePanelId).toBe(fileWorkbenchPanelId('/repo/src/app.ts'))
    expect(serialized.panels).toEqual(state.panels)
  })

  it('keeps close policies and titles in the panel registry', () => {
    const fileDescriptor = workbenchPanelDescriptor(defaultWorkbenchPanelRegistry, 'file')
    const terminalDescriptor = workbenchPanelDescriptor(defaultWorkbenchPanelRegistry, 'terminal')
    const filePanel = createFileWorkbenchPanel('/repo/src/app.ts')
    const terminalPanel = createTerminalWorkbenchPanel({ sessionId: 'term-1', title: null })

    expect(fileDescriptor?.title(filePanel)).toBe('app.ts')
    expect(fileDescriptor?.closePolicy(filePanel, { isDirtyFile: () => true })).toEqual({
      path: '/repo/src/app.ts',
      type: 'confirm-dirty-file',
    })
    expect(terminalDescriptor?.title(terminalPanel)).toBe('Terminal')
    expect(terminalDescriptor?.closePolicy(terminalPanel, {})).toEqual({
      sessionId: 'term-1',
      type: 'dispose-terminal-session',
    })
    expect(workbenchPanelTooltip(filePanel, rootPath)).toBe('/repo/src/app.ts')
  })

  it('ignores focus requests for missing panels', () => {
    const state = createDefaultWorkbenchState()

    expect(focusWorkbenchPanel(state, 'missing')).toEqual({
      effect: null,
      state,
    })
  })
})

function serializedState(
  overrides: Omit<SerializedWorkbenchState, 'version'>,
): SerializedWorkbenchState {
  return {
    ...overrides,
    version: 1,
  }
}

function snapshotDiff(path: string): FileDiff {
  return {
    newObjectId: 'abcdef1234567890',
    path,
    staged: false,
    worktree: 'modified',
  }
}
