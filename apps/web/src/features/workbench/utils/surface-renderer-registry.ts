import { createClientInvariantError } from '@/lib/structured-errors'

import type { ComponentType } from 'react'

import { FixtureSurface } from '@/features/workbench/components/fixture-surface'
import type {
  Surface,
  SurfaceType,
  WindowId,
} from '@/features/tiling-surface-manager/engine/layout-types'

export type SurfaceRendererProps = {
  readonly active: boolean
  readonly surface: Surface
  readonly visible: boolean
  readonly windowId?: WindowId
}

export type SurfaceRenderer = ComponentType<SurfaceRendererProps>

export type SurfaceRendererDescriptor = {
  readonly renderer: SurfaceRenderer
  readonly type: SurfaceType
}

export type SurfaceRendererRegistry = ReadonlyMap<SurfaceType, SurfaceRenderer>

const DEFAULT_RENDERED_SURFACE_TYPES = [
  'chat',
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

export const defaultSurfaceRendererRegistry = createSurfaceRendererRegistry(
  DEFAULT_RENDERED_SURFACE_TYPES.map((type) => ({
    renderer: FixtureSurface,
    type,
  })),
)

export function createSurfaceRendererRegistry(
  descriptors: readonly SurfaceRendererDescriptor[],
): SurfaceRendererRegistry {
  const registry = new Map<SurfaceType, SurfaceRenderer>()

  for (const descriptor of descriptors) {
    if (registry.has(descriptor.type)) {
      throw createClientInvariantError(`Duplicate surface renderer: ${descriptor.type}`)
    }

    registry.set(descriptor.type, descriptor.renderer)
  }

  return registry
}

export function surfaceRendererFor(registry: SurfaceRendererRegistry, type: SurfaceType) {
  return registry.get(type) ?? FixtureSurface
}
