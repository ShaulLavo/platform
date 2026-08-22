import { projectIdSchema, threadIdSchema, turnIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import type { ProjectionThread } from '@/features/chat/state/chat-projection-store'
import { sessionRailModel } from '@/features/chat-mode/utils/session-rail-model'
import { chatProject, projectionThread } from '../../../../../test/factories/chat'
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
      threadSummary({ createdAt: '2026-05-01T00:00:00Z', id: 'thread-old', projectId: platformId }),
      threadSummary({ createdAt: '2026-05-09T00:00:00Z', id: 'thread-new', projectId: siteId }),
      threadSummary({ createdAt: '2026-05-05T00:00:00Z', id: 'thread-mid', projectId: platformId }),
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

test('activity never reorders the list — a session holds the slot it was created in', () => {
  const threads = [
    threadSummary({ createdAt: '2026-05-09T00:00:00Z', id: 'thread-new', projectId: platformId }),
    threadSummary({ createdAt: '2026-05-01T00:00:00Z', id: 'thread-old', projectId: platformId }),
  ]
  const busyOldThread = threads.map((thread) =>
    thread.id === 'thread-old'
      ? projectionThread({ ...thread, latestUserMessageAt: '2026-06-01T00:00:00Z' })
      : thread,
  )

  const order = (list: readonly ProjectionThread[]) =>
    sessionRailModel({
      projects: [chatProject({ id: platformId })],
      threads: list,
    }).sessions.map((session) => session.id)

  expect(order(threads)).toEqual(['thread-new', 'thread-old'])
  expect(order(busyOldThread)).toEqual(['thread-new', 'thread-old'])
})

test('ties break on id, so two sessions created in the same instant never swap', () => {
  const model = sessionRailModel({
    projects: [chatProject({ id: platformId })],
    threads: [
      threadSummary({ createdAt: '2026-05-09T00:00:00Z', id: 'thread-b', projectId: platformId }),
      threadSummary({ createdAt: '2026-05-09T00:00:00Z', id: 'thread-a', projectId: platformId }),
    ],
  })

  expect(model.sessions.map((session) => session.id)).toEqual(['thread-a', 'thread-b'])
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

test('a server match keeps a session whose title says nothing about the query', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [chatProject({ id: platformId })],
    query: 'tokenizer',
    searchMatches: {
      [v.parse(threadIdSchema, 'thread-b')]: {
        messageCreatedAt: '2026-05-09T09:00:00.000Z',
        projectId: platformId,
        snippet: 'rewrote the tokenizer fast path',
        source: 'assistant',
        threadId: v.parse(threadIdSchema, 'thread-b'),
      },
    },
    threads: [
      threadSummary({ id: 'thread-a', projectId: platformId, title: 'Tokenizer rewrite' }),
      threadSummary({ id: 'thread-b', projectId: platformId, title: 'Friday cleanup' }),
      threadSummary({ id: 'thread-c', projectId: platformId, title: 'Unrelated' }),
    ],
  })

  expect(model.sessions.map((session) => session.id)).toEqual(['thread-a', 'thread-b'])
})

test('a match for a thread the projection never heard of produces no row', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [chatProject({ id: platformId })],
    query: 'tokenizer',
    searchMatches: {
      [v.parse(threadIdSchema, 'thread-deleted')]: {
        messageCreatedAt: '2026-05-09T09:00:00.000Z',
        projectId: platformId,
        snippet: 'tokenizer',
        source: 'user',
        threadId: v.parse(threadIdSchema, 'thread-deleted'),
      },
    },
    threads: [threadSummary({ id: 'thread-a', projectId: platformId, title: 'Friday cleanup' })],
  })

  expect(model.sessions).toEqual([])
})

test('with no server matches the rail filters exactly as it always did', () => {
  const threads = [
    threadSummary({ id: 'thread-a', projectId: platformId, title: 'Fix the footer' }),
    threadSummary({ id: 'thread-b', projectId: platformId, title: 'Rewrite the header' }),
  ]
  const withMatches = sessionRailModel({
    projects: [chatProject({ id: platformId })],
    query: 'footer',
    searchMatches: {},
    threads,
  })
  const withoutMatches = sessionRailModel({
    projects: [chatProject({ id: platformId })],
    query: 'footer',
    threads,
  })

  expect(withMatches.sessions.map((session) => session.id)).toEqual(['thread-a'])
  expect(withoutMatches.sessions.map((session) => session.id)).toEqual(['thread-a'])
})

test('the inbox omits archived sessions but still counts them', () => {
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
  expect(model.archivedCount).toBe(1)
})

test('the archive view lists exactly what the inbox hides', () => {
  const model = sessionRailModel({
    activeProjectId: platformId,
    projects: [chatProject({ id: platformId })],
    threads: [
      threadSummary({ archivedAt: '2026-05-04T00:00:00Z', id: 'thread-a', projectId: platformId }),
      threadSummary({ id: 'thread-b', projectId: platformId }),
    ],
    view: 'archived',
  })

  expect(model.sessions.map((session) => session.id)).toEqual(['thread-a'])
  expect(model.sessions[0]?.archived).toBe(true)
  expect(model.scopedCount).toBe(1)
})

test('opening a project does not pull it to the top of the rail', () => {
  const projects = [
    chatProject({ createdAt: '2026-04-01T00:00:00Z', id: siteId, title: 'site' }),
    chatProject({ createdAt: '2026-04-02T00:00:00Z', id: platformId, title: 'platform' }),
  ]
  const order = (activeProjectId: typeof platformId) =>
    sessionRailModel({ activeProjectId, projects, threads: [] }).projects.map(
      (project) => project.title,
    )

  expect(order(siteId)).toEqual(['site', 'platform'])
  // Selection is carried by the highlighted row, never by the row's position.
  expect(order(platformId)).toEqual(['site', 'platform'])
})

test('creating a session does not reshuffle the projects', () => {
  const projects = [
    chatProject({ createdAt: '2026-04-01T00:00:00Z', id: siteId, title: 'site' }),
    chatProject({ createdAt: '2026-04-02T00:00:00Z', id: platformId, title: 'platform' }),
  ]
  const threads = [threadSummary({ id: 'thread-a', projectId: platformId })]
  const order = (list: readonly ProjectionThread[]) =>
    sessionRailModel({ projects, threads: list }).projects.map((project) => project.title)

  expect(order(threads)).toEqual(['site', 'platform'])
  expect(order([...threads, threadSummary({ id: 'thread-b', projectId: platformId })])).toEqual([
    'site',
    'platform',
  ])
})

test('a dragged project holds its arranged slot ahead of the ones never dragged', () => {
  const model = sessionRailModel({
    projects: [
      chatProject({ createdAt: '2026-04-01T00:00:00Z', id: siteId, title: 'site' }),
      chatProject({
        createdAt: '2026-04-02T00:00:00Z',
        id: platformId,
        orderKey: 'd',
        title: 'platform',
      }),
      chatProject({ createdAt: '2026-04-03T00:00:00Z', id: docsId, orderKey: 'b', title: 'docs' }),
    ],
    threads: [],
  })

  expect(model.projects.map((project) => project.title)).toEqual(['docs', 'platform', 'site'])
})

test('a drag still in flight orders the rail before the server has confirmed it', () => {
  const model = sessionRailModel({
    orderOverrides: { projectOrderKeys: { [siteId]: 'b' }, sessionOrderKeys: {} },
    projects: [
      chatProject({ createdAt: '2026-04-01T00:00:00Z', id: platformId, title: 'platform' }),
      chatProject({ createdAt: '2026-04-02T00:00:00Z', id: siteId, title: 'site' }),
    ],
    threads: [],
  })

  expect(model.projects.map((project) => project.title)).toEqual(['site', 'platform'])
})

test('a dragged session sits above the rest, which keep their creation order', () => {
  const model = sessionRailModel({
    projects: [chatProject({ id: platformId })],
    threads: [
      threadSummary({ createdAt: '2026-05-09T00:00:00Z', id: 'thread-new', projectId: platformId }),
      threadSummary({ createdAt: '2026-05-01T00:00:00Z', id: 'thread-old', projectId: platformId }),
      threadSummary({
        createdAt: '2026-05-05T00:00:00Z',
        id: 'thread-dragged',
        pinOrderKey: 'm',
        projectId: platformId,
      }),
    ],
  })

  expect(model.sessions.map((session) => session.id)).toEqual([
    'thread-dragged',
    'thread-new',
    'thread-old',
  ])
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

test('a session that finished after it was last read comes back unread', () => {
  const runningTurn = projectionThread().latestTurn
  const finished: Partial<ProjectionThread> = {
    latestTurn: runningTurn && {
      ...runningTurn,
      completedAt: '2026-05-09T10:00:00.000Z',
      state: 'completed',
    },
  }
  const model = sessionRailModel({
    projects: [chatProject({ id: platformId })],
    seenByThreadId: {
      [v.parse(threadIdSchema, 'thread-read')]: '2026-05-09T10:00:00.000Z',
      [v.parse(threadIdSchema, 'thread-stale')]: '2026-05-09T08:00:00.000Z',
    },
    threads: [
      threadSummary({ ...finished, id: 'thread-read', projectId: platformId }),
      threadSummary({ ...finished, id: 'thread-stale', projectId: platformId }),
      threadSummary({ ...finished, id: 'thread-never', projectId: platformId }),
      threadSummary({ id: 'thread-running', projectId: platformId }),
    ],
  })

  const unread = new Map(model.sessions.map((session) => [session.id, session.unread]))
  expect(unread.get(v.parse(threadIdSchema, 'thread-read'))).toBe(false)
  expect(unread.get(v.parse(threadIdSchema, 'thread-stale'))).toBe(true)
  expect(unread.get(v.parse(threadIdSchema, 'thread-never'))).toBe(true)
  // Still working: there is no finish to have missed yet.
  expect(unread.get(v.parse(threadIdSchema, 'thread-running'))).toBe(false)
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

test('bands sessions by project and rolls the worst status onto the band', () => {
  const model = sessionRailModel({
    projects: [
      chatProject({ id: platformId, title: 'platform', workspaceRoot: '/repo/platform' }),
      chatProject({ id: siteId, title: 'site', workspaceRoot: '/repo/site' }),
    ],
    threads: [
      threadSummary({
        createdAt: '2026-05-09T00:00:00Z',
        id: 'thread-idle',
        latestTurn: null,
        projectId: platformId,
        session: null,
      }),
      threadSummary({
        createdAt: '2026-05-05T00:00:00Z',
        id: 'thread-waiting',
        pendingApprovalCount: 1,
        projectId: siteId,
      }),
    ],
  })

  const byId = new Map(model.groups.map((group) => [group.project.id, group]))
  expect(byId.get(platformId)?.project.status).toBe('idle')
  expect(byId.get(siteId)?.project.status).toBe('waiting')
  expect(byId.get(siteId)?.sessions.map((session) => session.id)).toEqual(['thread-waiting'])
})

test('a project with no sessions in view never becomes an empty band', () => {
  const model = sessionRailModel({
    projects: [chatProject({ id: platformId }), chatProject({ id: docsId, title: 'docs' })],
    threads: [threadSummary({ id: 'thread-1', projectId: platformId })],
  })

  expect(model.groups.map((group) => group.project.id)).toEqual([platformId])
  // Still offered as a scope, though — that is how a first session gets drafted into it.
  expect(model.projects.map((project) => project.id)).toContain(docsId)
})

test('a collapsed project keeps the session on the stage and counts the rest away', () => {
  const model = sessionRailModel({
    activeThreadId: v.parse(threadIdSchema, 'thread-open'),
    collapsedProjectIds: [platformId],
    projects: [chatProject({ id: platformId })],
    threads: [
      threadSummary({
        createdAt: '2026-05-09T00:00:00Z',
        id: 'thread-open',
        projectId: platformId,
      }),
      threadSummary({
        createdAt: '2026-05-05T00:00:00Z',
        id: 'thread-shut',
        projectId: platformId,
      }),
    ],
  })

  const group = model.groups[0]
  expect(group?.collapsed).toBe(true)
  expect(group?.sessions.map((session) => session.id)).toEqual(['thread-open'])
  expect(group?.hiddenCount).toBe(1)
  // The flat list the keyboard commands walk is untouched by a fold.
  expect(model.sessions).toHaveLength(2)
})

test('a search reopens folded projects rather than hiding its own matches', () => {
  const model = sessionRailModel({
    collapsedProjectIds: [platformId],
    projects: [chatProject({ id: platformId })],
    query: 'footer',
    threads: [threadSummary({ id: 'thread-1', projectId: platformId, title: 'Fix the footer' })],
  })

  expect(model.groups[0]?.collapsed).toBe(false)
  expect(model.groups[0]?.sessions).toHaveLength(1)
})

test('counts unread sessions onto the project band', () => {
  const model = sessionRailModel({
    projects: [chatProject({ id: platformId })],
    seenByThreadId: {},
    threads: [
      threadSummary({
        id: 'thread-finished',
        latestTurn: {
          assistantMessageId: null,
          completedAt: '2026-05-09T10:00:00Z',
          requestedAt: '2026-05-09T09:00:00Z',
          startedAt: '2026-05-09T09:00:00Z',
          state: 'completed',
          turnId: v.parse(turnIdSchema, 'turn-1'),
        },
        projectId: platformId,
      }),
      threadSummary({ id: 'thread-quiet', projectId: platformId }),
    ],
  })

  expect(model.groups[0]?.project.unreadCount).toBe(1)
})

test('narrates the step of a running plan, and nothing once the turn that wrote it ends', () => {
  const planning = {
    completedSteps: 2,
    step: 'run the migration',
    totalSteps: 5,
    turnId: v.parse(turnIdSchema, 'turn-planning'),
  }
  const running = threadSummary({
    id: 'thread-running',
    latestTurn: runningTurn('turn-planning'),
    planProgress: planning,
  })
  const settled = threadSummary({
    id: 'thread-settled',
    latestTurn: {
      ...runningTurn('turn-planning'),
      completedAt: '2026-05-01T00:00:03Z',
      state: 'completed' as const,
    },
    planProgress: planning,
  })
  // The fold keeps the plan, so a thread that has since started answering an
  // unrelated question still carries the old turn's steps.
  const movedOn = threadSummary({
    id: 'thread-moved-on',
    latestTurn: runningTurn('turn-later'),
    planProgress: planning,
  })

  const model = sessionRailModel({
    projects: [chatProject({ id: platformId })],
    threads: [running, settled, movedOn].map((thread) => ({ ...thread, projectId: platformId })),
  })
  const progressById = Object.fromEntries(
    model.sessions.map((session) => [session.id, session.planProgress]),
  )

  // Step 3 of 5, not 2: `completedSteps` counts what is done, and a row that
  // says "2 of 5" while working on the third reads as one step behind.
  expect(progressById['thread-running']).toEqual({
    step: 'run the migration',
    stepNumber: 3,
    totalSteps: 5,
  })
  expect(progressById['thread-settled']).toBeNull()
  expect(progressById['thread-moved-on']).toBeNull()
})

function runningTurn(turnId: string) {
  return {
    assistantMessageId: null,
    completedAt: null,
    requestedAt: '2026-05-01T00:00:01Z',
    startedAt: '2026-05-01T00:00:02Z',
    state: 'running' as const,
    turnId: v.parse(turnIdSchema, turnId),
  }
}

function threadSummary({
  id,
  ...overrides
}: Omit<Partial<ProjectionThread>, 'id'> & { id: string }) {
  return projectionThread({
    id: v.parse(threadIdSchema, id),
    ...overrides,
  })
}
