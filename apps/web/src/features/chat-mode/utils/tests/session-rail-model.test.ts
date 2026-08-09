import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import type { ChatSidebarThreadSummary } from '@/features/chat/state/chat-projection-store'
import { sessionRailModel } from '@/features/chat-mode/utils/session-rail-model'
import { chatProject, sidebarThreadSummary } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'

const platformId = v.parse(projectIdSchema, 'project-platform')
const siteId = v.parse(projectIdSchema, 'project-site')
const docsId = v.parse(projectIdSchema, 'project-docs')

test('ranks every project’s sessions into one list, newest first', () => {
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

  expect(model.sessions.map((session) => session.id)).toEqual([
    'thread-new',
    'thread-mid',
    'thread-old',
  ])
  expect(model.scopeTitle).toBe('All projects')
  expect(model.projects.map((project) => project.title)).toEqual(['platform', 'site'])
})

test('scoping to a project drops the others and names the scope', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [
      chatProject({ id: platformId, title: 'platform' }),
      chatProject({ id: siteId, title: 'site' }),
    ],
    scope: siteId,
    threads: [
      threadSummary({ id: 'thread-a', projectId: platformId }),
      threadSummary({ id: 'thread-b', projectId: siteId }),
    ],
  })

  expect(model.sessions.map((session) => session.id)).toEqual(['thread-b'])
  expect(model.scopedCount).toBe(1)
  expect(model.scopeTitle).toBe('site')
})

test('search matches title, project and branch but leaves the scope count alone', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [
      chatProject({ id: platformId, title: 'platform' }),
      chatProject({ id: siteId, title: 'site' }),
    ],
    query: 'FOOT',
    threads: [
      threadSummary({ id: 'thread-a', projectId: platformId, title: 'Fix the footer' }),
      threadSummary({ id: 'thread-b', projectId: siteId, title: 'Rewrite the header' }),
    ],
  })

  expect(model.sessions.map((session) => session.id)).toEqual(['thread-a'])
  // The count describes the scope, so it must survive narrowing — otherwise the
  // header reads "1" while the list is showing a filtered subset of many.
  expect(model.scopedCount).toBe(2)
})

test('search reaches the branch a session is on', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [chatProject({ id: platformId })],
    query: 'release/',
    threads: [
      threadSummary({ branch: 'release/2026-05', id: 'thread-a', projectId: platformId }),
      threadSummary({ branch: 'main', id: 'thread-b', projectId: platformId }),
    ],
  })

  expect(model.sessions.map((session) => session.id)).toEqual(['thread-a'])
})

test('omits archived sessions from the list and the counts', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [chatProject({ id: platformId })],
    threads: [
      threadSummary({ archivedAt: '2026-05-04T00:00:00Z', id: 'thread-a', projectId: platformId }),
      threadSummary({ id: 'thread-b', projectId: platformId }),
    ],
  })

  expect(model.sessions.map((session) => session.id)).toEqual(['thread-b'])
  expect(model.projects[0]?.sessionCount).toBe(1)
})

test('sorts the active project ahead of a project with more sessions', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [
      chatProject({ id: siteId, title: 'site' }),
      chatProject({ id: platformId, title: 'platform' }),
    ],
    threads: [
      threadSummary({ id: 'thread-a', projectId: platformId }),
      threadSummary({ id: 'thread-b', projectId: siteId }),
      threadSummary({ id: 'thread-c', projectId: siteId }),
    ],
  })

  expect(model.projects.map((project) => project.title)).toEqual(['platform', 'site'])
  expect(model.projects[0]?.active).toBe(true)
})

test('reports the status a session is in', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [chatProject({ id: platformId })],
    threads: [
      threadSummary({ id: 'thread-a', pendingApprovalCount: 1, projectId: platformId }),
      threadSummary({
        id: 'thread-b',
        latestTurn: null,
        projectId: platformId,
        session: null,
      }),
    ],
  })

  const statuses = new Map(model.sessions.map((session) => [session.id, session.status]))
  expect(statuses.get(v.parse(threadIdSchema, 'thread-a'))).toBe('waiting')
  expect(statuses.get(v.parse(threadIdSchema, 'thread-b'))).toBe('idle')
})

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
