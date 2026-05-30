import { describe, expect, it } from 'bun:test'

import {
  EXCERPT_EDITOR_LINE_HEIGHT,
  FILE_RESULTS_ROW_VERTICAL_PADDING,
  SEARCH_RESULT_FILE_EDITOR_ROW_GAP,
  SEARCH_RESULT_STATIC_EDITOR_LINE_LIMIT,
} from '@/features/search/search-result-editor-constants'
import {
  searchResultFileEditorHeight,
  searchResultFileEditorRowHeight,
  searchResultFileEditorScrollMode,
  searchResultFileEditorStyle,
  searchResultFileEditorVisibleLineCount,
} from '@/features/search/search-result-editor-utils'
import type {
  SearchResultFileBlock,
  SearchResultFileDocument,
} from '@/features/search/search-result-view-model'

describe('search result editor utils', () => {
  it('uses static editor mode for normal file result groups', () => {
    expect(searchResultFileEditorScrollMode(SEARCH_RESULT_STATIC_EDITOR_LINE_LIMIT)).toBe('static')
  })

  it('uses capped virtualized editor mode for long file result groups', () => {
    const cappedHeight = editorHeightForLineCount(SEARCH_RESULT_STATIC_EDITOR_LINE_LIMIT)
    const longLineCount = SEARCH_RESULT_STATIC_EDITOR_LINE_LIMIT + 1

    expect(searchResultFileEditorScrollMode(longLineCount)).toBe('virtualized')
    expect(searchResultFileEditorVisibleLineCount(longLineCount)).toBe(
      SEARCH_RESULT_STATIC_EDITOR_LINE_LIMIT,
    )
    expect(searchResultFileEditorHeight(longLineCount)).toBe(cappedHeight)
    expect(searchResultFileEditorRowHeight(fileWithExcerptCount(longLineCount))).toBe(
      cappedHeight + FILE_RESULTS_ROW_VERTICAL_PADDING,
    )
  })

  it('keeps normal row estimates aligned with rendered editor height', () => {
    const document = documentWithLineCount(3)
    const file = fileWithExcerptCount(3)
    const style = searchResultFileEditorStyle(document)

    expect(style.height).toBe(editorHeightForLineCount(3))
    expect(searchResultFileEditorRowHeight(file)).toBe(
      Number(style.height) + FILE_RESULTS_ROW_VERTICAL_PADDING,
    )
  })
})

function editorHeightForLineCount(lineCount: number) {
  const rowGaps = Math.max(0, lineCount - 1) * SEARCH_RESULT_FILE_EDITOR_ROW_GAP

  return lineCount * EXCERPT_EDITOR_LINE_HEIGHT + rowGaps
}

function fileWithExcerptCount(lineCount: number): SearchResultFileBlock {
  return {
    collapsed: false,
    excerpts: Array.from({ length: lineCount }, (_, index) => ({ id: `line:${index}` })),
    id: 'file:test',
    languageId: null,
    matchCount: lineCount,
    path: 'test.ts',
    pathLabel: 'test.ts',
    pending: false,
  } as SearchResultFileBlock
}

function documentWithLineCount(lineCount: number): SearchResultFileDocument {
  return {
    languageId: null,
    lines: Array.from({ length: lineCount }, (_, index) => ({ id: `line:${index}` })),
    path: 'test.ts',
    text: '',
  } as SearchResultFileDocument
}
