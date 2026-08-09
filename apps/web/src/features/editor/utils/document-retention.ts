const DEFAULT_PROJECT_LIMIT = 3
const DEFAULT_BYTE_BUDGET = 64 * 1024 * 1024

export type RetainedWorkspaceSlice = {
  readonly documentIds: readonly string[]
  readonly lastActiveAt: number
  readonly rootPath: string
  readonly tabIds: readonly string[]
}

export type DocumentRetention = {
  readonly documentIds: ReadonlySet<string>
  readonly tabIds: ReadonlySet<string>
}

/**
 * Which documents and views survive a project switch. Two ceilings, because either
 * alone is defeated: a project count says nothing about bytes (one 100MB file per
 * project blows past any count), and a byte budget alone would keep an unbounded
 * number of tiny projects alive.
 *
 * The keep set is the UNION over every retained slice, never per-slice. Roots nest
 * (/repo and /repo/apps/web), so one absolute path can be referenced by two slices,
 * and computing per slice would drop a document the other slice still displays.
 */
export function retentionForProjects({
  activeRootPath,
  byteBudget = DEFAULT_BYTE_BUDGET,
  documentSizes,
  projectLimit = DEFAULT_PROJECT_LIMIT,
  slices,
}: {
  readonly activeRootPath: string | null
  readonly byteBudget?: number
  readonly documentSizes?: ReadonlyMap<string, number>
  readonly projectLimit?: number
  readonly slices: readonly RetainedWorkspaceSlice[]
}): DocumentRetention {
  const retained = retainedSlices({
    activeRootPath,
    byteBudget,
    documentSizes,
    projectLimit,
    slices,
  })

  return {
    documentIds: new Set(retained.flatMap((slice) => slice.documentIds)),
    tabIds: new Set(retained.flatMap((slice) => slice.tabIds)),
  }
}

function retainedSlices({
  activeRootPath,
  byteBudget,
  documentSizes,
  projectLimit,
  slices,
}: {
  activeRootPath: string | null
  byteBudget: number
  documentSizes: ReadonlyMap<string, number> | undefined
  projectLimit: number
  slices: readonly RetainedWorkspaceSlice[]
}) {
  const active = slices.filter((slice) => slice.rootPath === activeRootPath)
  const parked = slices
    .filter((slice) => slice.rootPath !== activeRootPath)
    .toSorted((left, right) => right.lastActiveAt - left.lastActiveAt)
    .slice(0, Math.max(0, projectLimit - active.length))

  return [...active, ...withinByteBudget(active, parked, byteBudget, documentSizes)]
}

/** The active project is never trimmed; parked ones drop oldest-first until it fits. */
function withinByteBudget(
  active: readonly RetainedWorkspaceSlice[],
  parked: readonly RetainedWorkspaceSlice[],
  byteBudget: number,
  documentSizes: ReadonlyMap<string, number> | undefined,
) {
  if (!documentSizes) return parked

  const counted = new Set<string>()
  let total = 0
  for (const slice of active) total += sliceBytes(slice, documentSizes, counted)

  const kept: RetainedWorkspaceSlice[] = []
  for (const slice of parked) {
    const bytes = sliceBytes(slice, documentSizes, counted)
    if (total + bytes > byteBudget) continue

    total += bytes
    kept.push(slice)
  }

  return kept
}

/** Shared documents are charged once — `counted` carries across slices deliberately. */
function sliceBytes(
  slice: RetainedWorkspaceSlice,
  documentSizes: ReadonlyMap<string, number>,
  counted: Set<string>,
) {
  let bytes = 0
  for (const documentId of slice.documentIds) {
    if (counted.has(documentId)) continue

    counted.add(documentId)
    bytes += documentSizes.get(documentId) ?? 0
  }

  return bytes
}
