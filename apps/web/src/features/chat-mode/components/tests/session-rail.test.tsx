import {
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
  type ClientOrchestrationCommand,
  type OrchestrationThreadShell,
} from '@workspace/contracts'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as v from 'valibot'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { SessionRail } from '@/features/chat-mode/components/session-rail'
import { EditorStateProvider } from '@/features/editor/providers/state-provider'
import { ChatRailOrderProvider } from '@/features/chat-mode/providers/rail-order-provider'
import {
  ChatModeSessionContext,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { setSessionProjectOpener } from '@/features/chat-mode/state/session-commands'
import { useSessionMultiSelectStore } from '@/features/chat-mode/state/session-multi-select-store'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { setCoarseClockNow } from '@/features/chat/state/coarse-clock-store'
import { resetSessionReadStore } from '@/features/chat-mode/state/session-read-store'
import { resetSessionSearchStore } from '@/features/chat-mode/state/session-search-store'
import {
  resetSessionSelectionStore,
  useSessionSelectionStore,
} from '@/features/chat-mode/state/session-selection-store'
import { useActiveProjectStore } from '@/features/workspace/state/active-project'
import { chatProject, shellSnapshot, threadShell } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

const platformId = v.parse(projectIdSchema, 'project-platform')
const siteId = v.parse(projectIdSchema, 'project-site')
const docsId = v.parse(projectIdSchema, 'project-docs')
const platformThreadId = v.parse(threadIdSchema, 'thread-platform')
const siteThreadId = v.parse(threadIdSchema, 'thread-site')
const archivedThreadId = v.parse(threadIdSchema, 'thread-archived')
const settled = { latestTurn: null, session: null } satisfies Partial<OrchestrationThreadShell>

test('lists every project’s sessions in one ordered list', () => {
  seedProjection()
  renderSessionRail()

  // One list, one row per session — no per-project duplication.
  expect(screen.getByTitle('Ship the rail')).toBeVisible()
  expect(screen.getByTitle('Fix the footer')).toBeVisible()
  expect(sessionTitles()).toEqual(['Ship the rail', 'Fix the footer'])
})

test('bands the sessions under their project', () => {
  seedProjection()
  renderSessionRail()

  // The project name belongs to the header now; repeating it on every row was noise.
  expect(screen.getByRole('button', { name: /platform/ })).toBeVisible()
  expect(screen.getByRole('button', { name: /site/ })).toBeVisible()
  expect(screen.getByTitle('Fix the footer')).not.toHaveTextContent('site')
})

test('rolls the worst session status up onto the project header', () => {
  seedProjection({ withWaitingSession: true })
  renderSessionRail()

  // The site project holds the waiting session; platform holds an idle one.
  expect(screen.getByRole('button', { name: /site/ })).toHaveTextContent('site')
  expect(within(screen.getByRole('button', { name: /site/ })).getByRole('status')).toHaveAttribute(
    'title',
    'Waiting for you',
  )
})

test('a collapsed project keeps the session on the stage visible', async () => {
  seedProjection()
  renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: /platform/ }))
  // The stage is on "Ship the rail", which lives in the project just folded shut.
  expect(screen.getByTitle('Ship the rail')).toBeVisible()
  expect(screen.getByRole('button', { name: /platform/ })).toHaveAttribute('aria-expanded', 'false')

  await userEvent.click(screen.getByRole('button', { name: /site/ }))
  expect(screen.queryByTitle('Fix the footer')).toBeNull()
  expect(screen.getByText('1 hidden')).toBeVisible()
})

test('cmd-click marks a second session instead of opening it', async () => {
  seedProjection()
  renderSessionRail()
  // One user session: held modifiers only carry across clicks made by the same instance.
  const user = userEvent.setup()

  await user.click(screen.getByTitle('Ship the rail'))
  await user.keyboard('{Meta>}')
  await user.click(screen.getByTitle('Fix the footer'))
  await user.keyboard('{/Meta}')

  expect(useSessionMultiSelectStore.getState().threadIds).toEqual([platformThreadId, siteThreadId])
  // The stage never moved: marking and opening are different requests.
  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId: platformId,
    threadId: platformThreadId,
  })
})

test('shift-click extends the mark across the rows between', async () => {
  seedProjection()
  renderSessionRail()
  const user = userEvent.setup()

  await markBothSessions(user)

  expect(useSessionMultiSelectStore.getState().threadIds).toEqual([platformThreadId, siteThreadId])
  expect(screen.getByRole('toolbar', { name: 'Selected sessions' })).toHaveTextContent('2 selected')
})

test('escape clears the marked sessions', async () => {
  seedProjection()
  renderSessionRail()
  const user = userEvent.setup()

  await markBothSessions(user)
  await user.keyboard('{Escape}')

  expect(useSessionMultiSelectStore.getState().threadIds).toEqual([])
  expect(screen.queryByRole('toolbar', { name: 'Selected sessions' })).toBeNull()
})

test('archives every marked session in one action', async () => {
  seedProjection()
  const calls = renderSessionRail()
  const user = userEvent.setup()

  await markBothSessions(user)
  await user.click(screen.getByRole('button', { name: 'Archive' }))

  expect(calls.dispatched.map((command) => command.type)).toEqual([
    'thread.archive',
    'thread.archive',
  ])
  expect(useSessionMultiSelectStore.getState().threadIds).toEqual([])
})

test('activates the owning project before selecting a session from another project', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getByTitle('Fix the footer'))

  expect(calls.openedProjects).toEqual(['/repo/site'])
  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId: siteId,
    threadId: siteThreadId,
  })
})

test('selects a session in the active project without reopening it', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getByTitle('Ship the rail'))

  expect(calls.openedProjects).toEqual([])
  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId: platformId,
    threadId: platformThreadId,
  })
})

test('a message arriving in another session does not move the row under the cursor', () => {
  seedProjection()
  renderSessionRail()
  useSessionSelectionStore.getState().selectSession(platformId, platformThreadId)
  expect(sessionTitles()).toEqual(['Ship the rail', 'Fix the footer'])

  // The bottom row becomes the most recently active one. Under activity ordering it
  // would jump to the top and drag the selected row down a slot.
  useChatProjectionStore.getState().syncShellSnapshot(
    shellSnapshot({
      projects: seededProjects(),
      threads: [
        seededThread(platformThreadId, 'Ship the rail', '2026-05-09T00:00:00.000Z', platformId),
        {
          ...seededThread(siteThreadId, 'Fix the footer', '2026-05-01T00:00:00.000Z', siteId),
          latestUserMessageAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    }),
  )

  expect(sessionTitles()).toEqual(['Ship the rail', 'Fix the footer'])
})

test('a row\u2019s recency label ages instead of freezing at what it said on mount', () => {
  seedProjection()
  renderSessionRail()
  // Set after mount: retaining the clock re-stamps it, which is what stops a
  // resumed clock from handing out the time it went idle at.
  act(() => setCoarseClockNow(Date.parse('2026-05-28T00:30:02.000Z')))

  expect(screen.getAllByText('30m ago').length).toBeGreaterThan(0)

  // Not just a formatter test: an in-render `Date.now()` would be hoisted into
  // the React Compiler's memo scope and never recompute, so what is asserted is
  // that the label follows the shared clock rather than the mount.
  act(() => setCoarseClockNow(Date.parse('2026-05-28T03:00:02.000Z')))

  expect(screen.getAllByText('3h ago').length).toBeGreaterThan(0)
  expect(screen.queryByText('30m ago')).toBeNull()
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
  // Not "no matches" until the message scan has answered — titles alone cannot
  // rule out a hit inside the conversation.
  expect(await screen.findByText(/No sessions match/)).toBeVisible()
})

test('scoping to a project hides the others', async () => {
  seedProjection()
  renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: /All projects/ }))
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /^site/ }))

  expect(sessionTitles()).toEqual(['Fix the footer'])
})

test('starts a draft in the open project from the new session button', async () => {
  seedProjection()
  renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: 'New session' }))

  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'draft',
    projectId: platformId,
  })
})

test('drafts into the scoped project, activating it first', async () => {
  seedProjection()
  const calls = renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: /All projects/ }))
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /^site/ }))
  await userEvent.click(screen.getByRole('button', { name: 'New session' }))

  expect(calls.openedProjects).toEqual(['/repo/site'])
  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'draft',
    projectId: siteId,
  })
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

test('the archive browser lists filed sessions and hands one back to the inbox', async () => {
  seedProjection({ withArchivedSession: true })
  const calls = renderSessionRail()

  // Archived sessions are invisible in the inbox — the whole reason they need a view.
  expect(sessionTitles()).not.toContain('Filed away')

  await userEvent.click(screen.getByRole('button', { name: 'Archived sessions' }))
  expect(sessionTitles()).toEqual(['Filed away'])

  await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByTitle('Filed away') })
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Unarchive' }))

  expect(calls.dispatched.map((command) => command.type)).toEqual(['thread.unarchive'])
})

test('an archived session opens on the stage from the archive browser', async () => {
  seedProjection({ withArchivedSession: true })
  renderSessionRail()

  await userEvent.click(screen.getByRole('button', { name: 'Archived sessions' }))
  await userEvent.click(screen.getByTitle('Filed away'))

  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId: platformId,
    threadId: archivedThreadId,
  })
})

test('marks a session that finished while it was not the open one', () => {
  seedProjection({ withFinishedSession: true })
  renderSessionRail()

  const unread = screen.getAllByTitle('Finished since you last opened it')
  expect(unread).toHaveLength(1)
  expect(screen.getByTitle('Fix the footer')).toContainElement(unread[0] ?? null)
})

function sessionTitles() {
  return screen
    .queryAllByRole('button')
    .filter((element) => element.getAttribute('aria-current') !== null || isSessionRow(element))
    .map((element) => element.getAttribute('title') ?? '')
}

async function markBothSessions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTitle('Ship the rail'))
  await user.keyboard('{Shift>}')
  await user.click(screen.getByTitle('Fix the footer'))
  await user.keyboard('{/Shift}')
}

function isSessionRow(element: HTMLElement) {
  return element.className.includes('group/session')
}

function seededProjects() {
  return [
    chatProject({ id: platformId, title: 'platform', workspaceRoot: '/repo/platform' }),
    chatProject({ id: siteId, title: 'site', workspaceRoot: '/repo/site' }),
  ]
}

function seededThread(
  id: typeof platformThreadId,
  title: string,
  createdAt: string,
  projectId: typeof platformId,
) {
  return threadShell({ ...settled, createdAt, id, projectId, title })
}

function seedProjection({
  withArchivedSession = false,
  withEmptyProject = false,
  withFinishedSession = false,
  withWaitingSession = false,
}: {
  withArchivedSession?: boolean
  withEmptyProject?: boolean
  withFinishedSession?: boolean
  withWaitingSession?: boolean
} = {}) {
  const emptyProject = withEmptyProject
    ? [chatProject({ id: docsId, title: 'docs', workspaceRoot: '/repo/docs' })]
    : []
  const archived = withArchivedSession
    ? [
        threadShell({
          ...settled,
          archivedAt: '2026-05-11T00:00:00.000Z',
          createdAt: '2026-05-05T00:00:00.000Z',
          id: archivedThreadId,
          projectId: platformId,
          title: 'Filed away',
        }),
      ]
    : []
  const baseSiteThread = seededThread(
    siteThreadId,
    'Fix the footer',
    '2026-05-01T00:00:00.000Z',
    siteId,
  )
  const siteThread = withWaitingSession
    ? { ...baseSiteThread, pendingApprovalCount: 1 }
    : baseSiteThread

  useSessionRailStore.setState({
    collapsedProjectIds: [],
    query: '',
    renaming: null,
    scope: null,
    view: 'active',
  })
  useSessionMultiSelectStore.getState().clear()
  resetSessionSelectionStore()
  useActiveProjectStore.setState({ workspaceRoot: '/repo/platform' })
  resetSessionReadStore()
  resetSessionSearchStore()
  useChatProjectionStore.getState().resetChatProjection()
  useChatProjectionStore.getState().syncShellSnapshot(
    shellSnapshot({
      projects: [...seededProjects(), ...emptyProject],
      threads: [
        seededThread(platformThreadId, 'Ship the rail', '2026-05-09T00:00:00.000Z', platformId),
        withFinishedSession ? { ...siteThread, latestTurn: finishedTurn() } : siteThread,
        ...archived,
      ],
    }),
  )
}

function finishedTurn(): NonNullable<OrchestrationThreadShell['latestTurn']> {
  return {
    assistantMessageId: null,
    completedAt: '2026-05-09T10:00:00.000Z',
    requestedAt: '2026-05-09T09:00:00.000Z',
    startedAt: '2026-05-09T09:00:00.000Z',
    state: 'completed',
    turnId: v.parse(turnIdSchema, 'turn-finished'),
  }
}

function renderSessionRail() {
  const calls = {
    addProjectCount: 0,
    dispatched: [] as ClientOrchestrationCommand[],
    openedProjects: [] as string[],
  }
  const session: ChatModeSession = {
    activeSession: { status: 'ready', threadId: platformThreadId },
    addProject: () => {
      calls.addProjectCount += 1
    },
    environment: {
      dispatchCommand: async (command: ClientOrchestrationCommand) => {
        calls.dispatched.push(command)

        return { deduped: false, sequence: calls.dispatched.length }
      },
    } as ChatEnvironment,
    error: null,
    openProject: (workspaceRoot) => calls.openedProjects.push(workspaceRoot),
    project: chatProject({ id: platformId, title: 'platform', workspaceRoot: '/repo/platform' }),
    ready: true,
    retrying: false,
    retryProject: () => {},
    rootPath: '/repo/platform',
    selectSession: () => {},
    startDraft: () => {},
  }

  // ChatModeSessionProvider hands the app-level project opener over while chat mode
  // is mounted; the rail's own row clicks go through the same seam.
  setSessionProjectOpener((workspaceRoot) => calls.openedProjects.push(workspaceRoot))

  // App.tsx mounts chat mode inside the editor stores, and the row context menu
  // resolves command availability from them.
  renderWithProviders(
    <EditorStateProvider>
      <ChatModeSessionContext value={session}>
        <ChatRailOrderProvider>
          <SessionRail />
        </ChatRailOrderProvider>
      </ChatModeSessionContext>
    </EditorStateProvider>,
  )

  return calls
}
