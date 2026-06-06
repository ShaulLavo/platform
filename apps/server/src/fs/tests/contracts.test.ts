import { describe, expect, it } from 'vitest'
import * as v from 'valibot'

import {
  booleanQueryValueSchema,
  searchQuerySchema,
  treeEntrySchema,
  treeQuerySchema,
  workspaceSearchEventSchema,
  workspaceSearchMatchSchema,
} from '../contracts'

describe('filesystem contracts', () => {
  it('parses query booleans and clamps bounded integer query values', () => {
    expect(v.parse(booleanQueryValueSchema, 'true')).toBe(true)
    expect(v.parse(booleanQueryValueSchema, '0')).toBe(false)
    expect(v.parse(treeQuerySchema, { depth: '99', path: 'src' })).toEqual({
      depth: 10,
      path: 'src',
    })
  })

  it('parses search queries with defaults', () => {
    expect(v.parse(searchQuerySchema, { query: 'button' })).toEqual({
      caseSensitive: false,
      includeContent: false,
      includeNames: true,
      limit: 50,
      matchMode: 'literal',
      path: '',
      query: 'button',
      wholeWord: false,
    })
  })

  it('preserves whitespace in search query text', () => {
    expect(v.parse(searchQuerySchema, { query: '  ' })).toMatchObject({
      query: '  ',
    })
  })

  it('parses search mode and glob query values', () => {
    expect(
      v.parse(searchQuerySchema, {
        caseSensitive: '1',
        excludeGlobs: '*.test.ts',
        includeGlobs: ['src/**/*.ts', 'tests/{unit,integration}/**/*.ts'],
        matchMode: 'regex',
        query: 'button',
        wholeWord: 'true',
      }),
    ).toMatchObject({
      caseSensitive: true,
      excludeGlobs: ['*.test.ts'],
      includeGlobs: ['src/**/*.ts', 'tests/{unit,integration}/**/*.ts'],
      matchMode: 'regex',
      wholeWord: true,
    })
  })

  it('validates shared tree entry shape', () => {
    expect(
      v.parse(treeEntrySchema, {
        birthtimeMs: 1,
        mtimeMs: 2,
        name: 'index.ts',
        path: 'src/index.ts',
        size: 42,
        targetType: 'file',
        type: 'file',
        version: 'stat:2:42',
      }),
    ).toEqual({
      birthtimeMs: 1,
      mtimeMs: 2,
      name: 'index.ts',
      path: 'src/index.ts',
      size: 42,
      targetType: 'file',
      type: 'file',
      version: 'stat:2:42',
    })
  })

  it('validates shared workspace search event shapes', () => {
    const match = {
      column: 7,
      endColumn: 13,
      kind: 'content',
      line: 3,
      path: 'src/app.ts',
      preview: 'const result = search()',
      source: 'disk',
      type: 'file',
    } as const

    expect(v.parse(workspaceSearchMatchSchema, match)).toEqual(match)
    expect(
      v.parse(workspaceSearchEventSchema, {
        match,
        type: 'match',
      }),
    ).toEqual({
      match,
      type: 'match',
    })
  })
})
