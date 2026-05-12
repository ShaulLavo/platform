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
    const duplicateIndex = duplicateCounts.get(identity) ?? 0
    duplicateCounts.set(identity, duplicateIndex + 1)
    items.push({
      groupId,
      groupPath: group.path,
      id: searchResultMatchId(group.path, match, duplicateIndex),
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
  const visibleItems = searchResultItems(groups)
  const visibleMatch = visibleItems.find(isSelectableSearchResultItem)
  if (visibleMatch) return visibleMatch.id

  return visibleItems[0]?.id ?? null
}

export function visibleSearchResultId(
  groups: readonly WorkspaceSearchFileGroup[],
  id: SearchResultId | null
) {
  if (!id) return firstSelectableSearchResultId(groups)

  const visibleItems = searchResultItems(groups)
  if (searchResultItemById(visibleItems, id)) return id

  const hiddenItem = searchResultItemById(expandedSearchResultItems(groups), id)
  if (hiddenItem?.type === "match") return hiddenItem.groupId

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

function isSelectableSearchResultItem(item: SearchResultItem) {
  return item.type === "match" || item.type === "name"
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
  return searchResultDomId(
    "match",
    `${path}\0${searchMatchIdentity(match)}\0${duplicateIndex}`
  )
}

function searchResultDomId(prefix: string, value: string) {
  return `search-result-${prefix}-${stableHash(value)}`
}

function searchMatchIdentity(match: WorkspaceSearchMatch) {
  return [
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
}

function stableHash(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(36)
}
