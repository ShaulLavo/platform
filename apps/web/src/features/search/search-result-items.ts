import type { WorkspaceSearchMatch } from "@workspace/contracts"

import type { WorkspaceSearchFileGroup } from "@/features/search/search-buffer-state"

export type SearchResultId = string

export type SearchResultItem =
  | {
      group: WorkspaceSearchFileGroup
      id: SearchResultId
      level: 1
      type: "group"
    }
  | {
      group: WorkspaceSearchFileGroup
      id: SearchResultId
      level: 1
      match: WorkspaceSearchMatch
      type: "name"
    }
  | {
      groupId: SearchResultId
      groupPath: string
      id: SearchResultId
      level: 2
      match: WorkspaceSearchMatch
      matchIndex: number
      type: "match"
    }

const STABLE_HASH_CACHE_LIMIT = 4096
const stableHashCache = new Map<string, string>()
const searchMatchIdentityCache = new WeakMap<WorkspaceSearchMatch, string>()

export function searchResultItems(groups: readonly WorkspaceSearchFileGroup[]) {
  const items: SearchResultItem[] = []

  for (const group of groups) {
    appendGroupItems(items, group)
  }

  return items
}

function appendGroupItems(
  items: SearchResultItem[],
  group: WorkspaceSearchFileGroup
) {
  const groupId = searchResultGroupId(group.path)
  const contentMatches = group.matches.filter(
    (match) => match.kind === "content"
  )
  if (contentMatches.length === 0) {
    const match = group.matches[0]
    if (match) {
      items.push({
        group,
        id: searchResultNameId(group.path, match),
        level: 1,
        match,
        type: "name",
      })
    }
    return
  }

  items.push({
    group: contentGroup(group, contentMatches),
    id: groupId,
    level: 1,
    type: "group",
  })
  if (group.collapsed) return

  const duplicateCounts = new Map<string, number>()
  contentMatches.forEach((match, matchIndex) => {
    const identity = searchMatchIdentity(match)
    const duplicateIndex = nextDuplicateIndex(duplicateCounts, identity)
    items.push({
      groupId,
      groupPath: group.path,
      id: searchResultMatchIdForIdentity(
        group.path,
        identity,
        duplicateIndex
      ),
      level: 2,
      match,
      matchIndex,
      type: "match",
    })
  })
}

export function expandedSearchResultItems(
  groups: readonly WorkspaceSearchFileGroup[]
) {
  return searchResultItems(groups.map(expandedGroup))
}

export function searchResultItemById(
  items: readonly SearchResultItem[],
  id: SearchResultId | null
) {
  if (!id) return null

  return items.find((item) => item.id === id) ?? null
}

export function firstSelectableSearchResultId(
  groups: readonly WorkspaceSearchFileGroup[]
) {
  let firstVisibleId: SearchResultId | null = null

  for (const group of groups) {
    firstVisibleId ??= firstVisibleGroupResultId(group)

    const selectableId = firstSelectableGroupResultId(group)
    if (selectableId) return selectableId
  }

  return firstVisibleId
}

export function visibleSearchResultId(
  groups: readonly WorkspaceSearchFileGroup[],
  id: SearchResultId | null
) {
  if (!id) return firstSelectableSearchResultId(groups)

  if (searchResultIdIsVisible(groups, id)) return id

  const parentId = hiddenSearchResultParentId(groups, id)
  if (parentId) return parentId

  return firstSelectableSearchResultId(groups)
}

export function searchResultContentItems(items: readonly SearchResultItem[]) {
  return items.filter(isContentSearchResultItem)
}

export function searchResultActiveMatchPosition(
  items: readonly SearchResultItem[],
  activeResultId: SearchResultId | null
) {
  const matches = searchResultContentItems(items)
  const index = matches.findIndex((item) => item.id === activeResultId)
  if (index < 0) return null

  return {
    index: index + 1,
    total: matches.length,
  }
}

export function searchResultIdByOffset({
  activeResultId,
  items,
  offset,
}: {
  activeResultId: SearchResultId | null
  items: readonly SearchResultItem[]
  offset: number
}) {
  if (items.length === 0) return null

  const activeIndex = searchResultIndex(items, activeResultId)
  const fallback = offset >= 0 ? 0 : items.length - 1
  if (activeIndex < 0) return items[fallback]?.id ?? null

  const startIndex = activeIndex < 0 ? fallback : activeIndex
  const nextIndex = clampIndex(startIndex + offset, items.length)
  return items[nextIndex]?.id ?? null
}

export function firstSearchResultId(items: readonly SearchResultItem[]) {
  return items[0]?.id ?? null
}

export function lastSearchResultId(items: readonly SearchResultItem[]) {
  return items.at(-1)?.id ?? null
}

export function firstSearchResultChildId(
  items: readonly SearchResultItem[],
  groupId: SearchResultId
) {
  return items.find((item) => item.type === "match" && item.groupId === groupId)
    ?.id
}

export function parentSearchResultId(
  items: readonly SearchResultItem[],
  activeResultId: SearchResultId | null
) {
  const active = searchResultItemById(items, activeResultId)
  if (active?.type !== "match") return null

  return active.groupId
}

function contentGroup(
  group: WorkspaceSearchFileGroup,
  matches: WorkspaceSearchMatch[]
) {
  return {
    ...group,
    count: matches.length,
    matches,
  }
}

function expandedGroup(group: WorkspaceSearchFileGroup) {
  return {
    ...group,
    collapsed: false,
  }
}

function isContentSearchResultItem(
  item: SearchResultItem
): item is Extract<SearchResultItem, { type: "match" }> {
  return item.type === "match"
}

function searchResultIndex(
  items: readonly SearchResultItem[],
  id: SearchResultId | null
) {
  if (!id) return -1

  return items.findIndex((item) => item.id === id)
}

function clampIndex(index: number, length: number) {
  return Math.min(Math.max(index, 0), length - 1)
}

function searchResultGroupId(path: string) {
  return searchResultDomId("group", path)
}

function searchResultNameId(path: string, match: WorkspaceSearchMatch) {
  return searchResultDomId("name", `${path}\0${searchMatchIdentity(match)}`)
}

function searchResultMatchId(
  path: string,
  match: WorkspaceSearchMatch,
  duplicateIndex: number
) {
  return searchResultMatchIdForIdentity(
    path,
    searchMatchIdentity(match),
    duplicateIndex
  )
}

function searchResultMatchIdForIdentity(
  path: string,
  identity: string,
  duplicateIndex: number
) {
  return searchResultDomId(
    "match",
    `${path}\0${identity}\0${duplicateIndex}`
  )
}

function searchResultDomId(prefix: string, value: string) {
  return `search-result-${prefix}-${stableHash(value)}`
}

function searchMatchIdentity(match: WorkspaceSearchMatch) {
  const cached = searchMatchIdentityCache.get(match)
  if (cached) return cached

  const identity = [
    match.kind,
    match.source,
    match.type,
    match.targetType ?? "",
    match.path,
    match.line ?? "",
    match.column ?? "",
    match.endColumn ?? "",
    match.previewStartColumn ?? "",
    match.preview ?? "",
  ].join("\0")
  searchMatchIdentityCache.set(match, identity)

  return identity
}

function stableHash(value: string) {
  const cached = stableHashCache.get(value)
  if (cached) return cached

  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  const result = (hash >>> 0).toString(36)
  stableHashCache.set(value, result)
  trimStableHashCache()

  return result
}

function trimStableHashCache() {
  if (stableHashCache.size <= STABLE_HASH_CACHE_LIMIT) return

  const firstKey = stableHashCache.keys().next().value
  if (firstKey === undefined) return

  stableHashCache.delete(firstKey)
}

function firstVisibleGroupResultId(
  group: WorkspaceSearchFileGroup
): SearchResultId | null {
  if (firstContentMatch(group)) return searchResultGroupId(group.path)

  const match = group.matches[0]
  if (!match) return null

  return searchResultNameId(group.path, match)
}

function firstSelectableGroupResultId(
  group: WorkspaceSearchFileGroup
): SearchResultId | null {
  const match = firstContentMatch(group)
  if (!match) return firstNameResultId(group)
  if (group.collapsed) return null

  return searchResultMatchId(group.path, match, 0)
}

function firstNameResultId(
  group: WorkspaceSearchFileGroup
): SearchResultId | null {
  if (firstContentMatch(group)) return null

  const match = group.matches[0]
  if (!match) return null

  return searchResultNameId(group.path, match)
}

function firstContentMatch(group: WorkspaceSearchFileGroup) {
  return group.matches.find((match) => match.kind === "content") ?? null
}

function searchResultIdIsVisible(
  groups: readonly WorkspaceSearchFileGroup[],
  id: SearchResultId
) {
  for (const group of groups) {
    if (groupResultIdIsVisible(group, id)) return true
  }

  return false
}

function groupResultIdIsVisible(
  group: WorkspaceSearchFileGroup,
  id: SearchResultId
) {
  const firstContent = firstContentMatch(group)
  if (!firstContent) return nameResultIdIsVisible(group, id)
  if (searchResultGroupId(group.path) === id) return true
  if (group.collapsed) return false

  return contentResultIdIsPresent(group, id)
}

function nameResultIdIsVisible(
  group: WorkspaceSearchFileGroup,
  id: SearchResultId
) {
  const match = group.matches[0]
  if (!match) return false

  return searchResultNameId(group.path, match) === id
}

function hiddenSearchResultParentId(
  groups: readonly WorkspaceSearchFileGroup[],
  id: SearchResultId
) {
  for (const group of groups) {
    if (!contentResultIdIsPresent(group, id)) continue

    return searchResultGroupId(group.path)
  }

  return null
}

function contentResultIdIsPresent(
  group: WorkspaceSearchFileGroup,
  id: SearchResultId
) {
  const duplicateCounts = new Map<string, number>()

  for (const match of group.matches) {
    if (match.kind !== "content") continue

    const identity = searchMatchIdentity(match)
    const duplicateIndex = nextDuplicateIndex(duplicateCounts, identity)
    const matchId = searchResultMatchIdForIdentity(
      group.path,
      identity,
      duplicateIndex
    )
    if (matchId === id) return true
  }

  return false
}

function nextDuplicateIndex(
  duplicateCounts: Map<string, number>,
  identity: string
) {
  const duplicateIndex = duplicateCounts.get(identity) ?? 0
  duplicateCounts.set(identity, duplicateIndex + 1)

  return duplicateIndex
}
