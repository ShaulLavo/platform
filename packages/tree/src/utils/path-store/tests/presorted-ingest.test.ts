import { describe, expect, it } from 'vitest'

import { PathStore } from '../store'

const PRESORTED_CASES = [
  {
    canonicalPaths: ['/home/user/photos/raw/'],
    name: 'an explicit directory followed by its descendant',
    paths: ['/home/user/photos/', '/home/user/photos/raw/'],
  },
  {
    canonicalPaths: ['src/lib/utils/index.ts'],
    name: 'a nested explicit-directory chain',
    paths: ['src/', 'src/lib/', 'src/lib/utils/', 'src/lib/utils/index.ts'],
  },
  {
    canonicalPaths: ['src/a/file.ts', 'src/b/file.ts'],
    name: 'sibling directories after an explicit directory',
    paths: ['src/', 'src/a/', 'src/a/file.ts', 'src/b/', 'src/b/file.ts'],
  },
] as const

describe('presorted path ingestion', () => {
  for (const testCase of PRESORTED_CASES) {
    it(`preserves ${testCase.name} without phantom self-nesting`, () => {
      const store = new PathStore({
        initialExpansion: 'open',
        preparedInput: PathStore.preparePresortedInput(testCase.paths),
      })

      const canonicalPaths = store.list()

      expect(canonicalPaths).toEqual(testCase.canonicalPaths)
      expect(new Set(canonicalPaths).size).toBe(testCase.canonicalPaths.length)
      expect(canonicalPaths.some(hasRepeatedAdjacentSegment)).toBe(false)
    })
  }
})

function hasRepeatedAdjacentSegment(path: string): boolean {
  const segments = path.split('/').filter(Boolean)
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index] === segments[index - 1]) return true
  }

  return false
}
