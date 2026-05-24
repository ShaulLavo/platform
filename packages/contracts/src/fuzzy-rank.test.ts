import { describe, expect, it } from 'bun:test'

import { compareFuzzyRankedTargets, fuzzyRankScore } from './fuzzy-rank'

describe('fuzzy ranking', () => {
  it('prefers exact and prefix filename matches over looser matches', () => {
    const query = 'search'
    const paths = ['src/workspace-search.ts', 'src/search-result.ts', 'src/search.ts']

    const ranked = paths.toSorted((left, right) =>
      compareFuzzyRankedTargets(rankTarget(left), rankTarget(right), query),
    )

    expect(ranked).toEqual(['src/search.ts', 'src/search-result.ts', 'src/workspace-search.ts'])
  })

  it('prefers filename matches over path-only matches', () => {
    const filenameScore = fuzzyRankScore(rankTarget('src/search.ts'), 'search')
    const pathScore = fuzzyRankScore(rankTarget('search/index.ts'), 'search')

    expect(filenameScore).toBeGreaterThan(pathScore)
  })

  it('uses path ordering as a stable final tie-breaker', () => {
    const query = 'search'
    const ranked = ['b/search.ts', 'a/search.ts'].toSorted((left, right) =>
      compareFuzzyRankedTargets(rankTarget(left), rankTarget(right), query),
    )

    expect(ranked).toEqual(['a/search.ts', 'b/search.ts'])
  })
})

function rankTarget(path: string) {
  return {
    label: path.split('/').at(-1) ?? path,
    path,
  }
}
