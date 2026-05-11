import type { WorkspaceSearchMatch } from "@workspace/contracts"

import type { WorkspaceSearchFileGroup } from "@/features/search/search-buffer-state"

export type SearchResultItem =
  | {
      group: WorkspaceSearchFileGroup
      type: "group"
    }
  | {
      group: WorkspaceSearchFileGroup
      match: WorkspaceSearchMatch
      type: "name"
    }
  | {
      groupPath: string
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
  const contentMatches = group.matches.filter(
    (match) => match.kind === "content"
  )
  if (contentMatches.length === 0) {
    const match = group.matches[0]
    if (match) items.push({ group, match, type: "name" })
    return
  }

  items.push({ group: contentGroup(group, contentMatches), type: "group" })
  if (group.collapsed) return

  contentMatches.forEach((match, matchIndex) => {
    items.push({
      groupPath: group.path,
      match,
      matchIndex,
      type: "match",
    })
  })
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
