import { retentionForProjects } from '@/features/editor/utils/document-retention'
import { expect, test } from '../../../../test/fixtures'

function slice(rootPath: string, lastActiveAt: number, documentIds: readonly string[]) {
  return {
    documentIds,
    lastActiveAt,
    rootPath,
    // Tab ids are unique per tab, so the same file open in two roots is two tabs.
    tabIds: documentIds.map((id) => `tab:${rootPath}:${id}`),
  }
}

const slices = [
  slice('/repo/a', 300, ['/repo/a/one.ts']),
  slice('/repo/b', 200, ['/repo/b/one.ts']),
  slice('/repo/c', 100, ['/repo/c/one.ts']),
  slice('/repo/d', 50, ['/repo/d/one.ts']),
]

test('keeps the active project plus the most recent others, trimming the oldest', () => {
  const retention = retentionForProjects({ activeRootPath: '/repo/a', projectLimit: 3, slices })

  expect([...retention.documentIds].toSorted()).toEqual([
    '/repo/a/one.ts',
    '/repo/b/one.ts',
    '/repo/c/one.ts',
  ])
  expect(retention.tabIds.has('tab:/repo/a:/repo/a/one.ts')).toBe(true)
})

test('never trims the active project, however stale it is', () => {
  const retention = retentionForProjects({ activeRootPath: '/repo/d', projectLimit: 2, slices })

  expect(retention.documentIds.has('/repo/d/one.ts')).toBe(true)
  expect(retention.documentIds.size).toBe(2)
})

test('a byte budget trims a project that the count alone would have kept', () => {
  const retention = retentionForProjects({
    activeRootPath: '/repo/a',
    byteBudget: 150,
    documentSizes: new Map([
      ['/repo/a/one.ts', 100],
      ['/repo/b/one.ts', 40],
      ['/repo/c/one.ts', 100],
    ]),
    projectLimit: 3,
    slices,
  })

  expect(retention.documentIds.has('/repo/a/one.ts')).toBe(true)
  expect(retention.documentIds.has('/repo/b/one.ts')).toBe(true)
  // Inside the project limit, but 100 + 40 + 100 overruns the 150-byte budget.
  expect(retention.documentIds.has('/repo/c/one.ts')).toBe(false)
})

test('charges a document shared by nested roots only once', () => {
  const shared = '/repo/shared.ts'
  const retention = retentionForProjects({
    activeRootPath: '/repo',
    byteBudget: 100,
    documentSizes: new Map([[shared, 100]]),
    projectLimit: 3,
    slices: [slice('/repo', 200, [shared]), slice('/repo/apps/web', 100, [shared])],
  })

  // Counting the shared document twice would blow the budget and drop the nested
  // root, taking a document the active root still displays with it.
  expect(retention.documentIds.has(shared)).toBe(true)
  expect(retention.tabIds.size).toBe(2)
})
