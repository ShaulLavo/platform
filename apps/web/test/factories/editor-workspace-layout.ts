import { parseDiffDocumentId } from '@/features/git/diff-document'
import {
  createDiffSurface,
  createEmptyWorkspaceLayout,
  createFileEditorSurface,
  createSplitNode,
  createWindowNode,
  createWorkbenchWindow,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import {
  layoutNodeId,
  workbenchWindowId,
} from '@/features/tiling-surface-manager/engine/layout-ids'
import { normalizeWorkspaceLayout } from '@/features/tiling-surface-manager/engine/layout-normalize'
import type {
  LayoutNode,
  Surface,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

export function editorWorkspaceLayoutForPaths(
  paths: readonly string[],
  activePath: string | null,
): WorkspaceLayout {
  if (paths.length === 0) return createEmptyWorkspaceLayout()

  const group = editorWindowGroup('main', paths, activePath)
  const baseLayout = createEmptyWorkspaceLayout()

  return normalizeWorkspaceLayout({
    ...baseLayout,
    activeSurfaceId: group.window.activeSurfaceId,
    activeWindowId: group.window.id,
    mruSurfaceIds: group.window.surfaceIds,
    mruWindowIds: [group.window.id],
    nodesById: {
      [group.node.id]: group.node,
    },
    rootNodeId: group.node.id,
    surfacesById: surfacesById(group.surfaces),
    windowsById: {
      [group.window.id]: group.window,
    },
  })
}

export function splitEditorWorkspaceLayoutForPaths({
  activePath,
  leftPaths,
  rightPaths,
  sizes = [0.5, 0.5],
}: {
  readonly activePath: string | null
  readonly leftPaths: readonly string[]
  readonly rightPaths: readonly string[]
  readonly sizes?: readonly [number, number]
}): WorkspaceLayout {
  const left = editorWindowGroup('left', leftPaths, activePath)
  const right = editorWindowGroup('right', rightPaths, activePath)
  const rootNodeId = layoutNodeId('test:editor-split:root')
  const rootNode = createSplitNode({
    axis: 'horizontal',
    childIds: [left.node.id, right.node.id],
    id: rootNodeId,
    sizes,
  })
  const activeGroup = groupContainingPath([left, right], activePath) ?? left
  const baseLayout = createEmptyWorkspaceLayout()

  return normalizeWorkspaceLayout({
    ...baseLayout,
    activeSurfaceId: activeGroup.window.activeSurfaceId,
    activeWindowId: activeGroup.window.id,
    mruSurfaceIds: [...left.window.surfaceIds, ...right.window.surfaceIds],
    mruWindowIds: [activeGroup.window.id, left.window.id, right.window.id],
    nodesById: {
      [left.node.id]: left.node,
      [right.node.id]: right.node,
      [rootNode.id]: rootNode,
    },
    rootNodeId,
    surfacesById: surfacesById([...left.surfaces, ...right.surfaces]),
    windowsById: {
      [left.window.id]: left.window,
      [right.window.id]: right.window,
    },
  })
}

type EditorWindowGroup = {
  readonly node: LayoutNode
  readonly paths: readonly string[]
  readonly surfaces: readonly Surface[]
  readonly window: WorkbenchWindow
}

function editorWindowGroup(
  key: string,
  paths: readonly string[],
  activePath: string | null,
): EditorWindowGroup {
  const windowId = workbenchWindowId(`editor-group:${key}`)
  const surfaces = paths.map((path, index) => editorSurfaceForPath(path, key, index))
  const activeSurface = surfaces.find((surface) => surface.resourceKey === activePath)
  const window = createWorkbenchWindow({
    activeSurfaceId: activeSurface?.id ?? surfaces[0]?.id,
    id: windowId,
    surfaceIds: surfaces.map((surface) => surface.id),
  })

  return {
    node: createWindowNode({
      id: layoutNodeId(`test:editor:${key}`),
      windowId,
    }),
    paths,
    surfaces,
    window,
  }
}

function editorSurfaceForPath(path: string, groupKey: string, index: number): Surface {
  const serializedState = {
    editorGroupId: groupKey,
    editorTabId: `test-tab:${groupKey}:${index}`,
  }
  const surface = parseDiffDocumentId(path)
    ? createDiffSurface({ diffDocumentId: path })
    : createFileEditorSurface({ path })

  return { ...surface, serializedState }
}

function surfacesById(surfaces: readonly Surface[]) {
  return Object.fromEntries(surfaces.map((surface) => [surface.id, surface]))
}

function groupContainingPath(
  groups: readonly EditorWindowGroup[],
  activePath: string | null,
): EditorWindowGroup | null {
  if (!activePath) return null

  return groups.find((group) => group.paths.includes(activePath)) ?? null
}
