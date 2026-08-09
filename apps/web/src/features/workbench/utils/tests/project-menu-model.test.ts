import { projectMenuModel } from '@/features/workbench/utils/project-menu-model'
import { expect, test } from '../../../../../test/fixtures'

test('lists the open root first even before either source has loaded', () => {
  const entries = projectMenuModel({
    activeRootPath: '/repo/platform',
    activeTitle: 'platform',
    projects: [],
    recentFolders: [],
  })

  expect(entries).toEqual([{ qualifier: null, rootPath: '/repo/platform', title: 'platform' }])
})

test('merges recents with projects that were never opened through the picker', () => {
  const entries = projectMenuModel({
    activeRootPath: '/repo/platform',
    activeTitle: 'platform',
    // Reached by clicking a chat session, so never recorded as recent.
    projects: [{ title: 'anubis', workspaceRoot: '/repo/anubis' }],
    recentFolders: [{ name: 'shadcn', path: '/repo/shadcn' }],
  })

  expect(entries.map((entry) => entry.title)).toEqual(['platform', 'shadcn', 'anubis'])
})

test('never lists the same root twice', () => {
  const entries = projectMenuModel({
    activeRootPath: '/repo/platform',
    activeTitle: 'platform',
    projects: [{ title: 'platform', workspaceRoot: '/repo/platform' }],
    recentFolders: [
      { name: 'platform', path: '/repo/platform' },
      { name: 'docs', path: '/repo/docs' },
    ],
  })

  expect(entries.map((entry) => entry.rootPath)).toEqual(['/repo/platform', '/repo/docs'])
})

test('disambiguates entries whose folder name is identical', () => {
  const entries = projectMenuModel({
    activeRootPath: '/Users/me/Desktop/platform',
    activeTitle: 'platform',
    projects: [],
    recentFolders: [
      { name: 'platform', path: '/Users/me/Desktop/D/platform' },
      { name: 'docs', path: '/Users/me/docs' },
    ],
  })

  const byRootPath = new Map(entries.map((entry) => [entry.rootPath, entry.qualifier]))
  expect(byRootPath.get('/Users/me/Desktop/platform')).toBe('Desktop')
  expect(byRootPath.get('/Users/me/Desktop/D/platform')).toBe('D')
  expect(byRootPath.get('/Users/me/docs')).toBeNull()
})
