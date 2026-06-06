import { describe, expect, it } from 'vitest'

import { snapshotDiffDocumentId } from '@/features/git/diff-document'
import type { FileDiff } from '@/features/git/types'

import {
  CLASSIC_EDITOR_WINDOW_ID,
  createClassicFirstRunWorkspaceLayout,
  createDiffSurface,
  createFileEditorSurface,
  createSearchPreviewSurface,
  createSearchResultsSurface,
  createTerminalSurface,
  createWorkbenchWindow,
  createWindowNode,
} from './layout-builders'
import {
  CLOSE_ACTIVE_SURFACE_COMMAND_ID,
  MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID,
} from './layout-command-catalog'
import { checkWorkspaceLayoutInvariants } from './layout-invariants'
import {
  fileEditorSurfaceId,
  hotkeyPresetId,
  layoutCommandId,
  layoutNodeId,
  CLASSIC_POLICY_ID,
  placeholderSurfaceId,
  windowManagementCommandId,
  workbenchWindowId,
} from './layout-ids'
import { visibleSurfaceIdsInOrder } from './layout-normalize'
import { minimizeSurface, openSurface } from './layout-operations'
import {
  restoreWorkspaceLayout,
  serializeWorkspaceLayout,
  type SerializedWorkspaceLayout,
} from './layout-persistence'
import {
  SURFACE_SERIALIZED_VERSION,
  type CustomWindowFrame,
  type CustomWindowManagementCommand,
  type SurfaceId,
  type WorkspaceLayout,
  type WorkspaceLayoutCommand,
} from './layout-types'

const rootPath = '/repo'

describe('tiling surface layout persistence', () => {
  it('round trips a valid layout without command cycling runtime state', () => {
    const file = createFileEditorSurface({ path: '/repo/src/app.ts' })
    const search = {
      ...createSearchResultsSurface(),
      serializedState: { query: 'needle' },
    }
    const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
    const customCommand = customWindowCommand()
    const savedCommand = savedLayoutCommand('/repo/src/app.ts')
    const layout = {
      ...openSurface(
        openSurface(openSurface(createClassicFirstRunWorkspaceLayout(), file), search),
        terminal,
      ),
      activeHotkeyPresetId: hotkeyPresetId('user-preset'),
      commandCycleState: {
        commandId: MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID,
        scopeKey: CLASSIC_EDITOR_WINDOW_ID,
        stepIndex: 1,
        updatedAtMs: 123,
      },
      hotkeyPresetsById: {
        [hotkeyPresetId('user-preset')]: {
          bindings: {
            [CLOSE_ACTIVE_SURFACE_COMMAND_ID]: 'Alt+W',
            [customCommand.id]: 'Alt+1',
            [savedCommand.id]: 'Alt+2',
          },
          id: hotkeyPresetId('user-preset'),
          source: 'platform',
          title: 'User Preset',
        },
      },
      layoutCommandsById: {
        [savedCommand.id]: savedCommand,
      },
      policiesById: {
        ...createClassicFirstRunWorkspaceLayout().policiesById,
        [CLASSIC_POLICY_ID]: {
          ...createClassicFirstRunWorkspaceLayout().policiesById[CLASSIC_POLICY_ID],
          stickyPlacementsBySurfaceId: {
            [file.id]: { kind: 'window-center', windowId: CLASSIC_EDITOR_WINDOW_ID },
          },
        },
      },
      windowCommandsById: {
        [customCommand.id]: customCommand,
      },
    } satisfies WorkspaceLayout

    const serialized = serializeWorkspaceLayout(layout)
    const restored = restoreWorkspaceLayout(serialized, { rootPath })

    expect('commandCycleState' in serialized).toBe(false)
    expect(restored.status).toBe('restored')
    expect(restored.warnings).toEqual([])
    expect(restored.layout.commandCycleState).toBeUndefined()
    expect(restored.layout.surfacesById[file.id]?.serializedState).toBeUndefined()
    expect(restored.layout.surfacesById[search.id]?.serializedState).toEqual({ query: 'needle' })
    expect(restored.layout.surfacesById[terminal.id]?.lifecycle).toBe('running')
    expect(restored.layout.layoutCommandsById[savedCommand.id]).toEqual(savedCommand)
    expect(restored.layout.windowCommandsById[customCommand.id]).toEqual(customCommand)
    expect(restored.layout.hotkeyPresetsById[hotkeyPresetId('user-preset')]?.bindings).toEqual({
      [CLOSE_ACTIVE_SURFACE_COMMAND_ID]: 'Alt+W',
      [customCommand.id]: 'Alt+1',
      [savedCommand.id]: 'Alt+2',
    })
    expect(
      restored.layout.policiesById[CLASSIC_POLICY_ID].stickyPlacementsBySurfaceId[file.id],
    ).toEqual({ kind: 'window-center', windowId: CLASSIC_EDITOR_WINDOW_ID })
    expect(checkWorkspaceLayoutInvariants(restored.layout).ok).toBe(true)
  })

  it('falls back on unsupported serialized versions', () => {
    const fallbackLayout = createClassicFirstRunWorkspaceLayout()
    const serialized = {
      ...serializeWorkspaceLayout(fallbackLayout),
      version: 99,
    }
    const restored = restoreWorkspaceLayout(serialized, { fallbackLayout, rootPath })

    expect(restored.status).toBe('unsupported-version')
    expect(restored.layout.activeSurfaceId).toBe(fallbackLayout.activeSurfaceId)
    expect(restored.warnings.map((warning) => warning.code)).toEqual(['unsupported-version'])
  })

  it('recovers corrupt trees while preserving restorable surfaces', () => {
    const file = createFileEditorSurface({ path: '/repo/src/recovered.ts' })
    const layout = openSurface(createClassicFirstRunWorkspaceLayout(), file)
    const serialized = {
      ...serializeWorkspaceLayout(layout),
      nodes: [],
      rootNodeId: layoutNodeId('missing-root'),
      windows: [],
    } satisfies SerializedWorkspaceLayout
    const restored = restoreWorkspaceLayout(serialized, { rootPath })

    expect(restored.status).toBe('recovered')
    expect(restored.layout.surfacesById[file.id]).toBeDefined()
    expect(visibleSurfaceIdsInOrder(restored.layout)).toContain(file.id)
    expect(restored.warnings.map((warning) => warning.code)).toContain('layout-recovered')
    expect(checkWorkspaceLayoutInvariants(restored.layout).ok).toBe(true)
  })

  it('drops out-of-workspace file and diff resources', () => {
    const outsideFile = createFileEditorSurface({ path: '/outside/src/app.ts' })
    const outsideDiffId = snapshotDiffDocumentId(snapshotDiff('/outside/src/app.ts'))
    const outsideDiff = createDiffSurface({ diffDocumentId: outsideDiffId })
    const layout = openSurface(
      openSurface(createClassicFirstRunWorkspaceLayout(), outsideFile),
      outsideDiff,
    )
    const restored = restoreWorkspaceLayout(serializeWorkspaceLayout(layout), { rootPath })

    expect(restored.layout.surfacesById[outsideFile.id]).toBeUndefined()
    expect(restored.layout.surfacesById[outsideDiff.id]).toBeUndefined()
    expect(restored.warnings.filter((warning) => warning.code === 'surface-dropped')).toHaveLength(
      2,
    )
    expect(checkWorkspaceLayoutInvariants(restored.layout).ok).toBe(true)
  })

  it('restores running terminals by session key', () => {
    const terminal = createTerminalSurface({ sessionId: 'terminal-restore' })
    const layout = minimizeSurface(
      openSurface(createClassicFirstRunWorkspaceLayout(), terminal),
      terminal.id,
    )
    const restored = restoreWorkspaceLayout(serializeWorkspaceLayout(layout), { rootPath })

    expect(restored.layout.surfacesById[terminal.id]?.resourceKey).toBe('terminal-restore')
    expect(restored.layout.rail.runningSurfaceIds).toContain(terminal.id)
    expect(checkWorkspaceLayoutInvariants(restored.layout).ok).toBe(true)
  })

  it('drops transient previews when their owner does not restore', () => {
    const ownerId = fileEditorSurfaceId('/repo/src/missing-owner.ts')
    const preview = createSearchPreviewSurface({
      ownerContextKey: 'result:/repo/src/app.ts:1',
      ownerSurfaceId: ownerId,
      resourceKey: '/repo/src/app.ts',
    })
    const layout = addSurfaceToEditorWindow(createClassicFirstRunWorkspaceLayout(), preview)
    const serializedLayout = serializeWorkspaceLayout(layout)
    const serialized = {
      ...serializedLayout,
      surfaces: [
        ...serializedLayout.surfaces,
        {
          id: preview.id,
          surface: {
            lifecycle: 'transient',
            ownerContextKey: preview.ownerContextKey,
            ownerSurfaceId: preview.ownerSurfaceId,
            resourceKey: preview.resourceKey,
            stateKey: preview.stateKey,
            title: preview.title,
            type: 'search-preview',
            version: SURFACE_SERIALIZED_VERSION,
          },
        },
      ],
    } satisfies SerializedWorkspaceLayout
    const restored = restoreWorkspaceLayout(serialized, { rootPath })

    expect(restored.layout.surfacesById[preview.id]).toBeUndefined()
    expect(restored.warnings.map((warning) => warning.code)).toContain('surface-dropped')
    expect(checkWorkspaceLayoutInvariants(restored.layout).ok).toBe(true)
  })

  it('does not serialize transient previews by default', () => {
    const search = createSearchResultsSurface()
    const preview = createSearchPreviewSurface({
      ownerContextKey: 'result:/repo/src/app.ts:1',
      ownerSurfaceId: search.id,
      resourceKey: '/repo/src/app.ts',
    })
    const layout = openSurface(openSurface(createClassicFirstRunWorkspaceLayout(), search), preview)
    const serialized = serializeWorkspaceLayout(layout)

    expect(serialized.surfaces.map((entry) => entry.id)).not.toContain(preview.id)
    expect(serialized.windows.flatMap((window) => window.surfaceIds)).not.toContain(preview.id)
    expect(serialized.activeSurfaceId).not.toBe(preview.id)
  })

  it('matches placeholders by resource key when previous surface IDs changed', () => {
    const previousSurfaceId = 'surface:placeholder:old-loading-id' as SurfaceId
    const restoredSurfaceId = placeholderSurfaceId('/repo/src/loading.ts')
    const windowId = workbenchWindowId('pending-resource')
    const nodeId = layoutNodeId('pending-resource')
    const serialized = {
      ...serializeWorkspaceLayout(createClassicFirstRunWorkspaceLayout()),
      activeSurfaceId: previousSurfaceId,
      activeWindowId: windowId,
      mruSurfaceIds: [previousSurfaceId],
      mruWindowIds: [windowId],
      nodes: [createWindowNode({ id: nodeId, windowId })],
      rail: {
        minimizedSurfaceIds: [],
        pinnedSurfaceIds: [],
        recipeIds: [],
        runningSurfaceIds: [],
        visibleSingletonSurfaceIds: [],
      },
      rootNodeId: nodeId,
      surfaces: [
        {
          id: previousSurfaceId,
          surface: {
            lifecycle: 'placeholder',
            resourceKey: '/repo/src/loading.ts',
            title: 'Loading resource',
            type: 'placeholder',
            version: SURFACE_SERIALIZED_VERSION,
          },
        },
      ],
      windows: [
        createWorkbenchWindow({
          activeSurfaceId: previousSurfaceId,
          id: windowId,
          surfaceIds: [previousSurfaceId],
        }),
      ],
    } satisfies SerializedWorkspaceLayout
    const restored = restoreWorkspaceLayout(serialized, { rootPath })

    expect(restored.layout.surfacesById[restoredSurfaceId]?.title).toBe('Loading resource')
    expect(restored.layout.activeSurfaceId).toBe(restoredSurfaceId)
    expect(visibleSurfaceIdsInOrder(restored.layout)).toEqual([restoredSurfaceId])
    expect(checkWorkspaceLayoutInvariants(restored.layout).ok).toBe(true)
  })

  it('drops invalid command slots and hotkey bindings with recovery warnings', () => {
    const validCommand = savedLayoutCommand('/repo/src/valid.ts')
    const invalidCommand = {
      ...validCommand,
      id: layoutCommandId('invalid-layout-command'),
      slots: [
        {
          frame: frame('center'),
          id: 'invalid-slot',
          surfaceType: 'agent-run',
        },
      ],
      title: 'Invalid Layout Command',
    } as WorkspaceLayoutCommand
    const presetId = hotkeyPresetId('mixed-preset')
    const missingCommandId = windowManagementCommandId('missing-command')
    const serialized = {
      ...serializeWorkspaceLayout(createClassicFirstRunWorkspaceLayout()),
      activeHotkeyPresetId: presetId,
      hotkeyPresets: [
        {
          bindings: {
            [CLOSE_ACTIVE_SURFACE_COMMAND_ID]: 'Alt+W',
            [missingCommandId]: 'Alt+M',
          },
          id: presetId,
          source: 'platform',
          title: 'Mixed Preset',
        },
      ],
      layoutCommands: [
        {
          ...validCommand,
          slots: validCommand.slots.concat({
            frame: frame('center'),
            id: 'bad-extra-slot',
            surfaceType: 'agent-run',
          } as never),
        },
        invalidCommand,
      ],
    } satisfies SerializedWorkspaceLayout
    const restored = restoreWorkspaceLayout(serialized, { rootPath })

    expect(restored.layout.layoutCommandsById[validCommand.id].slots).toHaveLength(1)
    expect(restored.layout.layoutCommandsById[invalidCommand.id].enabled).toBe(false)
    expect(restored.layout.layoutCommandsById[invalidCommand.id].slots).toEqual([])
    expect(restored.layout.hotkeyPresetsById[presetId]?.bindings).toEqual({
      [CLOSE_ACTIVE_SURFACE_COMMAND_ID]: 'Alt+W',
    })
    expect(restored.warnings.map((warning) => warning.code)).toContain('command-recovered')
    expect(checkWorkspaceLayoutInvariants(restored.layout).ok).toBe(true)
  })
})

function addSurfaceToEditorWindow(
  layout: WorkspaceLayout,
  surface: WorkspaceLayout['surfacesById'][SurfaceId],
) {
  const window = layout.windowsById[CLASSIC_EDITOR_WINDOW_ID]

  return {
    ...layout,
    surfacesById: {
      ...layout.surfacesById,
      [surface.id]: surface,
    },
    windowsById: {
      ...layout.windowsById,
      [CLASSIC_EDITOR_WINDOW_ID]: {
        ...window,
        activeSurfaceId: surface.id,
        surfaceIds: window.surfaceIds.concat(surface.id),
      },
    },
  }
}

function savedLayoutCommand(path: string): WorkspaceLayoutCommand {
  return {
    aliases: ['saved review layout'],
    enabled: true,
    icon: 'layout',
    id: layoutCommandId(`saved:${path}`),
    slots: [
      {
        frame: frame('center'),
        id: 'file',
        resourceKey: path,
        surfaceType: 'file-editor',
      },
    ],
    title: 'Saved Review Layout',
  }
}

function customWindowCommand(): CustomWindowManagementCommand {
  return {
    aliases: ['custom center'],
    category: 'Window Management',
    enabled: true,
    icon: 'panel',
    id: windowManagementCommandId('custom-center'),
    kind: 'custom-window',
    targetFrame: frame('center'),
    title: 'Custom Center',
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

function snapshotDiff(path: string): FileDiff {
  return {
    newObjectId: 'abcdef1234567890',
    path,
    staged: false,
    worktree: 'modified',
  }
}
