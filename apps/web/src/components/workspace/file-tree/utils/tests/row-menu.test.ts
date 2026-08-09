import type { GitStatusEntry } from '@workspace/tree/utils/publicTypes'

import { rowHasGitChanges, treeRowMenu } from '@/components/workspace/file-tree/utils/row-menu'
import { expect, test } from '../../../../../../test/fixtures'

const changes: readonly GitStatusEntry[] = [
  { path: 'src/a.ts', status: 'modified' },
  { path: 'node_modules/dep.js', status: 'ignored' },
]

test('a changed file has git changes', () => {
  expect(rowHasGitChanges(changes, 'src/a.ts', false)).toBe(true)
})

test('an unchanged file does not', () => {
  expect(rowHasGitChanges(changes, 'src/b.ts', false)).toBe(false)
})

test('a directory counts when something beneath it changed', () => {
  expect(rowHasGitChanges(changes, 'src', true)).toBe(true)
})

test('a directory with no changed descendants does not', () => {
  expect(rowHasGitChanges(changes, 'docs', true)).toBe(false)
})

test('a file is not matched by a directory prefix of its own name', () => {
  expect(rowHasGitChanges(changes, 'src', false)).toBe(false)
})

test('ignored files never count as changes', () => {
  expect(rowHasGitChanges(changes, 'node_modules/dep.js', false)).toBe(false)
  expect(rowHasGitChanges(changes, 'node_modules', true)).toBe(false)
})

test('no git status at all means no git section', () => {
  expect(rowHasGitChanges(undefined, 'src/a.ts', false)).toBe(false)
  expect(rowHasGitChanges([], 'src/a.ts', false)).toBe(false)
})

test('omits the git section entirely for an unchanged row', () => {
  const sections = treeRowMenu(menuContext({ hasGitChanges: false })).map((entry) => entry.id)

  expect(sections).toEqual(['open', 'copy', 'git'])
  expect(itemLabels(menuContext({ hasGitChanges: false }), 'git')).toEqual([])
})

test('offers stage, unstage, and discard for a changed row', () => {
  expect(itemLabels(menuContext({ hasGitChanges: true }), 'git')).toEqual([
    'Stage Changes',
    'Unstage Changes',
    'Discard Changes',
  ])
})

test('a directory row offers no Open', () => {
  expect(itemLabels(menuContext({ isDirectory: true }), 'open')).toEqual([])
})

function itemLabels(context: Parameters<typeof treeRowMenu>[0], sectionId: string) {
  const entry = treeRowMenu(context).find((candidate) => candidate.id === sectionId)

  return (entry?.items ?? []).filter(Boolean).map((item) => (item as { label: string }).label)
}

function menuContext({
  hasGitChanges = false,
  isDirectory = false,
}: {
  hasGitChanges?: boolean
  isDirectory?: boolean
} = {}) {
  return {
    copyPath: () => {},
    discard: () => {},
    hasGitChanges,
    isDirectory,
    openFile: () => {},
    path: '/repo/src/a.ts',
    relativePath: 'src/a.ts',
    stage: () => {},
    unstage: () => {},
  }
}
