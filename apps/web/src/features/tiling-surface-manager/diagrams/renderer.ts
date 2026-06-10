import { decodeIdKey } from '@workspace/tiling/utils/layout-ids'
import type {
  SurfaceId,
  SurfaceType,
  WorkspaceLayout,
  WorkspaceRecipeSlot,
} from '@workspace/tiling/utils/layout-types'

// The generator script SSR-loads these engine modules through Vite and passes
// the namespaces in as `engine`. Renderers only need their types, never their
// runtime, so `typeof import(...)` keeps this file out of the browser bundle.
export type Engine = {
  readonly builders: typeof import('@workspace/tiling/utils/layout-builders')
  readonly geometry: typeof import('@workspace/tiling/utils/layout-geometry')
  readonly normalize: typeof import('@workspace/tiling/utils/layout-normalize')
  readonly operations: typeof import('@workspace/tiling')
  readonly rail: typeof import('@workspace/tiling/utils/rail-model')
  readonly selectors: typeof import('@workspace/tiling/utils/layout-selectors')
}

export type DiagramState = {
  readonly layout: WorkspaceLayout
  readonly title: string
  readonly transition?: string
}

export type DiagramGroup = {
  readonly description?: string
  readonly states: readonly DiagramState[]
  readonly title: string
}

export type RenderInput = {
  readonly engine: Engine
  readonly groups: readonly DiagramGroup[]
}

export type LayoutDiagramRenderer = {
  readonly name: string
  render(input: RenderInput): string
}

export type SlotStyle = {
  readonly backgroundColor: string
  readonly label: string
  readonly strokeColor: string
}

export const SLOT_STYLES = {
  bottom: {
    backgroundColor: '#c5f6fa',
    label: 'bottom: Terminal / Problems',
    strokeColor: '#0c8599',
  },
  'editor-center': {
    backgroundColor: '#ffec99',
    label: 'editor-center: file-editor / diff',
    strokeColor: '#f08c00',
  },
  'left-tool-pane': {
    backgroundColor: '#a5d8ff',
    label: 'left-tool-pane: Files / Search / Git / Chat / Logs',
    strokeColor: '#1971c2',
  },
  rail: {
    backgroundColor: '#f1f3f5',
    label: 'rail',
    strokeColor: '#495057',
  },
  'transient-preview': {
    backgroundColor: '#e5dbff',
    label: 'transient-preview',
    strokeColor: '#7048e8',
  },
} satisfies Record<WorkspaceRecipeSlot, SlotStyle>

export function slotForSurface(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceRecipeSlot {
  const surface = layout.surfacesById[surfaceId]
  if (!surface) return 'editor-center'

  return (
    layout.recipesById[layout.activeRecipeId]?.surfaceSlots[surface.type] ??
    surface.capabilities.defaultRecipeSlot
  )
}

export function surfaceIdLabel(surfaceId: SurfaceId): string {
  const rawId = String(surfaceId)
  const match = /^surface:([^:]+):(.*)$/.exec(rawId)
  if (!match) return rawId

  return compactSurfaceLabel(match[1] ?? '', decodeIdKey(match[2] ?? ''))
}

export function hasVisibleSurfaceType(
  engine: Engine,
  layout: WorkspaceLayout,
  type: SurfaceType,
): boolean {
  for (const windowId of engine.normalize.visibleWindowIdsInOrder(layout)) {
    const window = layout.windowsById[windowId]
    if (!windowContainsType(layout, window?.surfaceIds ?? [], type)) continue

    return true
  }

  return false
}

export function hasRailSurfaceType(
  _engine: Engine,
  layout: WorkspaceLayout,
  type: SurfaceType,
): boolean {
  const railSurfaceIds = [
    ...layout.rail.backgroundSurfaceIds,
    ...layout.rail.pinnedSurfaceIds,
    ...layout.rail.runningSurfaceIds,
    ...layout.rail.visibleSingletonSurfaceIds,
  ]

  return windowContainsType(layout, railSurfaceIds, type)
}

function windowContainsType(
  layout: WorkspaceLayout,
  surfaceIds: readonly SurfaceId[],
  type: SurfaceType,
): boolean {
  for (const surfaceId of surfaceIds) {
    const surface = layout.surfacesById[surfaceId]
    if (surface?.type !== type) continue

    return true
  }

  return false
}

function compactSurfaceLabel(type: string, key: string): string {
  if (type === 'file-editor') return `file:${basename(key)}`
  if (type === 'file-navigator') return 'files'
  if (type === 'git-changes') return 'git'
  if (type === 'search-results') return 'search'
  if (type === 'diagnostics') return 'problems'
  if (type === 'terminal') return `term:${key.replace(/^terminal-/, '')}`

  return type
}

function basename(key: string): string {
  return key.split('/').pop() || key
}
