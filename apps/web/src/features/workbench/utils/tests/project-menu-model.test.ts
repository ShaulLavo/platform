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

test('merges recents with projects that were never opened as a root', () => {
  const entries = projectMenuModel({
    activeRootPath: '/repo/platform',
    activeTitle: 'platform',
    // Only ever a chat project, so it carries no last-opened stamp.
    projects: [
      { title: 'anubis', updatedAt: '2026-08-09T09:00:00.000Z', workspaceRoot: '/repo/anubis' },
    ],
    recentFolders: [{ name: 'shadcn', path: '/repo/shadcn' }],
  })

  expect(entries.map((entry) => entry.title)).toEqual(['platform', 'shadcn', 'anubis'])
})

test('reverses the oldest-first project order the shell snapshot serves', () => {
  const entries = projectMenuModel({
    activeRootPath: null,
    activeTitle: '',
    projects: [
      { title: 'stale', updatedAt: '2026-05-24T20:00:44.808Z', workspaceRoot: '/repo/stale' },
      { title: 'warm', updatedAt: '2026-08-09T06:14:00.808Z', workspaceRoot: '/repo/warm' },
      { title: 'hot', updatedAt: '2026-08-09T13:30:42.626Z', workspaceRoot: '/repo/hot' },
    ],
    recentFolders: [],
  })

  expect(entries.map((entry) => entry.title)).toEqual(['hot', 'warm', 'stale'])
})

test('keeps the last-opened order the file server serves', () => {
  const entries = projectMenuModel({
    activeRootPath: null,
    activeTitle: '',
    projects: [],
    recentFolders: [
      { name: 'today', path: '/repo/today' },
      { name: 'lastWeek', path: '/repo/last-week' },
    ],
  })

  expect(entries.map((entry) => entry.rootPath)).toEqual(['/repo/today', '/repo/last-week'])
})

test('never lists the same root twice', () => {
  const entries = projectMenuModel({
    activeRootPath: '/repo/platform',
    activeTitle: 'platform',
    projects: [
      { title: 'platform', updatedAt: '2026-08-09T09:00:00.000Z', workspaceRoot: '/repo/platform' },
    ],
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
