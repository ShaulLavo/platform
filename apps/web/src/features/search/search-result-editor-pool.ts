import type { SearchResultId } from '@/features/search/search-result-items'

export const SEARCH_RESULT_FILE_EDITOR_POOL_RECENT_SIZE = 1

export function nextSearchResultFileEditorPoolKeys(
  currentKeys: readonly SearchResultId[],
  visibleKeys: readonly SearchResultId[],
  prewarmEditorPool: boolean,
) {
  if (!prewarmEditorPool) return visibleKeys
  if (visibleKeys.length === 0)
    return currentKeys.slice(0, SEARCH_RESULT_FILE_EDITOR_POOL_RECENT_SIZE)

  const visibleKeySet = new Set(visibleKeys)
  const nextKeys: SearchResultId[] = []
  let retainedHiddenCount = 0
  for (const key of currentKeys) {
    if (visibleKeySet.has(key)) {
      nextKeys.push(key)
      continue
    }
    if (retainedHiddenCount >= SEARCH_RESULT_FILE_EDITOR_POOL_RECENT_SIZE) continue

    retainedHiddenCount += 1
    nextKeys.push(key)
  }
  const nextKeySet = new Set(nextKeys)
  for (const key of visibleKeys) {
    if (nextKeySet.has(key)) continue

    nextKeys.push(key)
  }

  return nextKeys
}

export function searchResultFileEditorPoolKeysEqual(
  left: readonly SearchResultId[],
  right: readonly SearchResultId[],
) {
  if (left.length !== right.length) return false

  return left.every((key, index) => key === right[index])
}
