import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as v from 'valibot'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { SessionRail } from '@/features/chat-mode/components/session-rail'
import {
  ChatModeSessionContext,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { chatProject, shellSnapshot, threadShell } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

const platformId = v.parse(projectIdSchema, 'project-platform')
const siteId = v.parse(projectIdSchema, 'project-site')
const docsId = v.parse(projectIdSchema, 'project-docs')
const platformThreadId = v.parse(threadIdSchema, 'thread-platform')
const siteThreadId = v.parse(threadIdSchema, 'thread-site')

test('lists sessions grouped under every known project', () => {
  seedProjection()
  renderSessionRail()

  expect(screen.getByRole('heading', { name: 'recent' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'platform' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'site' })).toBeVisible()
  // Once under "recent", once under its project group.
  expect(screen.getAllByTitle('Ship the rail')).toHaveLength(2)
  expect(screen.getAllByTitle('Fix the footer')).toHaveLength(2)
})

test('opens the owning project before selecting a session from another project', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getAllByTitle('Fix the footer')[0]!)

  expect(calls.openedProjects).toEqual(['/repo/site'])
  expect(calls.selected).toEqual([{ projectId: siteId, threadId: siteThreadId }])
})

test('selects a session in the active project without reopening it', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getAllByTitle('Ship the rail')[0]!)

  expect(calls.openedProjects).toEqual([])
  expect(calls.selected).toEqual([{ projectId: platformId, threadId: platformThreadId }])
})

test('starts a draft in the open project from the top new session button', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: 'New session' }))

  expect(calls.openedProjects).toEqual([])
  expect(calls.drafted).toEqual([platformId])
})

test('gives every project its own new session button', () => {
  seedProjection()
  renderSessionRail()

  expect(screen.getByRole('button', { name: 'New session in platform' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'New session in site' })).toBeVisible()
})

test('opens the owning project before drafting into a project that is not open', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: 'New session in site' }))

  expect(calls.openedProjects).toEqual(['/repo/site'])
  expect(calls.drafted).toEqual([siteId])
})

test('drafts into the open project without reopening it', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: 'New session in platform' }))

  expect(calls.openedProjects).toEqual([])
  expect(calls.drafted).toEqual([platformId])
})

test('lists a project that has no sessions yet so it can still be drafted into', () => {
  seedProjection({ withEmptyProject: true })
  renderSessionRail()

  expect(screen.getByRole('heading', { name: 'docs' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'New session in docs' })).toBeVisible()
})

test('offers a way to add a directory as a project', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: 'Add project' }))

  expect(calls.addProjectCount).toBe(1)
})

function seedProjection({ withEmptyProject = false }: { withEmptyProject?: boolean } = {}) {
  const emptyProject = withEmptyProject
    ? [chatProject({ id: docsId, title: 'docs', workspaceRoot: '/repo/docs' })]
    : []

  useChatProjectionStore.getState().resetChatProjection()
  useChatProjectionStore.getState().syncShellSnapshot(
    shellSnapshot({
      projects: [
        chatProject({ id: platformId, title: 'platform', workspaceRoot: '/repo/platform' }),
        chatProject({ id: siteId, title: 'site', workspaceRoot: '/repo/site' }),
        ...emptyProject,
      ],
      threads: [
        threadShell({
          id: platformThreadId,
          latestUserMessageAt: '2026-05-09T00:00:00.000Z',
          projectId: platformId,
          title: 'Ship the rail',
        }),
        threadShell({
          id: siteThreadId,
          latestUserMessageAt: '2026-05-01T00:00:00.000Z',
          projectId: siteId,
          title: 'Fix the footer',
        }),
      ],
    }),
  )
}

function renderSessionRail() {
  const calls = {
    addProjectCount: 0,
    drafted: [] as string[],
    openedProjects: [] as string[],
    selected: [] as { projectId: string; threadId: string }[],
  }
  const session: ChatModeSession = {
    activeSession: { status: 'ready', threadId: platformThreadId },
    addProject: () => {
      calls.addProjectCount += 1
    },
    environment: {} as ChatEnvironment,
    error: null,
    openProject: (workspaceRoot) => calls.openedProjects.push(workspaceRoot),
    project: chatProject({ id: platformId, title: 'platform', workspaceRoot: '/repo/platform' }),
    ready: true,
    selectSession: (projectId, threadId) => calls.selected.push({ projectId, threadId }),
    startDraft: (projectId) => calls.drafted.push(projectId),
    threads: [],
  }

  renderWithProviders(
    <ChatModeSessionContext value={session}>
      <SessionRail />
    </ChatModeSessionContext>,
  )

  return calls
}
