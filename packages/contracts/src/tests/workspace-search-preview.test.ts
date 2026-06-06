import { describe, expect, it } from 'vitest'

import { workspaceSearchPreview } from '../workspace-search-preview'

describe('workspace search preview', () => {
  it('keeps long previews anchored around the match', () => {
    const line = `${'x '.repeat(55)}needle ${'y '.repeat(55)}`

    expect(workspaceSearchPreview(line, 110, 116, { contextChars: 10, maxChars: 30 })).toEqual({
      startColumn: 100,
      text: line.slice(100, 130),
    })
  })

  it('does not start or end previews inside identifiers', () => {
    const line = `start ${'a'.repeat(20)} needle ${'b'.repeat(20)} end`

    expect(
      workspaceSearchPreview(line, 27, 33, {
        contextChars: 10,
        maxChars: 24,
      }),
    ).toEqual({
      startColumn: 6,
      text: `${'a'.repeat(20)} needle`,
    })
  })

  it('keeps the match visible when expanding the start to an identifier boundary', () => {
    const line = `${'a'.repeat(120)} needle`

    expect(
      workspaceSearchPreview(line, 121, 127, {
        contextChars: 10,
        maxChars: 24,
      }),
    ).toEqual({
      startColumn: 0,
      text: `${'a'.repeat(120)} needle`,
    })
  })

  it('expands the end to an identifier boundary after the match', () => {
    const line = `needle ${'b'.repeat(20)} end`

    expect(workspaceSearchPreview(line, 0, 6, { contextChars: 0, maxChars: 16 })).toEqual({
      startColumn: 0,
      text: `needle ${'b'.repeat(20)}`,
    })
  })
})
