import type { ClientOrchestrationCommand, OrchestrationThreadShell } from '@workspace/contracts'
import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as v from 'valibot'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { SessionDeleteDialog } from '@/features/chat-mode/components/session-delete-dialog'
import { SessionRail } from '@/features/chat-mode/components/session-rail'
import { ChatRailOrderProvider } from '@/features/chat-mode/providers/rail-order-provider'
import {
  ChatModeSessionContext,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { useSessionDeleteRequestStore } from '@/features/chat-mode/state/session-delete-request-store'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { resetSessionReadStore } from '@/features/chat-mode/state/session-read-store'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { EditorStateProvider } from '@/features/editor/providers/state-provider'
import { chatProject, shellSnapshot, threadShell } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

const projectId = v.parse(projectIdSchema, 'project-platform')
const threadId = v.parse(threadIdSchema, 'thread-platform')
const olderThreadId = v.parse(threadIdSchema, 'thread-older')
// The factory thread is mid-turn; archiving refuses that, so most cases start settled.
const settled = { latestTurn: null, session: null } satisfies Partial<OrchestrationThreadShell>

test('renaming a session dispatches the title update the server already understands', async () => {
  const dispatched = renderRail()
  await openRowMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
  const field = screen.getByRole('textbox', { name: 'Session title' })
  await userEvent.clear(field)
  await userEvent.type(field, 'Ship the menu{Enter}')

  expect(dispatched.map((command) => command.type)).toEqual(['thread.meta.update'])
  expect(dispatched[0]).toMatchObject({ threadId, title: 'Ship the menu' })
})

test('escaping a rename leaves the title alone', async () => {
  const dispatched = renderRail()
  await openRowMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
  const field = screen.getByRole('textbox', { name: 'Session title' })
  await userEvent.clear(field)
  await userEvent.type(field, 'Never sent{Escape}')

  expect(dispatched).toEqual([])
  expect(screen.getByTitle('Ship the rail')).toBeVisible()
})

test('archiving a session dispatches the archive command and hands the stage to its neighbour', async () => {
  const dispatched = renderRail({ threadOverrides: settled, withOlderSession: true })
  useSessionSelectionStore.getState().selectSession(projectId, threadId)
  await openRowMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }))

  expect(dispatched.map((command) => command.type)).toEqual(['thread.archive'])
  // The rail hides archived sessions, so the stage moves to the row below it.
  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId,
    threadId: olderThreadId,
  })
})

test('archiving a session mid-turn is refused, agent and stage untouched', async () => {
  const dispatched = renderRail()
  useSessionSelectionStore.getState().selectSession(projectId, threadId)
  await openRowMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }))

  expect(dispatched).toEqual([])
  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId,
    threadId,
  })
})

test('deleting asks before it dispatches, and confirming moves the stage on', async () => {
  const dispatched = renderRail({ threadOverrides: settled, withOlderSession: true })
  useSessionSelectionStore.getState().selectSession(projectId, threadId)
  await openRowMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
  expect(dispatched).toEqual([])
  expect(await screen.findByText(/Permanently delete “Ship the rail”/)).toBeVisible()

  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

  expect(dispatched.map((command) => command.type)).toEqual(['thread.delete'])
  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId,
    threadId: olderThreadId,
  })
})

test('cancelling the delete dialog dispatches nothing and keeps the stage', async () => {
  const dispatched = renderRail({ threadOverrides: settled, withOlderSession: true })
  useSessionSelectionStore.getState().selectSession(projectId, threadId)
  await openRowMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

  expect(dispatched).toEqual([])
  expect(screen.queryByText(/Permanently delete/)).toBeNull()
  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId,
    threadId,
  })
})

test('offers to stop the agent while a provider session is running', async () => {
  const dispatched = renderRail()
  await openRowMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Stop Agent Session' }))

  expect(dispatched.map((command) => command.type)).toEqual(['thread.session.stop'])
})

test('a thread with no live agent session offers nothing to stop', async () => {
  renderRail({ threadOverrides: { session: null } })
  await openRowMenu()

  await screen.findByRole('menuitem', { name: 'Rename' })
  expect(screen.queryByRole('menuitem', { name: 'Stop Agent Session' })).toBeNull()
})

async function openRowMenu() {
  await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByTitle('Ship the rail') })
}

function renderRail({
  threadOverrides = {},
  withOlderSession = false,
}: {
  threadOverrides?: Partial<OrchestrationThreadShell>
  withOlderSession?: boolean
} = {}) {
  const dispatched: ClientOrchestrationCommand[] = []
  const olderSession = withOlderSession
    ? [
        threadShell({
          ...settled,
          id: olderThreadId,
          createdAt: '2026-05-01T00:00:00.000Z',
          projectId,
          title: 'Older session',
        }),
      ]
    : []

  useSessionSelectionStore.setState({ selection: { kind: 'auto' } })
  useSessionDeleteRequestStore.setState({ request: null })
  useSessionRailStore.setState({ query: '', renaming: null, scope: null, view: 'active' })
  resetSessionReadStore()
  useChatProjectionStore.getState().resetChatProjection()
  useChatProjectionStore.getState().syncShellSnapshot(
    shellSnapshot({
      projects: [
        chatProject({ id: projectId, title: 'platform', workspaceRoot: '/repo/platform' }),
      ],
      threads: [
        threadShell({
          id: threadId,
          createdAt: '2026-05-09T00:00:00.000Z',
          projectId,
          title: 'Ship the rail',
          ...threadOverrides,
        }),
        ...olderSession,
      ],
    }),
  )

  const session: ChatModeSession = {
    activeSession: { status: 'ready', threadId },
    addProject: () => {},
    environment: {
      dispatchCommand: async (command: ClientOrchestrationCommand) => {
        dispatched.push(command)

        return { deduped: false, sequence: dispatched.length }
      },
    } as ChatEnvironment,
    error: null,
    openProject: () => {},
    project: chatProject({ id: projectId, title: 'platform', workspaceRoot: '/repo/platform' }),
    ready: true,
    retrying: false,
    retryProject: () => {},
    rootPath: '/repo/platform',
    selectSession: () => {},
    startDraft: () => {},
    threads: [],
  }

  renderWithProviders(
    <EditorStateProvider>
      <ChatModeSessionContext value={session}>
        {/* ChatModeSessionProvider wraps the surface in this and mounts the
            dialog next to it; the rail reads its reorder actions out of it. */}
        <ChatRailOrderProvider>
          <SessionRail />
        </ChatRailOrderProvider>
        <SessionDeleteDialog />
      </ChatModeSessionContext>
    </EditorStateProvider>,
  )

  return dispatched
}
