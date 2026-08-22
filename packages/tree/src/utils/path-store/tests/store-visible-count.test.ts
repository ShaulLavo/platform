import { describe, expect, it } from 'vitest'

import { PathStore } from '../store'

import {
  allDirectories,
  generatePaths,
  makeRng,
  naiveVisiblePaths,
} from '../../../../test/factories/tree-paths'

// The count is what decides which row sits at index N. When it drifts, the file
// tree scrolls to the wrong row — a symptom that costs a hand-driven browser
// session to find and nothing to catch here.
const TREE = [
  'lib/',
  'lib/one.ts',
  'lib/two.ts',
  'src/',
  'src/app.ts',
  'src/nested/',
  'src/nested/deep.ts',
  'src/nested/other.ts',
  'readme.md',
]

describe('visible count', () => {
  it('counts only root entries while every directory is collapsed', () => {
    const store = openStore(TREE, 'closed')

    expect(store.getVisibleCount()).toBe(naiveVisiblePaths(TREE, new Set()).length)
  })

  it('counts the whole tree while every directory is expanded', () => {
    const store = openStore(TREE, 'open')

    expect(store.getVisibleCount()).toBe(naiveVisiblePaths(TREE, allDirectories(TREE)).length)
  })

  it('survives a collapse of an expanded subtree', () => {
    const store = openStore(TREE, 'open')
    store.collapse('src/nested/')

    const expanded = allDirectories(TREE)
    expanded.delete('src/nested/')

    expect(store.getVisibleCount()).toBe(naiveVisiblePaths(TREE, expanded).length)
  })

  it('restores the count when the same subtree is expanded again', () => {
    const store = openStore(TREE, 'open')
    const before = store.getVisibleCount()

    store.collapse('src/')
    store.expand('src/')

    expect(store.getVisibleCount()).toBe(before)
  })

  it('holds across a long expand/collapse sequence on generated trees', () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      const rng = makeRng(seed)
      const paths = generatePaths(rng, { fileCount: 30, maxChildren: 3, maxDepth: 4 })
      const store = openStore(paths, 'closed')
      const directories = paths.filter((path) => path.endsWith('/'))

      toggleRandomly(store, paths, directories, rng, seed)
    }
  })
})

describe('visible index', () => {
  it('maps every visible path to the position the naive walk gives it', () => {
    const store = openStore(TREE, 'open')
    const expected = naiveVisiblePaths(TREE, allDirectories(TREE))

    expect(expected.map((path) => store.getVisibleIndex(path))).toEqual(
      expected.map((_path, index) => index),
    )
  })

  it('expands a hidden directory in place without opening its ancestors', () => {
    // Characterizes a real choice: `expand()` on a directory whose parent is
    // collapsed sets only that directory's own flag, so nothing appears until
    // the parent opens — and then the subtree is already open.
    const store = openStore(TREE, 'closed')
    store.expand('src/nested/')

    expect(store.getVisibleSlice(0, store.getVisibleCount() - 1).map((row) => row.path)).toEqual(
      naiveVisiblePaths(TREE, new Set()),
    )

    store.expand('src/')

    expect(store.getVisibleSlice(0, store.getVisibleCount() - 1).map((row) => row.path)).toEqual(
      naiveVisiblePaths(TREE, new Set(['src/', 'src/nested/'])),
    )
  })

  it('reports no index for a path hidden inside a collapsed directory', () => {
    const store = openStore(TREE, 'closed')

    expect(store.getVisibleIndex('src/nested/deep.ts')).toBeNull()
    expect(store.getVisibleIndex('src/')).toBe(1)
  })
})

describe('slices', () => {
  it('returns each window as the slice of the whole visible sequence', () => {
    const store = openStore(TREE, 'open')
    const count = store.getVisibleCount()
    const full = store.getVisibleSlice(0, count - 1).map((row) => row.path)

    for (let start = 0; start < count; start += 1) {
      const end = Math.min(count - 1, start + 3)

      expect(store.getVisibleSlice(start, end).map((row) => row.path)).toEqual(
        full.slice(start, end + 1),
      )
    }
  })
})

function openStore(paths: readonly string[], expansion: 'closed' | 'open'): PathStore {
  return new PathStore({
    flattenEmptyDirectories: false,
    initialExpansion: expansion,
    paths,
  })
}

function ancestorsExpanded(path: string, expanded: ReadonlySet<string>): boolean {
  const segments = path.split('/').slice(0, -2)
  let prefix = ''
  for (const segment of segments) {
    prefix += `${segment}/`
    if (!expanded.has(prefix)) return false
  }

  return true
}

function toggleRandomly(
  store: PathStore,
  paths: readonly string[],
  directories: readonly string[],
  rng: () => number,
  seed: number,
): void {
  const expanded = new Set<string>()
  for (let step = 0; step < 20; step += 1) {
    // Only directories whose ancestors are already open, which is the only way
    // a user can reach a toggle. Expanding a hidden directory opens its whole
    // ancestor chain — characterized above, and a different property.
    const reachable = directories.filter((path) => ancestorsExpanded(path, expanded))
    const directory = reachable[Math.floor(rng() * reachable.length)]
    if (directory === undefined) continue

    const shouldExpand = !expanded.has(directory)
    if (shouldExpand) store.expand(directory)
    if (!shouldExpand) store.collapse(directory)
    if (shouldExpand) expanded.add(directory)
    if (!shouldExpand) expanded.delete(directory)

    expect(store.getVisibleCount(), `seed ${seed}, step ${step}, ${directory}`).toBe(
      naiveVisiblePaths(paths, expanded).length,
    )
  }
}
