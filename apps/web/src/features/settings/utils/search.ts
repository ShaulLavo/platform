import { descriptorFor, SETTING_ROW_IDS, settingRowIds, type SettingId } from '@workspace/contracts'

import { settingRowTitle } from './humanize'

/**
 * Which rows the page shows for a query.
 *
 * Matches id, title, description and keywords in one pass over ~10 entries, so
 * there is nothing to index and nothing to invalidate. Ranking is by where the
 * match landed: an id match is what someone typing `surface.blur` wants first,
 * a description match is the loosest signal.
 *
 * Rows, not keys: a key edited from another key's row has no row to return, and
 * its words still have to find one. A row is scored by the best match across
 * every key it writes, so `models.order` is reachable by that name even though
 * the Models row is the thing that comes back.
 */
export function matchingSettingIds(query: string, ids: readonly SettingId[] = SETTING_ROW_IDS) {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...ids]

  return ids
    .map((id) => ({ id, score: scoreRow(id, needle) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .map((entry) => entry.id)
}

function scoreRow(id: SettingId, needle: string): number {
  const scores = settingRowIds(id).map((key) => scoreSetting(key, needle))

  return Math.max(...scores)
}

function scoreSetting(id: SettingId, needle: string): number {
  const descriptor = descriptorFor(id)
  if (id.toLowerCase().includes(needle)) return 3
  if (settingRowTitle(id).toLowerCase().includes(needle)) return 3
  if (descriptor.category.toLowerCase().includes(needle)) return 2
  if (descriptor.keywords?.some((keyword) => keyword.toLowerCase().includes(needle))) return 2
  if (descriptor.description.toLowerCase().includes(needle)) return 1

  return 0
}
