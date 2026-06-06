import type { ComponentType } from 'react'

import { WorkbenchFixtureSurface } from './workbench-fixture-surface'
import type { Surface, SurfaceType, WindowId } from './layout-types'

export type WorkbenchSurfaceRendererProps = {
  readonly active: boolean
  readonly surface: Surface
  readonly visible: boolean
  readonly windowId?: WindowId
}

export type WorkbenchSurfaceRenderer = ComponentType<WorkbenchSurfaceRendererProps>

export type WorkbenchSurfaceRendererDescriptor = {
  readonly renderer: WorkbenchSurfaceRenderer
  readonly type: SurfaceType
}

export type WorkbenchSurfaceRendererRegistry = ReadonlyMap<SurfaceType, WorkbenchSurfaceRenderer>

const DEFAULT_RENDERED_SURFACE_TYPES = [
  'diagnostics',
  'diff',
  'file-editor',
  'file-navigator',
  'git-changes',
  'logs',
  'placeholder',
  'search-preview',
  'search-results',
  'terminal',
] as const satisfies readonly SurfaceType[]

export const defaultWorkbenchSurfaceRendererRegistry = createWorkbenchSurfaceRendererRegistry(
  DEFAULT_RENDERED_SURFACE_TYPES.map((type) => ({
    renderer: WorkbenchFixtureSurface,
    type,
  })),
)

export function createWorkbenchSurfaceRendererRegistry(
  descriptors: readonly WorkbenchSurfaceRendererDescriptor[],
): WorkbenchSurfaceRendererRegistry {
  const registry = new Map<SurfaceType, WorkbenchSurfaceRenderer>()

  for (const descriptor of descriptors) {
    if (registry.has(descriptor.type)) {
      throw new Error(`Duplicate surface renderer: ${descriptor.type}`)
    }

    registry.set(descriptor.type, descriptor.renderer)
  }

  return registry
}

export function workbenchSurfaceRendererFor(
  registry: WorkbenchSurfaceRendererRegistry,
  type: SurfaceType,
) {
  return registry.get(type) ?? WorkbenchFixtureSurface
}
