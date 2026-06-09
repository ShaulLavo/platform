import type { DndProofDragData, DndProofDropData } from '@/features/dnd-proof/utils/drag-data'
import type { DndProofDropCandidate } from '@/features/dnd-proof/utils/snap-destinations'
import type { LayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import type { WindowId } from '@/features/tiling-surface-manager/engine/layout-types'

export type DndProofIntentMode = 'idle' | 'tab-detached' | 'tab-reorder' | 'window'

export type ResolvedDndProofTarget = {
  readonly candidateId?: string
  readonly mode: DndProofIntentMode
  readonly previewKind?: 'app' | 'dnd-kit'
  readonly target: DndProofDropData
}

export type DndProofTabTarget = {
  readonly previewKind?: 'app' | 'dnd-kit'
  readonly priority: number
  readonly target: Extract<DndProofDropData, { readonly kind: 'tab' | 'tab-strip' }>
}

export type ResolveDndProofTargetInput = {
  readonly candidates: readonly DndProofDropCandidate[]
  readonly mode: DndProofIntentMode
  readonly point: PointerCoordinates
  readonly previousTarget: ResolvedDndProofTarget | null
  readonly source: DndProofDragData
  readonly sourceWindowId?: WindowId | null
  readonly tabTarget: DndProofTabTarget | null
}

type PointerCoordinates = {
  readonly x: number
  readonly y: number
}

const STICKY_TARGET_INFLATE_PX = 18

export function resolveDndProofTarget(
  input: ResolveDndProofTargetInput,
): ResolvedDndProofTarget | null {
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

function stickyCandidateBeatsTabTarget(
  input: ResolveDndProofTargetInput,
  stickyCandidate: DndProofDropCandidate | null,
  candidate: DndProofDropCandidate | null,
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
}: ResolveDndProofTargetInput): ResolvedDndProofTarget | null {
  if (!tabTarget) return null
  if (!targetBelongsToTabStrip(tabTarget.target)) return null
  if (mode === 'tab-reorder') return resolvedTabTargetFromInput(mode, tabTarget)
  if (mode === 'tab-detached') return resolvedTabTargetFromInput(mode, tabTarget)
  if (mode !== 'window') return null
  if (source.kind !== 'window') return null
  if (tabTarget.target.windowId === source.windowId) return null

  return resolvedTabTargetFromInput(mode, tabTarget)
}

function resolvedTabTargetFromInput(mode: DndProofIntentMode, tabTarget: DndProofTabTarget) {
  return {
    mode,
    previewKind: tabTarget.previewKind,
    target: tabTarget.target,
  }
}

function resolvedCandidateTarget(
  input: ResolveDndProofTargetInput,
  candidate: DndProofDropCandidate | null,
): ResolvedDndProofTarget | null {
  if (!candidate) return null

  return {
    candidateId: candidate.id,
    mode: input.mode,
    target: candidate.target,
  }
}

function resolvedSnapCandidate(
  input: ResolveDndProofTargetInput,
  stickyCandidate: DndProofDropCandidate | null,
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

function previousStickyCandidate({
  candidates,
  point,
  previousTarget,
}: ResolveDndProofTargetInput) {
  if (!previousTarget?.candidateId) return null

  const candidate = candidates.find((value) => value.id === previousTarget.candidateId)
  if (!candidate) return null
  if (!pointInRect(inflateRect(candidate.hitRect, STICKY_TARGET_INFLATE_PX), point)) return null

  return candidate
}

function bestCandidate(candidates: readonly DndProofDropCandidate[], point: PointerCoordinates) {
  return candidates.toSorted((left, right) => compareCandidates(left, right, point))[0] ?? null
}

function compareCandidates(
  left: DndProofDropCandidate,
  right: DndProofDropCandidate,
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

function targetBelongsToTabStrip(
  target: DndProofDropData,
): target is Extract<DndProofDropData, { readonly kind: 'tab' | 'tab-strip' }> {
  return target.kind === 'tab' || target.kind === 'tab-strip'
}

function pointInRect(rect: LayoutRect, point: PointerCoordinates) {
  if (point.x < rect.x) return false
  if (point.x > rect.x + rect.width) return false
  if (point.y < rect.y) return false

  return point.y <= rect.y + rect.height
}

function inflateRect(rect: LayoutRect, amount: number): LayoutRect {
  return {
    height: rect.height + amount * 2,
    width: rect.width + amount * 2,
    x: rect.x - amount,
    y: rect.y - amount,
  }
}

function rectArea(rect: LayoutRect) {
  return rect.width * rect.height
}

function rectCenterDistance(rect: LayoutRect, point: PointerCoordinates) {
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2

  return Math.hypot(point.x - centerX, point.y - centerY)
}
