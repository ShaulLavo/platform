import { describe, expect, it } from 'bun:test'
import type { WorkspaceSearchMatch } from '@workspace/contracts'

import type { WorkspaceSearchFileGroup } from './search-buffer-state'
import { expandedSearchResultItems, searchResultItems } from './search-result-items'
import {
  firstSearchResultExcerptId,
  firstSearchResultVirtualRowId,
  lastSearchResultVirtualRowId,
  parentSearchResultFileId,
  searchResultExcerptById,
  searchResultFileDocument,
  searchResultFileDocumentLineAtRow,
  searchResultFileDocumentLineById,
  searchResultFileBlocks,
  searchResultOpenTargetForId,
  searchResultVirtualRowById,
  searchResultVirtualRowContainsId,
  searchResultVirtualRowId,
  searchResultVirtualRowIdByOffset,
  searchResultVirtualRows,
} from './search-result-view-model'

describe('search result view model', () => {
  it('builds file blocks and excerpts with stable result ids', () => {
    const firstMatch = contentMatch({
      column: 14,
      endColumn: 20,
      line: 12,
      preview: 'export const needle = true',
    })
    const secondMatch = contentMatch({
      column: 10,
      endColumn: 16,
      line: 128,
      preview: 'return needle',
    })
    const group = fileGroup([firstMatch, secondMatch])
    const items = expandedSearchResultItems([group])
    const groupItem = items.find((item) => item.type === 'group')
    const matchItems = items.filter((item) => item.type === 'match')
    const blocks = searchResultFileBlocks([group], 'needle')

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual(
      expect.objectContaining({
        collapsed: false,
        id: groupItem?.id,
        languageId: 'typescript',
        matchCount: 2,
        path: '/repo/src/app.ts',
        pathLabel: 'src/app.ts',
      }),
    )
    expect(blocks[0]?.excerpts.map((excerpt) => excerpt.id)).toEqual(
      matchItems.map((item) => item.id),
    )
  })

  it('builds excerpts from current previews with match ranges and source mappings', () => {
    const match = contentMatch({
      column: 14,
      endColumn: 20,
      line: 12,
      preview: 'export const needle = true',
    })
    const blocks = searchResultFileBlocks([fileGroup([match])], 'needle')
    const excerpt = blocks[0]?.excerpts[0]

    expect(excerpt).toEqual(
      expect.objectContaining({
        languageId: 'typescript',
        path: match.path,
        sourceMatch: match,
        startLine: 12,
        text: 'export const needle = true',
      }),
    )
    expect(excerpt?.matchRanges).toEqual([{ end: 19, start: 13 }])
    expect(
      excerpt
        ? excerpt.text.slice(excerpt.matchRanges[0]?.start, excerpt.matchRanges[0]?.end)
        : null,
    ).toBe('needle')
  })

  it('flows pending result state into file blocks, excerpts, and document lines', () => {
    const match = contentMatch({
      column: 14,
      endColumn: 20,
      line: 12,
      preview: 'export const needle = true',
    })
    const group = fileGroup([match])
    const matchId = expandedSearchResultItems([group]).find((item) => item.type === 'match')?.id
    const blocks = searchResultFileBlocks([group], 'needle', {
      pendingResultIds: matchId ? [matchId] : [],
    })
    const document = blocks[0] ? searchResultFileDocument(blocks[0]) : null

    expect(blocks[0]?.pending).toBe(true)
    expect(blocks[0]?.excerpts[0]?.pending).toBe(true)
    expect(document?.lines[0]?.pending).toBe(true)
  })

  it('keeps row and excerpt ids stable when the query changes at the same location', () => {
    const firstMatch = contentMatch({
      column: 1,
      endColumn: 2,
      line: 12,
      preview: 'const value = true',
    })
    const nextMatch = contentMatch({
      column: 1,
      endColumn: 3,
      line: 12,
      preview: 'const value = true',
    })
    const firstGroup = fileGroup([firstMatch])
    const nextGroup = fileGroup([nextMatch])
    const firstItems = searchResultItems([firstGroup])
    const nextItems = searchResultItems([nextGroup])
    const firstBlocks = searchResultFileBlocks([firstGroup], 'c')
    const nextBlocks = searchResultFileBlocks([nextGroup], 'co')

    expect(nextItems.map((item) => item.id)).toEqual(firstItems.map((item) => item.id))
    expect(nextBlocks[0]?.id).toBe(firstBlocks[0]?.id)
    expect(nextBlocks[0]?.excerpts[0]?.id).toBe(firstBlocks[0]?.excerpts[0]?.id)
    expect(nextBlocks[0]?.excerpts[0]?.matchRanges).toEqual([{ end: 2, start: 0 }])
  })

  it('keeps terminal preview line endings out of excerpt editor text', () => {
    const match = contentMatch({
      column: 14,
      endColumn: 20,
      line: 12,
      preview: 'export const needle = true\n',
    })
    const blocks = searchResultFileBlocks([fileGroup([match])], 'needle')
    const excerpt = blocks[0]?.excerpts[0]

    expect(excerpt?.text).toBe('export const needle = true')
    expect(excerpt?.matchRanges).toEqual([{ end: 19, start: 13 }])
  })

  it('trims leading spaces and tabs from excerpt editor text', () => {
    const match = contentMatch({
      column: 11,
      endColumn: 17,
      line: 12,
      preview: '\t  export needle',
    })
    const blocks = searchResultFileBlocks([fileGroup([match])], 'needle')
    const excerpt = blocks[0]?.excerpts[0]

    expect(excerpt?.text).toBe('export needle')
    expect(excerpt?.matchRanges).toEqual([{ end: 13, start: 7 }])
    expect(
      excerpt
        ? excerpt.text.slice(excerpt.matchRanges[0]?.start, excerpt.matchRanges[0]?.end)
        : null,
    ).toBe('needle')
  })

  it('keeps the raw search preview text for excerpt editor syntax', () => {
    const preview = `${'x'.repeat(80)}createNeedle${'y'.repeat(120)}`
    const match = contentMatch({
      column: 81,
      endColumn: 93,
      line: 12,
      preview,
    })
    const blocks = searchResultFileBlocks([fileGroup([match])], 'create')
    const excerpt = blocks[0]?.excerpts[0]

    expect(excerpt?.text).toBe(preview)
    expect(excerpt?.matchRanges).toEqual([{ end: 92, start: 80 }])
  })

  it('keeps collapsed group excerpts out of the virtual row model', () => {
    const firstMatch = contentMatch({
      column: 1,
      endColumn: 7,
      line: 4,
      preview: 'needle',
    })
    const secondMatch = contentMatch({
      column: 8,
      endColumn: 14,
      line: 5,
      preview: 'const needle = true',
    })
    const blocks = searchResultFileBlocks(
      [{ ...fileGroup([firstMatch, secondMatch]), collapsed: true }],
      'needle',
    )
    const rows = searchResultVirtualRows(blocks)

    expect(blocks[0]?.collapsed).toBe(true)
    expect(blocks[0]?.excerpts).toHaveLength(2)
    expect(rows).toEqual([{ file: blocks[0], type: 'file' }])
  })

  it('reuses unchanged file blocks across adjacent collapse updates', () => {
    const firstGroup = fileGroup([
      contentMatch({
        column: 1,
        endColumn: 7,
        line: 4,
        preview: 'needle',
      }),
    ])
    const secondGroup = fileGroup(
      [
        contentMatch({
          column: 8,
          endColumn: 14,
          line: 5,
          path: '/repo/src/other.ts',
          preview: 'const needle = true',
        }),
      ],
      'src/other.ts',
    )
    const firstBlocks = searchResultFileBlocks([firstGroup, secondGroup], 'needle')
    const nextBlocks = searchResultFileBlocks(
      [{ ...firstGroup, collapsed: true }, secondGroup],
      'needle',
    )

    expect(nextBlocks[0]).not.toBe(firstBlocks[0])
    expect(nextBlocks[0]?.collapsed).toBe(true)
    expect(nextBlocks[1]).toBe(firstBlocks[1])
  })

  it('maps virtual rows to expanded file headers and one file results row', () => {
    const match = contentMatch({
      column: 1,
      endColumn: 7,
      line: 4,
      preview: 'needle',
    })
    const blocks = searchResultFileBlocks([fileGroup([match])], 'needle')
    const rows = searchResultVirtualRows(blocks)

    expect(rows.map((row) => row.type)).toEqual(['file', 'file-results'])
    expect(rows[0]).toEqual({ file: blocks[0], type: 'file' })
    expect(rows[1]).toEqual({ file: blocks[0], type: 'file-results' })
  })

  it('navigates virtual rows by file and excerpt ids', () => {
    const firstMatch = contentMatch({
      column: 1,
      endColumn: 7,
      line: 4,
      preview: 'needle',
    })
    const secondMatch = contentMatch({
      column: 8,
      endColumn: 14,
      line: 5,
      preview: 'const needle = true',
    })
    const blocks = searchResultFileBlocks([fileGroup([firstMatch, secondMatch])], 'needle')
    const rows = searchResultVirtualRows(blocks)
    const fileId = blocks[0]?.id ?? null
    const firstExcerptId = blocks[0]?.excerpts[0]?.id ?? null
    const secondExcerptId = blocks[0]?.excerpts[1]?.id ?? null

    expect(rows.map(searchResultVirtualRowId)).toEqual([fileId, `${fileId}-results`])
    expect(firstSearchResultVirtualRowId(rows)).toBe(fileId)
    expect(lastSearchResultVirtualRowId(rows)).toBe(secondExcerptId)
    expect(firstSearchResultExcerptId(rows, fileId ?? '')).toBe(firstExcerptId)
    expect(parentSearchResultFileId(rows, firstExcerptId)).toBe(fileId)
    const resultRow = searchResultVirtualRowById(rows, secondExcerptId)
    expect(resultRow?.type).toBe('file-results')
    expect(resultRow ? searchResultVirtualRowContainsId(resultRow, secondExcerptId) : false).toBe(
      true,
    )
    expect(
      searchResultVirtualRowIdByOffset({
        activeResultId: fileId,
        offset: 1,
        rows,
      }),
    ).toBe(firstExcerptId)
    expect(
      searchResultVirtualRowIdByOffset({
        activeResultId: firstExcerptId,
        offset: -1,
        rows,
      }),
    ).toBe(fileId)
  })

  it('builds one editor document per file from result lines', () => {
    const firstMatch = contentMatch({
      column: 14,
      endColumn: 20,
      line: 12,
      preview: 'export const needle = true',
    })
    const secondMatch = contentMatch({
      column: 10,
      endColumn: 16,
      line: 128,
      preview: 'return needle',
    })
    const block = searchResultFileBlocks([fileGroup([firstMatch, secondMatch])], 'needle')[0]
    const document = block ? searchResultFileDocument(block) : null
    const firstLine = document ? searchResultFileDocumentLineAtRow(document, 0) : null
    const secondLine = document
      ? searchResultFileDocumentLineById(document, block?.excerpts[1]?.id ?? null)
      : null

    expect(document?.text).toBe('export const needle = true\nreturn needle')
    expect(firstLine).toEqual(
      expect.objectContaining({
        id: block?.excerpts[0]?.id,
        row: 0,
        sourceLine: 12,
        start: 0,
      }),
    )
    expect(firstLine?.matchRanges).toEqual([{ end: 19, start: 13 }])
    expect(secondLine).toEqual(
      expect.objectContaining({
        id: block?.excerpts[1]?.id,
        row: 1,
        sourceLine: 128,
        start: 'export const needle = true\n'.length,
      }),
    )
    expect(secondLine?.matchRanges).toEqual([{ end: 40, start: 36 }])
  })

  it('maps file and excerpt ids back to open targets', () => {
    const match = contentMatch({
      column: 1,
      endColumn: 7,
      line: 4,
      preview: 'needle',
    })
    const blocks = searchResultFileBlocks([fileGroup([match])], 'needle')
    const block = blocks[0]
    const excerpt = block?.excerpts[0]

    expect(searchResultOpenTargetForId(blocks, block?.id ?? null)).toEqual({
      match: null,
      path: match.path,
    })
    expect(searchResultOpenTargetForId(blocks, excerpt?.id ?? null)).toEqual({
      match,
      path: match.path,
    })
    expect(searchResultExcerptById(blocks, excerpt?.id ?? null)).toBe(excerpt)
  })

  it('represents filename-only results as selectable file rows', () => {
    const match: WorkspaceSearchMatch = {
      kind: 'name',
      path: '/repo/src/needle.ts',
      source: 'disk',
      targetType: 'file',
      type: 'file',
    }
    const group: WorkspaceSearchFileGroup = {
      collapsed: false,
      count: 0,
      matches: [match],
      name: 'needle.ts',
      path: match.path,
      pathLabel: 'src/needle.ts',
    }
    const item = searchResultItems([group])[0]
    const blocks = searchResultFileBlocks([group], 'needle')
    const rows = searchResultVirtualRows(blocks)

    expect(blocks).toEqual([
      expect.objectContaining({
        excerpts: [],
        id: item?.id,
        matchCount: 1,
        path: match.path,
        pathLabel: 'src/needle.ts',
      }),
    ])
    expect(rows).toEqual([{ file: blocks[0], type: 'file' }])
    expect(searchResultOpenTargetForId(blocks, item?.id ?? null)).toEqual({
      match: null,
      path: match.path,
    })
  })
})

function contentMatch(
  patch: Pick<WorkspaceSearchMatch, 'column' | 'endColumn' | 'line' | 'preview'> &
    Partial<Pick<WorkspaceSearchMatch, 'path' | 'previewStartColumn'>>,
): WorkspaceSearchMatch {
  return {
    kind: 'content',
    path: '/repo/src/app.ts',
    source: 'disk',
    type: 'file',
    ...patch,
  }
}

function fileGroup(
  matches: WorkspaceSearchMatch[],
  pathLabel = 'src/app.ts',
): WorkspaceSearchFileGroup {
  const path = matches[0]?.path ?? '/repo/src/app.ts'

  return {
    collapsed: false,
    count: matches.length,
    matches,
    name: path.split('/').at(-1) ?? 'app.ts',
    path,
    pathLabel,
  }
}
