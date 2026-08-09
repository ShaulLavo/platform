import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as v from 'valibot'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { SessionRail } from '@/features/chat-mode/components/session-rail'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
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

test('lists every project’s sessions in one ordered list', () => {
  seedProjection()
  renderSessionRail()

  // One list, one row per session — no per-project duplication.
  expect(screen.getByTitle('Ship the rail')).toBeVisible()
  expect(screen.getByTitle('Fix the footer')).toBeVisible()
  expect(sessionTitles()).toEqual(['Ship the rail', 'Fix the footer'])
})

test('shows the owning project on each row while every project is in scope', () => {
  seedProjection()
  renderSessionRail()

  expect(screen.getByTitle('Fix the footer')).toHaveTextContent('site')
})

test('activates the owning project before selecting a session from another project', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getByTitle('Fix the footer'))

  expect(calls.openedProjects).toEqual(['/repo/site'])
  expect(calls.selected).toEqual([{ projectId: siteId, threadId: siteThreadId }])
})

test('selects a session in the active project without reopening it', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getByTitle('Ship the rail'))

  expect(calls.openedProjects).toEqual([])
  expect(calls.selected).toEqual([{ projectId: platformId, threadId: platformThreadId }])
})

test('narrows the list to sessions matching the search text', async () => {
  seedProjection()
  renderSessionRail()

  await userEvent.type(screen.getByRole('searchbox', { name: 'Search sessions' }), 'footer')

  expect(sessionTitles()).toEqual(['Fix the footer'])
})

test('reports when the search matches nothing', async () => {
  seedProjection()
  renderSessionRail()

  await userEvent.type(screen.getByRole('searchbox', { name: 'Search sessions' }), 'nothing here')

  expect(sessionTitles()).toEqual([])
  expect(screen.getByText(/No sessions match/)).toBeVisible()
})

test('scoping to a project hides the others and drops the project label', async () => {
  seedProjection()
  renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: /All projects/ }))
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /^site/ }))

  expect(sessionTitles()).toEqual(['Fix the footer'])
  expect(screen.getByTitle('Fix the footer')).not.toHaveTextContent('site')
})

test('starts a draft in the open project from the new session button', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: 'New session' }))

  expect(calls.openedProjects).toEqual([])
  expect(calls.drafted).toEqual([platformId])
})

test('drafts into the scoped project, activating it first', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: /All projects/ }))
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /^site/ }))
  await userEvent.click(screen.getByRole('button', { name: 'New session' }))

  expect(calls.openedProjects).toEqual(['/repo/site'])
  expect(calls.drafted).toEqual([siteId])
})

test('offers a project with no sessions yet as a scope so it can be drafted into', async () => {
  seedProjection({ withEmptyProject: true })
  renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: /All projects/ }))

  expect(await screen.findByRole('menuitemradio', { name: /^docs/ })).toBeVisible()
})

test('offers a way to add a directory as a project', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: 'Add project' }))

  expect(calls.addProjectCount).toBe(1)
})

function sessionTitles() {
  return screen
    .queryAllByRole('button')
    .filter((element) => element.getAttribute('aria-current') !== null || isSessionRow(element))
    .map((element) => element.getAttribute('title') ?? '')
}

function isSessionRow(element: HTMLElement) {
  return element.className.includes('group/session')
}

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
    rootPath: '/repo/platform',
    selectSession: (projectId, threadId) => calls.selected.push({ projectId, threadId }),
    startDraft: (projectId) => calls.drafted.push(projectId),
    threads: [],
  }

  // App.tsx mounts chat mode inside the editor stores, and the row context menu
  // resolves command availability from them.
  renderWithProviders(
    <EditorStateProvider>
      <ChatModeSessionContext value={session}>
        <SessionRail />
      </ChatModeSessionContext>
    </EditorStateProvider>,
  )

  return calls
}
