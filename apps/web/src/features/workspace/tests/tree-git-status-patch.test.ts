import { treeGitStatusPatch } from '@/features/workspace/utils/tree-git-status-patch'

import { expect, test } from '../../../../test/fixtures'

test('builds incremental add, change, and remove patches', () => {
  expect(
    treeGitStatusPatch(
      [
        { path: 'removed.ts', status: 'deleted' },
        { path: 'changed.ts', status: 'modified' },
      ],
      [
        { path: 'changed.ts', status: 'added' },
        { path: 'new.ts', status: 'untracked' },
      ],
    ),
  ).toEqual({
    remove: ['removed.ts'],
    set: [
      { path: 'changed.ts', status: 'added' },
      { path: 'new.ts', status: 'untracked' },
    ],
  })
})

test('treats reordered equivalent entries as a semantic no-op', () => {
  expect(
    treeGitStatusPatch(
      [
        { path: 'a.ts', status: 'added' },
        { path: 'b.ts', status: 'modified' },
      ],
      [
        { path: 'b.ts', status: 'modified' },
        { path: 'a.ts', status: 'added' },
      ],
    ),
  ).toBeNull()
})

test('uses the last duplicate status for each path', () => {
  expect(
    treeGitStatusPatch(
      [{ path: 'a.ts', status: 'modified' }],
      [
        { path: 'a.ts', status: 'deleted' },
        { path: 'a.ts', status: 'modified' },
      ],
    ),
  ).toBeNull()
})
