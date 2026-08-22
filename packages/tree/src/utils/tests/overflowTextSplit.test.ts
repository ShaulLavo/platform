import { describe, expect, it } from 'vitest'

import { splitCenter, splitExtension } from '@workspace/tree/components/OverflowText'

const SPACED_FALLBACK_NAMES = [
  'Hello world',
  'my file',
  'Hello world wide web',
  'a  double space',
] as const

describe('overflow text splitting', () => {
  it.each(SPACED_FALLBACK_NAMES)(
    'keeps whitespace away from the splitCenter seam for %s',
    (contents) => {
      const result = splitCenter(contents)

      expect(result.join('')).toBe(contents)
      expect(boundaryIsWhitespaceFree(result)).toBe(true)
    },
  )

  it.each(SPACED_FALLBACK_NAMES)(
    'keeps whitespace away from the splitExtension fallback seam for %s',
    (contents) => {
      const result = splitExtension(contents)

      expect(result.join('')).toBe(contents)
      expect(boundaryIsWhitespaceFree(result)).toBe(true)
    },
  )

  it('keeps leading and trailing whitespace inside a segment', () => {
    expect(splitCenter(' abc')).toEqual([' a', 'bc'])
    expect(splitCenter('abc ')).toEqual(['ab', 'c '])
  })

  it('preserves extension splitting for spaced and multi-dot names', () => {
    expect(splitExtension('my file.txt')).toEqual(['my file.', 'txt'])
    expect(splitExtension('archive.tar.gz')).toEqual(['archive.tar.', 'gz'])
  })

  it('round-trips all-whitespace input when no clean boundary exists', () => {
    const result = splitCenter('    ')

    expect(result.join('')).toBe('    ')
    expect(result).toEqual(['  ', '  '])
  })
})

function boundaryIsWhitespaceFree([first, second]: [string, string]): boolean {
  return !isWhitespace(first.at(-1)) && !isWhitespace(second[0])
}

function isWhitespace(character: string | undefined): boolean {
  return character != null && /\s/.test(character)
}
