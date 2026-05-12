import type { EditorSyntaxLanguageId } from "@editor/core"
import type { WorkspaceSearchMatch } from "@workspace/contracts"

import { languageIdForFilePath } from "@/features/editor/utils/file-path"
import type { WorkspaceSearchFileGroup } from "@/features/search/search-buffer-state"
import { searchMatchDisplay } from "@/features/search/search-match-display"
import {
  expandedSearchResultItems,
  type SearchResultId,
  type SearchResultItem,
} from "@/features/search/search-result-items"

const SEARCH_RESULT_EXCERPT_MAX_LENGTH = 160

export type SearchResultRange = {
  readonly end: number
  readonly start: number
}

export type SearchResultFileBlock = {
  readonly collapsed: boolean
  readonly excerpts: readonly SearchResultExcerpt[]
  readonly id: SearchResultId
  readonly languageId: EditorSyntaxLanguageId | null
  readonly matchCount: number
  readonly path: string
  readonly pathLabel: string
}

export type SearchResultExcerpt = {
  readonly id: SearchResultId
  readonly languageId: EditorSyntaxLanguageId | null
  readonly matchRanges: readonly SearchResultRange[]
  readonly path: string
  readonly sourceMatch: WorkspaceSearchMatch
  readonly startLine: number
  readonly text: string
}

export type SearchResultVirtualRow =
  | {
      readonly file: SearchResultFileBlock
      readonly type: "file"
    }
  | {
      readonly excerpt: SearchResultExcerpt
      readonly fileId: SearchResultId
      readonly type: "excerpt"
    }

export type SearchResultOpenTarget = {
  readonly match: WorkspaceSearchMatch | null
  readonly path: string
}

export function searchResultFileBlocks(
  groups: readonly WorkspaceSearchFileGroup[],
  query: string
) {
  const blocks: SearchResultFileBlock[] = []
  for (const group of groups) {
    const block = searchResultFileBlock(group, query)
    if (!block) continue
    blocks.push(block)
  }

  return blocks
}

export function searchResultVirtualRows(
  blocks: readonly SearchResultFileBlock[]
) {
  const rows: SearchResultVirtualRow[] = []
  for (const block of blocks) {
    rows.push({ file: block, type: "file" })
    if (block.collapsed) continue

    for (const excerpt of block.excerpts) {
      rows.push({ excerpt, fileId: block.id, type: "excerpt" })
    }
  }

  return rows
}

export function searchResultVirtualRowId(row: SearchResultVirtualRow) {
  if (row.type === "file") return row.file.id

  return row.excerpt.id
}

export function searchResultVirtualRowById(
  rows: readonly SearchResultVirtualRow[],
  id: SearchResultId | null
) {
  if (!id) return null

  return rows.find((row) => searchResultVirtualRowId(row) === id) ?? null
}

export function searchResultVirtualRowIdByOffset({
  activeResultId,
  offset,
  rows,
}: {
  activeResultId: SearchResultId | null
  offset: number
  rows: readonly SearchResultVirtualRow[]
}) {
  if (rows.length === 0) return null

  const activeIndex = searchResultVirtualRowIndex(rows, activeResultId)
  const fallback = offset >= 0 ? 0 : rows.length - 1
  if (activeIndex < 0) return searchResultVirtualRowId(rows[fallback]!)

  const nextIndex = clampIndex(activeIndex + offset, rows.length)
  return searchResultVirtualRowId(rows[nextIndex]!)
}

export function firstSearchResultVirtualRowId(
  rows: readonly SearchResultVirtualRow[]
) {
  const row = rows[0]
  if (!row) return null

  return searchResultVirtualRowId(row)
}

export function lastSearchResultVirtualRowId(
  rows: readonly SearchResultVirtualRow[]
) {
  const row = rows.at(-1)
  if (!row) return null

  return searchResultVirtualRowId(row)
}

export function firstSearchResultExcerptId(
  rows: readonly SearchResultVirtualRow[],
  fileId: SearchResultId
) {
  const row = rows.find(
    (candidate) => candidate.type === "excerpt" && candidate.fileId === fileId
  )
  if (row?.type !== "excerpt") return null

  return row.excerpt.id
}

export function parentSearchResultFileId(
  rows: readonly SearchResultVirtualRow[],
  activeResultId: SearchResultId | null
) {
  const row = searchResultVirtualRowById(rows, activeResultId)
  if (row?.type !== "excerpt") return null

  return row.fileId
}

export function searchResultOpenTargetForId(
  blocks: readonly SearchResultFileBlock[],
  id: SearchResultId | null
): SearchResultOpenTarget | null {
  if (!id) return null

  for (const block of blocks) {
    if (block.id === id) return { match: null, path: block.path }

    const excerpt = block.excerpts.find((candidate) => candidate.id === id)
    if (!excerpt) continue

    return { match: excerpt.sourceMatch, path: excerpt.path }
  }

  return null
}

export function searchResultExcerptById(
  blocks: readonly SearchResultFileBlock[],
  id: SearchResultId | null
) {
  if (!id) return null

  for (const block of blocks) {
    const excerpt = block.excerpts.find((candidate) => candidate.id === id)
    if (excerpt) return excerpt
  }

  return null
}

function searchResultFileBlock(
  group: WorkspaceSearchFileGroup,
  query: string
): SearchResultFileBlock | null {
  const items = expandedSearchResultItems([group])
  const matchItems = items.filter(isSearchResultMatchItem)
  if (matchItems.length > 0) {
    return contentSearchResultFileBlock(group, items, matchItems, query)
  }

  const nameItem = items.find(isSearchResultNameItem)
  if (!nameItem) return null

  return nameSearchResultFileBlock(group, nameItem)
}

function contentSearchResultFileBlock(
  group: WorkspaceSearchFileGroup,
  items: readonly SearchResultItem[],
  matchItems: readonly SearchResultMatchItem[],
  query: string
): SearchResultFileBlock | null {
  const groupItem = items.find(isSearchResultGroupItem)
  if (!groupItem) return null

  return {
    collapsed: group.collapsed,
    excerpts: matchItems.map((item) => searchResultExcerpt(item, query)),
    id: groupItem.id,
    languageId: languageIdForFilePath(groupItem.group.path),
    matchCount: matchItems.length,
    path: groupItem.group.path,
    pathLabel: groupItem.group.pathLabel,
  }
}

function nameSearchResultFileBlock(
  group: WorkspaceSearchFileGroup,
  item: SearchResultNameItem
): SearchResultFileBlock {
  return {
    collapsed: false,
    excerpts: [],
    id: item.id,
    languageId: languageIdForFilePath(group.path),
    matchCount: 1,
    path: group.path,
    pathLabel: group.pathLabel,
  }
}

function searchResultExcerpt(
  item: SearchResultMatchItem,
  query: string
): SearchResultExcerpt {
  const display = searchMatchDisplay(item.match, query, {
    maxLength: SEARCH_RESULT_EXCERPT_MAX_LENGTH,
  })

  return {
    id: item.id,
    languageId: languageIdForFilePath(item.match.path),
    matchRanges: display.range ? [display.range] : [],
    path: item.match.path,
    sourceMatch: item.match,
    startLine: searchResultExcerptStartLine(item.match),
    text: display.text,
  }
}

function searchResultExcerptStartLine(match: WorkspaceSearchMatch) {
  if (match.kind !== "content") return 1
  if (match.line === undefined) return 1

  return match.line
}

type SearchResultGroupItem = Extract<SearchResultItem, { type: "group" }>
type SearchResultMatchItem = Extract<SearchResultItem, { type: "match" }>
type SearchResultNameItem = Extract<SearchResultItem, { type: "name" }>

function isSearchResultGroupItem(
  item: SearchResultItem
): item is SearchResultGroupItem {
  return item.type === "group"
}

function isSearchResultMatchItem(
  item: SearchResultItem
): item is SearchResultMatchItem {
  return item.type === "match"
}

function isSearchResultNameItem(
  item: SearchResultItem
): item is SearchResultNameItem {
  return item.type === "name"
}

function searchResultVirtualRowIndex(
  rows: readonly SearchResultVirtualRow[],
  id: SearchResultId | null
) {
  if (!id) return -1

  return rows.findIndex((row) => searchResultVirtualRowId(row) === id)
}

function clampIndex(index: number, length: number) {
  return Math.min(Math.max(index, 0), length - 1)
}
