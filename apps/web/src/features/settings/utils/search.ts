import { descriptorFor, SETTING_IDS, type SettingId } from '@workspace/contracts'

import { humanizeSettingId } from './humanize'

/**
 * Which settings the page shows for a query.
 *
 * Matches id, label, description and keywords in one pass over ~10 entries, so
 * there is nothing to index and nothing to invalidate. Ranking is by where the
 * match landed: an id match is what someone typing `surface.blur` wants first,
 * a description match is the loosest signal.
 */
export function matchingSettingIds(query: string, ids: readonly SettingId[] = SETTING_IDS) {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...ids]

  return ids
    .map((id) => ({ id, score: scoreSetting(id, needle) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .map((entry) => entry.id)
}

function scoreSetting(id: SettingId, needle: string): number {
  const descriptor = descriptorFor(id)
  if (id.toLowerCase().includes(needle)) return 3
  if (humanizeSettingId(id).toLowerCase().includes(needle)) return 3
  if (descriptor.category.toLowerCase().includes(needle)) return 2
  if (descriptor.keywords?.some((keyword) => keyword.toLowerCase().includes(needle))) return 2
  if (descriptor.description.toLowerCase().includes(needle)) return 1

  return 0
}
