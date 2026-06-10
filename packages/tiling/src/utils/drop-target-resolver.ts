import {
  targetBelongsToTabStrip,
  type TilingDragData,
  type TilingDropData,
} from '@workspace/tiling/utils/drag-data'
import {
  clampPointToRect,
  inflateRect,
  pointInRect,
  rectArea,
  rectCenterDistance,
  type PointerCoordinates,
} from '@workspace/tiling/utils/geometry-primitives'
import type { LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import type { TilingDropCandidate } from '@workspace/tiling/utils/snap-destinations'
import type { WindowId } from '@workspace/tiling/utils/layout-types'

export type TilingIntentMode = 'idle' | 'tab-detached' | 'tab-reorder' | 'window'

export type ResolvedTilingTarget = {
  readonly candidateId?: string
  readonly mode: TilingIntentMode
  readonly previewKind?: 'app' | 'dnd-kit'
  readonly target: TilingDropData
}

export type TilingTabTarget = {
  readonly previewKind?: 'app' | 'dnd-kit'
  readonly priority: number
  readonly target: Extract<TilingDropData, { readonly kind: 'tab' | 'tab-strip' }>
}

export type ResolveTilingTargetInput = {
  readonly candidates: readonly TilingDropCandidate[]
  readonly mode: TilingIntentMode
  readonly point: PointerCoordinates
  readonly previousTarget: ResolvedTilingTarget | null
  readonly rootRect?: LayoutRect | null
  readonly source: TilingDragData
  readonly sourceWindowId?: WindowId | null
  readonly tabTarget: TilingTabTarget | null
}

const STICKY_TARGET_INFLATE_PX = 18

export function resolveTilingTarget(
  rawInput: ResolveTilingTargetInput,
): ResolvedTilingTarget | null {
  const input = offRootResolutionInput(rawInput)
  const tabTarget = resolvedTabTarget(input)
  if (input.mode === 'tab-reorder') return tabTarget

  const stickyCandidate = previousStickyCandidate(input)
  const candidate = resolvedSnapCandidate(input, stickyCandidate)
  const tabPriority = input.tabTarget?.priority ?? 0
  if (stickyCandidateBeatsTabTarget(input, stickyCandidate, candidate)) {
    return resolvedCandidateTarget(input, stickyCandidate)
  }
  if (!tabTarget) return resolvedCandidateTarget(input, candidate)
  if (!candidate) return tabTarget
  if (candidate.priority > tabPriority) return resolvedCandidateTarget(input, candidate)

  return tabTarget
}

function offRootResolutionInput(input: ResolveTilingTargetInput): ResolveTilingTargetInput {
  const rootRect = input.rootRect
  if (!rootRect) return input
  if (pointInRect(rootRect, input.point)) return input

  // Off-root pointers resolve against the nearest root edge: clamping keeps the
  // thin root-edge hit bands reachable past the viewport, and window drags must
  // not be shadowed by a top strip's docking halo that extends above the root.
  return {
    ...input,
    point: clampPointToRect(rootRect, input.point),
    tabTarget: input.mode === 'window' ? null : input.tabTarget,
  }
}

function stickyCandidateBeatsTabTarget(
  input: ResolveTilingTargetInput,
  stickyCandidate: TilingDropCandidate | null,
  candidate: TilingDropCandidate | null,
) {
  if (!stickyCandidate) return false
  if (candidate?.id !== stickyCandidate.id) return false
  if (stickyCandidate.target.kind !== 'snap-destination') return false

  const destination = stickyCandidate.target.destination
  if (destination.kind !== 'window-edge') return false
  if (destination.edge !== 'top') return false
  if (!input.tabTarget) return true
  if (!input.sourceWindowId) return true

  return input.tabTarget.target.windowId === input.sourceWindowId
}

function resolvedTabTarget({
  mode,
  source,
  tabTarget,
}: ResolveTilingTargetInput): ResolvedTilingTarget | null {
  if (!tabTarget) return null
  if (!targetBelongsToTabStrip(tabTarget.target)) return null
  if (mode === 'tab-reorder') return resolvedTabTargetFromInput(mode, tabTarget)
  if (mode === 'tab-detached') return resolvedTabTargetFromInput(mode, tabTarget)
  if (mode !== 'window') return null
  if (source.kind !== 'window') return null
  if (tabTarget.target.windowId === source.windowId) return null

  return resolvedTabTargetFromInput(mode, tabTarget)
}

function resolvedTabTargetFromInput(mode: TilingIntentMode, tabTarget: TilingTabTarget) {
  return {
    mode,
    previewKind: tabTarget.previewKind,
    target: tabTarget.target,
  }
}

function resolvedCandidateTarget(
  input: ResolveTilingTargetInput,
  candidate: TilingDropCandidate | null,
): ResolvedTilingTarget | null {
  if (!candidate) return null

  return {
    candidateId: candidate.id,
    mode: input.mode,
    target: candidate.target,
  }
}

function resolvedSnapCandidate(
  input: ResolveTilingTargetInput,
  stickyCandidate: TilingDropCandidate | null,
) {
  const candidatesAtPoint = input.candidates.filter((candidate) =>
    pointInRect(candidate.hitRect, input.point),
  )
  const topCandidate = bestCandidate(candidatesAtPoint, input.point)
  if (!stickyCandidate) return topCandidate
  if (!topCandidate) return stickyCandidate
  if (topCandidate.id === stickyCandidate.id) return stickyCandidate

  return topCandidate
}

function previousStickyCandidate({ candidates, point, previousTarget }: ResolveTilingTargetInput) {
  if (!previousTarget?.candidateId) return null

  const candidate = candidates.find((value) => value.id === previousTarget.candidateId)
  if (!candidate) return null
  if (!pointInRect(inflateRect(candidate.hitRect, STICKY_TARGET_INFLATE_PX), point)) return null

  return candidate
}

function bestCandidate(candidates: readonly TilingDropCandidate[], point: PointerCoordinates) {
  return candidates.toSorted((left, right) => compareCandidates(left, right, point))[0] ?? null
}

function compareCandidates(
  left: TilingDropCandidate,
  right: TilingDropCandidate,
  point: PointerCoordinates,
) {
  if (left.priority !== right.priority) return right.priority - left.priority

  const areaDelta = rectArea(left.hitRect) - rectArea(right.hitRect)
  if (areaDelta !== 0) return areaDelta

  const distanceDelta =
    rectCenterDistance(left.hitRect, point) - rectCenterDistance(right.hitRect, point)
  if (distanceDelta !== 0) return distanceDelta

  return left.id.localeCompare(right.id)
}
