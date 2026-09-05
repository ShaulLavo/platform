import type { ClientOrchestrationCommand, OrchestrationThreadShell } from '@workspace/contracts'
import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as v from 'valibot'

import type { ChatTransport } from '@/features/chat/transport/chat-transport'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { ProjectDeleteDialog } from '@/features/chat-mode/components/project-delete-dialog'
import { SessionRail } from '@/features/chat-mode/components/session-rail'
import { ChatRailOrderProvider } from '@/features/chat-mode/providers/rail-order-provider'
import {
  ChatModeSessionContext,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { useProjectDeleteRequestStore } from '@/features/chat-mode/state/project-delete-request-store'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { resetSessionReadStore } from '@/features/chat-mode/state/session-read-store'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { TestEditorStateProvider as EditorStateProvider } from '../../../../../test/factories/editor-state-provider'
import { chatProject, shellSnapshot, threadShell } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

const projectId = v.parse(projectIdSchema, 'project-platform')
const threadId = v.parse(threadIdSchema, 'thread-platform')
const olderThreadId = v.parse(threadIdSchema, 'thread-older')
// The factory thread is mid-turn; archiving refuses that, so archive cases start settled.
const settled = { latestTurn: null, session: null } satisfies Partial<OrchestrationThreadShell>

test('right-clicking a project header opens the project menu', async () => {
  renderRail()
  await openHeaderMenu()

  expect(await screen.findByRole('menuitem', { name: 'New Session in This Project' })).toBeVisible()
  expect(screen.getByRole('menuitem', { name: 'Archive All Sessions' })).toBeVisible()
  expect(screen.getByRole('menuitem', { name: 'Delete Project' })).toBeVisible()
  expect(screen.getByRole('menuitem', { name: 'Show Only This Project' })).toBeVisible()
  expect(screen.getByRole('menuitem', { name: 'Collapse Project' })).toBeVisible()
  expect(screen.getByRole('menuitem', { name: 'Copy Path' })).toBeVisible()
})

test('collapsing from the menu folds the band, and the menu then offers expand', async () => {
  renderRail()
  await openHeaderMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Collapse Project' }))

  expect(useSessionRailStore.getState().collapsedProjectIds).toEqual([projectId])
  expect(projectHeader()).toHaveAttribute('aria-expanded', 'false')

  await openHeaderMenu()
  expect(await screen.findByRole('menuitem', { name: 'Expand Project' })).toBeVisible()
})

test('scoping from the menu narrows the rail to the project', async () => {
  renderRail()
  await openHeaderMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Show Only This Project' }))

  expect(useSessionRailStore.getState().scope).toBe(projectId)

  // Already narrowed to this project: the item would filter to what is on screen.
  await openHeaderMenu()
  await screen.findByRole('menuitem', { name: 'Collapse Project' })
  expect(screen.queryByRole('menuitem', { name: 'Show Only This Project' })).toBeNull()
})

test('starting a session from the menu drafts into that project', async () => {
  renderRail()
  await openHeaderMenu()

  await userEvent.click(
    await screen.findByRole('menuitem', { name: 'New Session in This Project' }),
  )

  expect(useSessionSelectionStore.getState().selection).toEqual({ kind: 'draft', projectId })
})

test('archive all dispatches one archive per settled session', async () => {
  const dispatched = renderRail({ threadOverrides: settled, withOlderSession: true })
  await openHeaderMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive All Sessions' }))

  expect(dispatched.map((command) => command.type)).toEqual(['thread.archive', 'thread.archive'])
})

test('archive all lets a running session refuse while the settled one files away', async () => {
  const dispatched = renderRail({ withOlderSession: true })
  await openHeaderMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive All Sessions' }))

  // The factory thread is mid-turn and blocks itself; only the settled one archives.
  expect(dispatched.map((command) => command.type)).toEqual(['thread.archive'])
})

test('deleting a project asks first, and confirming dispatches the cascade', async () => {
  const dispatched = renderRail({ withOlderSession: true })
  useSessionSelectionStore.getState().selectSession(projectId, threadId)
  await openHeaderMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete Project' }))
  expect(dispatched).toEqual([])
  expect(
    await screen.findByText(
      'Permanently delete “platform” and the 2 sessions in it? This cannot be undone.',
    ),
  ).toBeVisible()

  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

  expect(dispatched).toEqual([
    expect.objectContaining({ force: true, projectId, type: 'project.delete' }),
  ])
  // Every row the stage could hand over to is going away with the project.
  expect(useSessionSelectionStore.getState().selection).toEqual({ kind: 'auto' })
})

test('cancelling the delete dialog dispatches nothing and keeps the stage', async () => {
  const dispatched = renderRail()
  useSessionSelectionStore.getState().selectSession(projectId, threadId)
  await openHeaderMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete Project' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

  expect(dispatched).toEqual([])
  expect(screen.queryByText(/Permanently delete/)).toBeNull()
  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId,
    threadId,
  })
})

function projectHeader() {
  return screen.getByTitle('/repo/platform')
}

async function openHeaderMenu() {
  await userEvent.pointer({ keys: '[MouseRight]', target: projectHeader() })
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

  useSessionSelectionStore.setState({ restored: false, selection: { kind: 'auto' } })
  useProjectDeleteRequestStore.setState({ request: null })
  useSessionRailStore.setState({
    collapsedProjectIds: [],
    query: '',
    renaming: null,
    scope: null,
    view: 'active',
  })
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
    transport: {
      dispatchCommand: async (command: ClientOrchestrationCommand) => {
        dispatched.push(command)

        return { deduped: false, sequence: dispatched.length }
      },
    } as ChatTransport,
    error: null,
    openProject: () => {},
    project: chatProject({ id: projectId, title: 'platform', workspaceRoot: '/repo/platform' }),
    ready: true,
    retrying: false,
    retryProject: () => {},
    rootPath: '/repo/platform',
    selectSession: () => {},
    startDraft: () => {},
  }

  renderWithProviders(
    <EditorStateProvider>
      <ChatModeSessionContext value={session}>
        <ChatRailOrderProvider>
          <SessionRail />
        </ChatRailOrderProvider>
        <ProjectDeleteDialog />
      </ChatModeSessionContext>
    </EditorStateProvider>,
  )

  return dispatched
}
