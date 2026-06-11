import type { TilingDragData } from '@workspace/tiling/utils/drag-data'
import { tilingDragTargetLayout } from '@workspace/tiling/utils/drag-layout'
import type { TilingDropCandidate } from '@workspace/tiling/utils/snap-destinations'
import type { LayoutNodeId, WindowId, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

// Candidates whose simulated drop produces the same layout structure are one
// zone to the user: merging them removes double zones (root-left vs the
// leftmost column's window-left) and stops the resolver from treating a hop
// between them as a target change. Root-edge wins representation so outer-edge
// drops keep the "half the screen" sizing.
export function mergeEquivalentDropCandidates(
  layout: WorkspaceLayout,
  source: TilingDragData | null,
  candidates: readonly TilingDropCandidate[],
): readonly TilingDropCandidate[] {
  if (!source) return candidates

  const groups = new Map<string, TilingDropCandidate[]>()
  const exempt: TilingDropCandidate[] = []
  for (const candidate of candidates) {
    // The source-vacancy corridor intentionally duplicates a root edge over
    // the dragged window's vacated slot; merging it away would remove that
    // drag-origin affordance.
    if (candidate.kind === 'source-vacancy') {
      exempt.push(candidate)
      continue
    }

    const key = layoutStructureKey(tilingDragTargetLayout(layout, source, candidate.target))
    const group = groups.get(key)
    if (group) {
      group.push(candidate)
      continue
    }

    groups.set(key, [candidate])
  }

  return [...[...groups.values()].map(mergedCandidate), ...exempt]
}

// Sizes are deliberately excluded: equivalent destinations differ only in the
// initial split ratio they assign, and the representative's ratio wins.
// Node ids are excluded too — equivalent insert paths create different
// intermediate split ids. Sticky placement hints and MRU lists record the
// destination itself, so including them would defeat every merge.
export function layoutStructureKey(layout: WorkspaceLayout): string {
  return JSON.stringify({
    activeSurfaceId: layout.activeSurfaceId ?? null,
    activeWindowId: layout.activeWindowId ?? null,
    rail: layout.rail,
    tree: nodeStructure(layout, layout.rootNodeId),
  })
}

function mergedCandidate(members: readonly TilingDropCandidate[]): TilingDropCandidate {
  const first = members[0]
  if (members.length === 1 && first) return first

  const representative = mergedRepresentative(members)

  return {
    ...representative,
    hitRects: members.flatMap((member) => member.hitRects),
    id: mergedId(members),
  }
}

// Source-return preserves the original split sizes exactly, so it outranks
// everything in its (no-op) group. Root-edge outranks window edges so outer
// drops keep the "half the root" sizing. Between the two window edges of an
// internal boundary, the trailing edge of the earlier window wins so the zone
// label does not depend on id tie-breaks.
function mergedRepresentative(members: readonly TilingDropCandidate[]): TilingDropCandidate {
  const sourceReturn = members.find((member) => member.kind === 'source-return')
  if (sourceReturn) return sourceReturn

  const rootEdge = members.find((member) => member.kind === 'root-edge')
  if (rootEdge) return rootEdge

  return members.toSorted(compareByPriorityThenEdge)[0] as TilingDropCandidate
}

function compareByPriorityThenEdge(left: TilingDropCandidate, right: TilingDropCandidate) {
  if (left.priority !== right.priority) return right.priority - left.priority

  const edgeDelta = trailingEdgeRank(left) - trailingEdgeRank(right)
  if (edgeDelta !== 0) return edgeDelta

  return left.id.localeCompare(right.id)
}

function trailingEdgeRank(candidate: TilingDropCandidate) {
  if (candidate.edge === 'right' || candidate.edge === 'bottom') return 0

  return 1
}

function mergedId(members: readonly TilingDropCandidate[]) {
  const memberIds = members.map((member) => member.id)

  return `merged:${memberIds.toSorted().join('|')}`
}

function nodeStructure(layout: WorkspaceLayout, nodeId: LayoutNodeId | null): unknown {
  if (!nodeId) return null

  const node = layout.nodesById[nodeId]
  if (!node) return null
  if (node.kind === 'window') return windowStructure(layout, node.windowId)

  return {
    axis: node.axis,
    children: node.childIds.map((childId) => nodeStructure(layout, childId)),
    kind: 'split',
  }
}

function windowStructure(layout: WorkspaceLayout, windowId: WindowId): unknown {
  const window = layout.windowsById[windowId]
  if (!window) return { kind: 'window' }

  return {
    activeSurfaceId: window.activeSurfaceId,
    collapsedEdge: window.collapsedEdge ?? null,
    kind: 'window',
    mode: window.mode,
    pinnedSurfaceIds: window.pinnedSurfaceIds,
    surfaceIds: window.surfaceIds,
  }
}
