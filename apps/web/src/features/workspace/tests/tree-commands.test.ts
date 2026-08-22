import { treeCommandFocusCandidate } from '@/features/workspace/utils/tree-commands'

import { expect, test } from '../../../../test/fixtures'

test('prefers the active editor path for file-tree focus', () => {
  expect(
    treeCommandFocusCandidate({
      activeTreePath: 'src/active.ts',
      firstPath: 'README.md',
      focusedPath: 'src/focused.ts',
      selectedPaths: ['src/selected.ts'],
    }),
  ).toBe('src/active.ts')
})

test('falls back through focused, selected, and first visible paths', () => {
  expect(
    treeCommandFocusCandidate({
      activeTreePath: null,
      firstPath: 'README.md',
      focusedPath: 'src/focused.ts',
      selectedPaths: ['src/selected.ts'],
    }),
  ).toBe('src/focused.ts')
  expect(
    treeCommandFocusCandidate({
      activeTreePath: null,
      firstPath: 'README.md',
      focusedPath: null,
      selectedPaths: ['src/selected.ts'],
    }),
  ).toBe('src/selected.ts')
  expect(
    treeCommandFocusCandidate({
      activeTreePath: null,
      firstPath: 'README.md',
      focusedPath: null,
      selectedPaths: [],
    }),
  ).toBe('README.md')
})
