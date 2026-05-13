import type { SearchResultId } from "@/features/search/search-result-items"

export const SEARCH_RESULT_FILE_EDITOR_POOL_RECENT_SIZE = 4

export function nextSearchResultFileEditorPoolKeys(
  currentKeys: readonly SearchResultId[],
  visibleKeys: readonly SearchResultId[],
  prewarmEditorPool: boolean
) {
  if (!prewarmEditorPool) return visibleKeys
  if (visibleKeys.length === 0)
    return currentKeys.slice(0, SEARCH_RESULT_FILE_EDITOR_POOL_RECENT_SIZE)

  const visibleKeySet = new Set(visibleKeys)
  const maxCount =
    visibleKeys.length + SEARCH_RESULT_FILE_EDITOR_POOL_RECENT_SIZE
  const nextKeys = [...visibleKeys]
  for (const key of currentKeys) {
    if (visibleKeySet.has(key)) continue
    if (nextKeys.length >= maxCount) break

    nextKeys.push(key)
  }

  return nextKeys
}

export function searchResultFileEditorPoolKeysEqual(
  left: readonly SearchResultId[],
  right: readonly SearchResultId[]
) {
  if (left.length !== right.length) return false

  return left.every((key, index) => key === right[index])
}
