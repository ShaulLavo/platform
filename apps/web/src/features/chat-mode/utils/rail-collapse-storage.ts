import { projectIdSchema, type ProjectId } from '@workspace/contracts'
import * as v from 'valibot'

const RAIL_COLLAPSE_STORAGE_KEY = 'platform.chat-rail-collapse.v1'
const RAIL_COLLAPSE_STORAGE_VERSION = 1
/**
 * Nothing prunes ids for projects that were removed elsewhere, so the list is
 * bounded here. Losing an entry only re-expands one group once, which is the
 * cheapest possible failure for this state.
 */
const MAX_COLLAPSED_PROJECTS = 200

const persistedRailCollapseSchema = v.object({
  collapsedProjectIds: v.array(projectIdSchema),
  version: v.literal(RAIL_COLLAPSE_STORAGE_VERSION),
})

const NO_PROJECT_IDS: readonly ProjectId[] = []

export function readPersistedRailCollapse(): readonly ProjectId[] {
  if (!canUseLocalStorage()) return NO_PROJECT_IDS

  try {
    const raw = localStorage.getItem(RAIL_COLLAPSE_STORAGE_KEY)
    if (!raw) return NO_PROJECT_IDS

    const parsed = v.safeParse(persistedRailCollapseSchema, JSON.parse(raw))
    if (!parsed.success) return NO_PROJECT_IDS

    return parsed.output.collapsedProjectIds
  } catch {
    return NO_PROJECT_IDS
  }
}

export function writePersistedRailCollapse(collapsedProjectIds: readonly ProjectId[]) {
  if (!canUseLocalStorage()) return

  try {
    localStorage.setItem(
      RAIL_COLLAPSE_STORAGE_KEY,
      JSON.stringify({
        collapsedProjectIds: collapsedProjectIds.slice(0, MAX_COLLAPSED_PROJECTS),
        version: RAIL_COLLAPSE_STORAGE_VERSION,
      }),
    )
  } catch {
    // A full or unavailable store costs the user a re-expanded group on the
    // next reload. Nothing here is worth interrupting a click over.
  }
}

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined'
}
