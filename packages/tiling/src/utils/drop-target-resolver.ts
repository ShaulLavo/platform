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
import type { LayoutEdge, WindowId } from '@workspace/tiling/utils/layout-types'

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

// A target window's full rect, used to partition its whole area into wedges so
// there is no dead space between the thin edge bands and the inner center.
export type TilingWindowRegion = {
  readonly rect: LayoutRect
  readonly windowId: WindowId
}

export type ResolveTilingTargetInput = {
  readonly candidates: readonly TilingDropCandidate[]
  readonly mode: TilingIntentMode
  readonly point: PointerCoordinates
  readonly previousTarget: ResolvedTilingTarget | null
  readonly rootRect?: LayoutRect | null
  readonly source: TilingDragData
  readonly sourceWindowId?: WindowId | null
  // The window the drag vacates (lone tab or window drag); excluded from the
  // partition because its footprint belongs to source-return/source-vacancy.
  readonly vacatingWindowId?: WindowId | null
  readonly tabTarget: TilingTabTarget | null
  readonly windowRegions?: readonly TilingWindowRegion[]
}

export const WINDOW_BODY_TAB_TARGET_PRIORITY = 100
export const STRIP_TAB_TARGET_PRIORITY = 106
export const DOCK_TAB_TARGET_PRIORITY = 108
export const DIRECT_TAB_TARGET_PRIORITY = 110

const STICKY_TARGET_INFLATE_PX = 18

// Partition tuning. The window interior is split into four triangular wedges by
// its diagonals; the inner box is the merge-as-tab zone. WEDGE_DEADBAND is the
// hysteresis around a diagonal seam (normalized), the gravity ratio is the
// outer fraction of the root that docks to the whole workspace, and the anchor
// inset is how deep inside the chosen edge we sample to pick the real candidate.
export const WINDOW_CENTER_HALF_EXTENT = 0.22
export const ROOT_GRAVITY_MARGIN_RATIO = 0.1
const WEDGE_DEADBAND = 0.18
const EDGE_ANCHOR_INSET_PX = 24

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
  // A pointer directly inside a strip always means tab insertion; stickiness
  // only suppresses the weaker halo and body hits around the source strip.
  if (input.tabTarget.priority >= DIRECT_TAB_TARGET_PRIORITY) return false
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

// The literal hit (point inside a candidate rect) keeps the precise affordances
// that have no dead-space problem — source-return/vacancy and exact band hits —
// while the partition fills the rest of the window. They agree on the bands; in
// the dead ring and center the literal is null and the partition wins. Higher
// literal priority (e.g. source-return at 120) still beats the partition.
function resolvedSnapCandidate(
  input: ResolveTilingTargetInput,
  stickyCandidate: TilingDropCandidate | null,
) {
  const literalCandidate = literalSnapCandidate(input, stickyCandidate)
  const partitionCandidate = partitionSnapCandidate(input)
  if (!partitionCandidate) return literalCandidate
  if (!literalCandidate) return partitionCandidate
  if (literalCandidate.priority > partitionCandidate.priority) return literalCandidate

  return partitionCandidate
}

function literalSnapCandidate(
  input: ResolveTilingTargetInput,
  stickyCandidate: TilingDropCandidate | null,
) {
  const candidatesAtPoint = input.candidates.filter((candidate) =>
    candidateContainsPoint(candidate, input.point),
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
  if (!candidateContainsInflatedPoint(candidate, point)) return null

  return candidate
}

function candidateContainsPoint(candidate: TilingDropCandidate, point: PointerCoordinates) {
  return candidate.hitRects.some((rect) => pointInRect(rect, point))
}

function candidateContainsInflatedPoint(candidate: TilingDropCandidate, point: PointerCoordinates) {
  return candidate.hitRects.some((rect) =>
    pointInRect(inflateRect(rect, STICKY_TARGET_INFLATE_PX), point),
  )
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

  const areaDelta = candidateHitArea(left) - candidateHitArea(right)
  if (areaDelta !== 0) return areaDelta

  const distanceDelta = candidateCenterDistance(left, point) - candidateCenterDistance(right, point)
  if (distanceDelta !== 0) return distanceDelta

  return left.id.localeCompare(right.id)
}

function candidateHitArea(candidate: TilingDropCandidate) {
  return candidate.hitRects.reduce((sum, rect) => sum + rectArea(rect), 0)
}

function candidateCenterDistance(candidate: TilingDropCandidate, point: PointerCoordinates) {
  return Math.min(...candidate.hitRects.map((rect) => rectCenterDistance(rect, point)))
}

type WedgeRegion = LayoutEdge | 'center'

// Resolution for the gaps the literal hit-test leaves dead. Root gravity wins
// near the viewport edge (dock the whole workspace), otherwise the window under
// the pointer is partitioned into wedges, and points in split gutters fall back
// to the nearest root edge.
function partitionSnapCandidate(input: ResolveTilingTargetInput): TilingDropCandidate | null {
  if (!input.windowRegions || input.windowRegions.length === 0) return null

  const gravityCandidate = rootGravityCandidate(input)
  if (gravityCandidate) return gravityCandidate

  // Tab drags never wedge-split a window. The body stays a merge/return field so
  // a tab snapped out can be dragged back into its strip without the layout
  // reflowing under the pointer and walking the target away. The "snap a tab out
  // to split" intent is served by root gravity (dock the workspace edge), not by
  // carving the source window. Only whole-window drags partition into wedges.
  if (input.source.kind !== 'window') return null

  const region = containingWindowRegion(partitionRegions(input), input.point)
  if (region) return windowWedgeCandidate(input, region)

  // Nearest-root only fills true gaps between windows, never the interior of a
  // window we deliberately left unpartitioned (the vacating source window).
  if (containingWindowRegion(input.windowRegions, input.point)) return null

  return nearestRootEdgeCandidate(input)
}

// A window drag may wedge-split any window it is not leaving; the vacating
// window's footprint stays a source-return/source-vacancy field instead.
function partitionRegions(input: ResolveTilingTargetInput): readonly TilingWindowRegion[] {
  return (input.windowRegions ?? []).filter((region) => region.windowId !== input.vacatingWindowId)
}

function containingWindowRegion(
  regions: readonly TilingWindowRegion[],
  point: PointerCoordinates,
): TilingWindowRegion | null {
  let best: TilingWindowRegion | null = null
  for (const region of regions) {
    if (!pointInRect(region.rect, point)) continue
    if (best && rectArea(region.rect) >= rectArea(best.rect)) continue

    best = region
  }

  return best
}

function windowWedgeCandidate(
  input: ResolveTilingTargetInput,
  region: TilingWindowRegion,
): TilingDropCandidate | null {
  const previousEdge = previousWedgeRegion(input, region)
  const wedge = wedgeForRect(region.rect, input.point, previousEdge)
  const anchor = wedge === 'center' ? rectCenter(region.rect) : edgeAnchor(region.rect, wedge)

  return candidateAtPoint(input.candidates, anchor)
}

// Classify the pointer by its position relative to the window center: the inner
// box is the merge zone, otherwise the dominant axis picks an edge. Near a
// diagonal seam the previous wedge is held to stop flicker.
function wedgeForRect(
  rect: LayoutRect,
  point: PointerCoordinates,
  previousEdge: WedgeRegion | null,
): WedgeRegion {
  const halfWidth = rect.width / 2 || 1
  const halfHeight = rect.height / 2 || 1
  const u = (point.x - (rect.x + halfWidth)) / halfWidth
  const v = (point.y - (rect.y + halfHeight)) / halfHeight
  const absU = Math.abs(u)
  const absV = Math.abs(v)
  if (absU < WINDOW_CENTER_HALF_EXTENT && absV < WINDOW_CENTER_HALF_EXTENT) return 'center'

  const horizontalEdge: LayoutEdge = u >= 0 ? 'right' : 'left'
  const verticalEdge: LayoutEdge = v >= 0 ? 'bottom' : 'top'
  if (wedgeHoldsPrevious(previousEdge, horizontalEdge, verticalEdge, absU, absV)) {
    return previousEdge as WedgeRegion
  }

  return absU >= absV ? horizontalEdge : verticalEdge
}

function wedgeHoldsPrevious(
  previousEdge: WedgeRegion | null,
  horizontalEdge: LayoutEdge,
  verticalEdge: LayoutEdge,
  absU: number,
  absV: number,
): boolean {
  if (previousEdge !== horizontalEdge && previousEdge !== verticalEdge) return false

  return Math.abs(absU - absV) < WEDGE_DEADBAND
}

// The previous wedge is recovered geometrically from where the last candidate
// sat relative to this window, so it survives candidate merges that rewrite the
// winning id (e.g. a shared edge represented by the neighbor's window-edge).
function previousWedgeRegion(
  input: ResolveTilingTargetInput,
  region: TilingWindowRegion,
): WedgeRegion | null {
  const previousId = input.previousTarget?.candidateId
  if (!previousId) return null

  const previous = input.candidates.find((candidate) => candidate.id === previousId)
  if (!previous) return null
  if (isWindowCenterCandidate(previous, region.windowId)) return 'center'

  const hitRect = nearestHitRect(previous, rectCenter(region.rect))
  if (!hitRect) return null

  return wedgeForRect(region.rect, rectCenter(hitRect), null)
}

function isWindowCenterCandidate(candidate: TilingDropCandidate, windowId: WindowId): boolean {
  if (candidate.target.kind !== 'snap-destination') return false
  if (candidate.target.destination.kind !== 'window-center') return false

  return candidate.target.destination.windowId === windowId
}

function nearestHitRect(candidate: TilingDropCandidate, point: PointerCoordinates) {
  return (
    candidate.hitRects.toSorted(
      (left, right) => rectCenterDistance(left, point) - rectCenterDistance(right, point),
    )[0] ?? null
  )
}

function candidateAtPoint(
  candidates: readonly TilingDropCandidate[],
  point: PointerCoordinates,
): TilingDropCandidate | null {
  const candidatesAtPoint = candidates.filter((candidate) =>
    candidateContainsPoint(candidate, point),
  )

  return bestCandidate(candidatesAtPoint, point)
}

function rootGravityCandidate(input: ResolveTilingTargetInput): TilingDropCandidate | null {
  const rootRect = input.rootRect
  if (!rootRect) return null

  let best: { candidate: TilingDropCandidate; depth: number } | null = null
  for (const candidate of input.candidates) {
    const edge = rootEdgeOfCandidate(candidate)
    if (!edge) continue

    const depth = rootEdgeGravityDepth(rootRect, edge, input.point)
    if (depth === null) continue
    if (best && depth >= best.depth) continue

    best = { candidate, depth }
  }

  return best?.candidate ?? null
}

function nearestRootEdgeCandidate(input: ResolveTilingTargetInput): TilingDropCandidate | null {
  const rootRect = input.rootRect
  if (!rootRect) return null

  let best: { candidate: TilingDropCandidate; distance: number } | null = null
  for (const candidate of input.candidates) {
    const edge = rootEdgeOfCandidate(candidate)
    if (!edge) continue

    const distance = rootEdgeDistance(rootRect, edge, input.point)
    if (best && distance >= best.distance) continue

    best = { candidate, distance }
  }

  return best?.candidate ?? null
}

function rootEdgeOfCandidate(candidate: TilingDropCandidate): LayoutEdge | null {
  if (candidate.target.kind !== 'snap-destination') return null
  if (candidate.target.destination.kind !== 'root-edge') return null

  return candidate.target.destination.edge
}

function rootEdgeGravityDepth(
  rootRect: LayoutRect,
  edge: LayoutEdge,
  point: PointerCoordinates,
): number | null {
  const marginX = rootRect.width * ROOT_GRAVITY_MARGIN_RATIO
  const marginY = rootRect.height * ROOT_GRAVITY_MARGIN_RATIO
  const right = rootRect.x + rootRect.width
  const bottom = rootRect.y + rootRect.height
  if (edge === 'left') return point.x <= rootRect.x + marginX ? point.x - rootRect.x : null
  if (edge === 'right') return point.x >= right - marginX ? right - point.x : null
  if (edge === 'top') return point.y <= rootRect.y + marginY ? point.y - rootRect.y : null

  return point.y >= bottom - marginY ? bottom - point.y : null
}

function rootEdgeDistance(
  rootRect: LayoutRect,
  edge: LayoutEdge,
  point: PointerCoordinates,
): number {
  const right = rootRect.x + rootRect.width
  const bottom = rootRect.y + rootRect.height
  if (edge === 'left') return Math.abs(point.x - rootRect.x)
  if (edge === 'right') return Math.abs(right - point.x)
  if (edge === 'top') return Math.abs(point.y - rootRect.y)

  return Math.abs(bottom - point.y)
}

function rectCenter(rect: LayoutRect): PointerCoordinates {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function edgeAnchor(rect: LayoutRect, edge: LayoutEdge): PointerCoordinates {
  const inset = Math.min(EDGE_ANCHOR_INSET_PX, rect.width / 2, rect.height / 2)
  const center = rectCenter(rect)
  if (edge === 'left') return { x: rect.x + inset, y: center.y }
  if (edge === 'right') return { x: rect.x + rect.width - inset, y: center.y }
  if (edge === 'top') return { x: center.x, y: rect.y + inset }

  return { x: center.x, y: rect.y + rect.height - inset }
}
