import type { SnapDestination, SurfaceId, WindowId } from '@workspace/tiling/utils/layout-types'

export const TILING_TAB_TYPE = 'tiling-tab'
export const TILING_WINDOW_TYPE = 'tiling-window'

export type TilingDragData =
  | {
      readonly kind: 'tab'
      readonly surfaceId: SurfaceId
    }
  | {
      readonly kind: 'window'
      readonly windowId: WindowId
    }

export type TilingDropData =
  | {
      readonly index: number
      readonly kind: 'tab'
      readonly surfaceId: SurfaceId
      readonly windowId: WindowId
    }
  | {
      readonly index: number
      readonly kind: 'tab-strip'
      readonly windowId: WindowId
    }
  | {
      readonly kind: 'window'
      readonly windowId: WindowId
    }
  | {
      readonly destination: SnapDestination
      readonly kind: 'snap-destination'
    }

export function tabDragId(surfaceId: SurfaceId) {
  return `tiling-tab:${surfaceId}`
}

export function windowDragId(windowId: WindowId) {
  return `tiling-window:${windowId}`
}

export function tabStripDropId(windowId: WindowId) {
  return `tiling-tab-strip:${windowId}`
}

export function snapDestinationDropId(id: string) {
  return `tiling-snap:${id}`
}

export function tilingDragData(value: unknown): TilingDragData | null {
  if (!value || typeof value !== 'object') return null
  if (!('kind' in value)) return null

  const data = value as TilingDragData
  if (data.kind === 'tab') return data
  if (data.kind === 'window') return data

  return null
}

export function tilingDropData(value: unknown): TilingDropData | null {
  if (!value || typeof value !== 'object') return null
  if (!('kind' in value)) return null

  const data = value as TilingDropData
  if (data.kind === 'tab') return data
  if (data.kind === 'tab-strip') return data
  if (data.kind === 'window') return data
  if (data.kind === 'snap-destination') return data

  return null
}

export function targetBelongsToTabStrip(
  target: TilingDropData,
): target is Extract<TilingDropData, { readonly kind: 'tab' | 'tab-strip' }> {
  return target.kind === 'tab' || target.kind === 'tab-strip'
}
