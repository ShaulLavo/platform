import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import type { ChatSidebarThreadSummary } from '@/features/chat/state/chat-projection-store'
import { sessionRailModel } from '@/features/chat-mode/utils/session-rail-model'
import { chatProject, sidebarThreadSummary } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'

const platformId = v.parse(projectIdSchema, 'project-platform')
const siteId = v.parse(projectIdSchema, 'project-site')
const docsId = v.parse(projectIdSchema, 'project-docs')

test('groups sessions under their project and ranks recent sessions newest first', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [
      chatProject({ id: platformId, title: 'platform', workspaceRoot: '/repo/platform' }),
      chatProject({ id: siteId, title: 'site', workspaceRoot: '/repo/site' }),
    ],
    threads: [
      threadSummary({ id: 'thread-old', projectId: platformId, updatedAt: '2026-05-01T00:00:00Z' }),
      threadSummary({ id: 'thread-new', projectId: siteId, updatedAt: '2026-05-09T00:00:00Z' }),
      threadSummary({ id: 'thread-mid', projectId: platformId, updatedAt: '2026-05-05T00:00:00Z' }),
    ],
  })

  expect(model.recent.map((session) => session.id)).toEqual([
    'thread-new',
    'thread-mid',
    'thread-old',
  ])
  expect(model.projects.map((project) => project.title)).toEqual(['platform', 'site'])
  expect(model.projects[0]?.sessions.map((session) => session.id)).toEqual([
    'thread-mid',
    'thread-old',
  ])
})

test('caps the recent list at the requested limit', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [chatProject({ id: platformId })],
    recentLimit: 2,
    threads: [
      threadSummary({ id: 'thread-a', projectId: platformId, updatedAt: '2026-05-01T00:00:00Z' }),
      threadSummary({ id: 'thread-b', projectId: platformId, updatedAt: '2026-05-02T00:00:00Z' }),
      threadSummary({ id: 'thread-c', projectId: platformId, updatedAt: '2026-05-03T00:00:00Z' }),
    ],
  })

  expect(model.recent.map((session) => session.id)).toEqual(['thread-c', 'thread-b'])
})

test('omits archived sessions', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [chatProject({ id: platformId })],
    threads: [
      threadSummary({ archivedAt: '2026-05-04T00:00:00Z', id: 'thread-a', projectId: platformId }),
      threadSummary({ id: 'thread-b', projectId: platformId }),
    ],
  })

  expect(model.recent.map((session) => session.id)).toEqual(['thread-b'])
  expect(model.projects[0]?.sessions).toHaveLength(1)
})

test('sorts the active project ahead of a project with newer sessions', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [
      chatProject({ id: siteId, title: 'site' }),
      chatProject({ id: platformId, title: 'platform' }),
    ],
    threads: [
      threadSummary({ id: 'thread-a', projectId: platformId, updatedAt: '2026-05-01T00:00:00Z' }),
      threadSummary({ id: 'thread-b', projectId: siteId, updatedAt: '2026-05-09T00:00:00Z' }),
    ],
  })

  expect(model.projects.map((project) => project.title)).toEqual(['platform', 'site'])
  expect(model.projects[0]?.active).toBe(true)
})

test('flags sessions waiting on the user', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [chatProject({ id: platformId })],
    threads: [
      threadSummary({ id: 'thread-a', pendingApprovalCount: 1, projectId: platformId }),
      threadSummary({ id: 'thread-b', projectId: platformId }),
    ],
  })

  const attention = new Map(model.recent.map((session) => [session.id, session.attention]))
  expect(attention.get(v.parse(threadIdSchema, 'thread-a'))).toBe(true)
  expect(attention.get(v.parse(threadIdSchema, 'thread-b'))).toBe(false)
})

// `latestUserMessageAt` wins over `updatedAt` when ranking, so null it out to keep
// these cases driven by the single timestamp each one sets.
function threadSummary({
  id,
  ...overrides
}: Omit<Partial<ChatSidebarThreadSummary>, 'id'> & { id: string }) {
  return sidebarThreadSummary({
    id: v.parse(threadIdSchema, id),
    latestUserMessageAt: null,
    ...overrides,
  })
}

test('disambiguates projects whose folder leaf is identical', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [
      chatProject({
        id: platformId,
        title: 'platform',
        workspaceRoot: '/Users/me/Desktop/platform',
      }),
      chatProject({ id: siteId, title: 'platform', workspaceRoot: '/Users/me/Desktop/D/platform' }),
      chatProject({ id: docsId, title: 'docs', workspaceRoot: '/Users/me/docs' }),
    ],
    threads: [],
  })

  const byId = new Map(model.projects.map((project) => [project.id, project]))
  expect(byId.get(platformId)?.qualifier).toBe('Desktop')
  expect(byId.get(siteId)?.qualifier).toBe('D')
  // A unique title needs no qualifier.
  expect(byId.get(docsId)?.qualifier).toBeNull()
})
