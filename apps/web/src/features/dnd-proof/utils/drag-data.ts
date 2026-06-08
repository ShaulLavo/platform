import type {
  SnapDestination,
  SurfaceId,
  WindowId,
} from '@/features/tiling-surface-manager/engine/layout-types'

export const DND_PROOF_TAB_TYPE = 'dnd-proof-tab'
export const DND_PROOF_WINDOW_TYPE = 'dnd-proof-window'

export type DndProofDragData =
  | {
      readonly kind: 'tab'
      readonly surfaceId: SurfaceId
    }
  | {
      readonly kind: 'window'
      readonly windowId: WindowId
    }

export type DndProofDropData =
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
  return `proof-tab:${surfaceId}`
}

export function windowDragId(windowId: WindowId) {
  return `proof-window:${windowId}`
}

export function tabStripDropId(windowId: WindowId) {
  return `proof-tab-strip:${windowId}`
}

export function snapDestinationDropId(id: string) {
  return `proof-snap:${id}`
}

export function proofDragData(value: unknown): DndProofDragData | null {
  if (!value || typeof value !== 'object') return null
  if (!('kind' in value)) return null

  const data = value as DndProofDragData
  if (data.kind === 'tab') return data
  if (data.kind === 'window') return data

  return null
}

export function proofDropData(value: unknown): DndProofDropData | null {
  if (!value || typeof value !== 'object') return null
  if (!('kind' in value)) return null

  const data = value as DndProofDropData
  if (data.kind === 'tab') return data
  if (data.kind === 'tab-strip') return data
  if (data.kind === 'window') return data
  if (data.kind === 'snap-destination') return data

  return null
}
