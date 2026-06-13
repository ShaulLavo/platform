import type { EditorScrollMode } from '@singapor/core'
import type { CSSProperties } from 'react'

import {
  type SearchResultFileBlock,
  type SearchResultFileDocument,
  type SearchResultFileDocumentLine,
} from '@/features/search/search-result-view-model'
import type {
  SearchResultVirtualListMetrics,
  SearchResultVirtualListViewport,
} from '@/features/search/search-result-virtual-list'

import {
  EXCERPT_EDITOR_LINE_HEIGHT,
  FILE_RESULTS_EDITOR_MIN_HEIGHT,
  FILE_RESULTS_ROW_VERTICAL_PADDING,
  SEARCH_RESULT_FILE_EDITOR_FULL_RENDER_LINE_LIMIT,
  SEARCH_RESULT_FILE_EDITOR_LINE_OVERSCAN,
  SEARCH_RESULT_FILE_EDITOR_ROW_GAP,
  SEARCH_RESULT_STATIC_EDITOR_LINE_LIMIT,
  SEARCH_RESULT_VIRTUAL_BASE_MIN_OVERSCAN,
  SEARCH_RESULT_VIRTUAL_BASE_OVERSCAN_RATIO,
  SEARCH_RESULT_VIRTUAL_FAST_MIN_OVERSCAN,
  SEARCH_RESULT_VIRTUAL_FAST_OVERSCAN_RATIO,
  SEARCH_RESULT_VIRTUAL_FAST_SCROLL_PX_PER_MS,
  SEARCH_RESULT_VIRTUAL_FLING_MIN_OVERSCAN,
  SEARCH_RESULT_VIRTUAL_FLING_OVERSCAN_RATIO,
  SEARCH_RESULT_VIRTUAL_FLING_SCROLL_PX_PER_MS,
  SEARCH_RESULT_VIRTUAL_ROW_OFFSET,
} from '@/features/search/search-result-editor-constants'
import type { SearchResultVirtualOverscanLevel } from '@/features/search/search-result-editor-types'

export const SEARCH_RESULT_FILE_DOCUMENT_ID_PREFIX = 'search-result-file:'

export function searchResultVirtualOverscan(
  viewportHeight: number,
  level: SearchResultVirtualOverscanLevel,
) {
  const height = Math.max(0, viewportHeight)
  if (level === 2) {
    return Math.max(
      SEARCH_RESULT_VIRTUAL_FLING_MIN_OVERSCAN,
      Math.floor(height * SEARCH_RESULT_VIRTUAL_FLING_OVERSCAN_RATIO),
    )
  }
  if (level === 1) {
    return Math.max(
      SEARCH_RESULT_VIRTUAL_FAST_MIN_OVERSCAN,
      Math.floor(height * SEARCH_RESULT_VIRTUAL_FAST_OVERSCAN_RATIO),
    )
  }

  return Math.max(
    SEARCH_RESULT_VIRTUAL_BASE_MIN_OVERSCAN,
    Math.floor(height * SEARCH_RESULT_VIRTUAL_BASE_OVERSCAN_RATIO),
  )
}

export function searchResultVirtualOverscanLevel(
  velocityPxPerMs: number,
): SearchResultVirtualOverscanLevel {
  if (velocityPxPerMs >= SEARCH_RESULT_VIRTUAL_FLING_SCROLL_PX_PER_MS) return 2
  if (velocityPxPerMs >= SEARCH_RESULT_VIRTUAL_FAST_SCROLL_PX_PER_MS) return 1

  return 0
}

export function searchResultFileEditorRenderViewport(
  viewport: SearchResultVirtualListViewport,
): SearchResultVirtualListViewport {
  const rowStride = EXCERPT_EDITOR_LINE_HEIGHT + SEARCH_RESULT_FILE_EDITOR_ROW_GAP

  return {
    height: viewport.height,
    top: Math.floor(viewport.top / rowStride) * rowStride,
  }
}

export function searchResultFileDocumentRevision(
  document: SearchResultFileDocument,
  window: SearchResultFileEditorLineWindow,
) {
  return `${window.start}:${window.end}:${document.text}`
}

export function searchResultFileEditorStyle(document: SearchResultFileDocument): CSSProperties {
  return {
    height: searchResultFileEditorHeight(document.lines.length),
  }
}

export function searchResultFileEditorScrollMode(lineCount: number): EditorScrollMode {
  if (lineCount > SEARCH_RESULT_STATIC_EDITOR_LINE_LIMIT) return 'virtualized'

  return 'static'
}

export function searchResultFileEditorVisibleLineCount(lineCount: number) {
  return Math.max(0, Math.min(lineCount, SEARCH_RESULT_STATIC_EDITOR_LINE_LIMIT))
}

export function searchResultFileDocumentVisibleLines(document: SearchResultFileDocument) {
  return document.lines.slice(0, searchResultFileEditorVisibleLineCount(document.lines.length))
}

export type SearchResultFileEditorLineWindow = {
  readonly end: number
  readonly offsetY: number
  readonly start: number
}

export function searchResultFileEditorLineWindow({
  lineCount,
  virtualItem,
  viewport,
}: {
  lineCount: number
  virtualItem: SearchResultVirtualListMetrics['items'][number]
  viewport: SearchResultVirtualListViewport
}): SearchResultFileEditorLineWindow {
  const visibleLineCount = searchResultFileEditorVisibleLineCount(lineCount)
  if (visibleLineCount === 0) return { end: 0, offsetY: 0, start: 0 }
  if (visibleLineCount <= SEARCH_RESULT_FILE_EDITOR_FULL_RENDER_LINE_LIMIT) {
    return { end: visibleLineCount, offsetY: 0, start: 0 }
  }

  const rowStride = EXCERPT_EDITOR_LINE_HEIGHT + SEARCH_RESULT_FILE_EDITOR_ROW_GAP
  const contentTop =
    virtualItem.start + SEARCH_RESULT_VIRTUAL_ROW_OFFSET + FILE_RESULTS_ROW_VERTICAL_PADDING / 2
  const startY = viewport.top - contentTop - SEARCH_RESULT_FILE_EDITOR_LINE_OVERSCAN
  const endY = viewport.top + viewport.height - contentTop + SEARCH_RESULT_FILE_EDITOR_LINE_OVERSCAN
  const start = Math.max(0, Math.floor(startY / rowStride))
  const end = Math.min(visibleLineCount, Math.ceil(endY / rowStride))
  if (end <= start) return { end: 0, offsetY: 0, start: 0 }

  return {
    end,
    offsetY: start * rowStride,
    start,
  }
}

export function searchResultFileDocumentWindow(
  document: SearchResultFileDocument,
  window: SearchResultFileEditorLineWindow,
): SearchResultFileDocument {
  if (window.start === 0 && window.end === document.lines.length) return document

  return buildSearchResultFileDocumentWindow(document, window)
}

function buildSearchResultFileDocumentWindow(
  document: SearchResultFileDocument,
  window: SearchResultFileEditorLineWindow,
): SearchResultFileDocument {
  const lines: SearchResultFileDocumentLine[] = []
  let text = ''

  for (const sourceLine of document.lines.slice(window.start, window.end)) {
    const lineText = document.text.slice(sourceLine.start, sourceLine.end)
    const start = text ? text.length + 1 : 0
    const offset = start - sourceLine.start
    lines.push({
      ...sourceLine,
      end: start + lineText.length,
      matchRanges: sourceLine.matchRanges.map((range) => ({
        end: range.end + offset,
        start: range.start + offset,
      })),
      row: lines.length,
      start,
    })
    text = text ? `${text}\n${lineText}` : lineText
  }

  return {
    languageId: document.languageId,
    lines,
    path: document.path,
    text,
  }
}

export function searchResultFileEditorRowHeight(file: SearchResultFileBlock) {
  return searchResultFileEditorHeight(file.excerpts.length) + FILE_RESULTS_ROW_VERTICAL_PADDING
}

export function searchResultFileEditorHeight(lineCount: number) {
  const visibleLineCount = searchResultFileEditorVisibleLineCount(lineCount)
  const rowGaps = Math.max(0, visibleLineCount - 1) * SEARCH_RESULT_FILE_EDITOR_ROW_GAP

  return Math.max(
    FILE_RESULTS_EDITOR_MIN_HEIGHT,
    visibleLineCount * EXCERPT_EDITOR_LINE_HEIGHT + rowGaps,
  )
}
