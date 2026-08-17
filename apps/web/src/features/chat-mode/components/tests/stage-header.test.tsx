import {
  projectIdSchema,
  threadIdSchema,
  type ClientOrchestrationCommand,
} from '@workspace/contracts'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as v from 'valibot'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { StageHeader } from '@/features/chat-mode/components/stage-header'
import {
  ChatModeSessionContext,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { resetSessionReadStore } from '@/features/chat-mode/state/session-read-store'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { sessionRailItem } from '@/features/chat-mode/utils/session-rail-model'
import { EditorStateProvider } from '@/features/editor/providers/state-provider'
import {
  chatProject,
  shellSnapshot,
  sidebarThreadSummary,
  threadShell,
} from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

const projectId = v.parse(projectIdSchema, 'project-platform')
const threadId = v.parse(threadIdSchema, 'thread-platform')

test('renames the session it is showing from its own menu', async () => {
  const dispatched = renderStageHeader()

  await userEvent.click(screen.getByRole('button', { name: 'Session actions' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
  const field = screen.getByRole('textbox', { name: 'Session title' })
  await userEvent.clear(field)
  await userEvent.type(field, 'Ship the header{Enter}')

  expect(dispatched.map((command) => command.type)).toEqual(['thread.meta.update'])
  expect(dispatched[0]).toMatchObject({ threadId, title: 'Ship the header' })
  expect(screen.getByRole('heading', { name: 'Ship the rail' })).toBeVisible()
})

test('refuses an empty title instead of sending one the server would reject', async () => {
  const dispatched = renderStageHeader()

  await userEvent.click(screen.getByRole('button', { name: 'Session actions' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
  const field = screen.getByRole('textbox', { name: 'Session title' })
  await userEvent.clear(field)
  await userEvent.type(field, '   {Enter}')

  expect(dispatched).toEqual([])
  expect(screen.getByRole('heading', { name: 'Ship the rail' })).toBeVisible()
})

test('renaming from the header leaves the rail row alone', async () => {
  renderStageHeader()

  await userEvent.click(screen.getByRole('button', { name: 'Session actions' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))

  expect(useSessionRailStore.getState().renaming).toEqual({ surface: 'header', threadId })
})

test('the composer has no session to act on', () => {
  seedProjection()
  renderWithProviders(
    <EditorStateProvider>
      <ChatModeSessionContext value={chatModeSession([])}>
        <StageHeader contextUsage={null} projectTitle='platform' session={null} />
      </ChatModeSessionContext>
    </EditorStateProvider>,
  )

  expect(screen.getByRole('heading', { name: 'New session' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Session actions' })).toBeNull()
})

function seedProjection() {
  useSessionRailStore.setState({ query: '', renaming: null, scope: null, view: 'active' })
  useSessionSelectionStore.setState({ selection: { kind: 'auto' } })
  resetSessionReadStore()
  useChatProjectionStore.getState().resetChatProjection()
  useChatProjectionStore.getState().syncShellSnapshot(
    shellSnapshot({
      projects: [chatProject({ id: projectId, title: 'platform' })],
      threads: [
        threadShell({
          id: threadId,
          latestTurn: null,
          projectId,
          session: null,
          title: 'Ship the rail',
        }),
      ],
    }),
  )
}

function chatModeSession(dispatched: ClientOrchestrationCommand[]): ChatModeSession {
  return {
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
    project: chatProject({ id: projectId, title: 'platform' }),
    ready: true,
    retrying: false,
    retryProject: () => {},
    rootPath: '/repo/platform',
    selectSession: () => {},
    startDraft: () => {},
    threads: [],
  }
}

function renderStageHeader() {
  seedProjection()
  const dispatched: ClientOrchestrationCommand[] = []
  // Same shape the projection seeded above holds, so the header renders the row the
  // rail would render for this thread.
  const summary = sidebarThreadSummary({
    id: threadId,
    latestTurn: null,
    projectId,
    session: null,
    title: 'Ship the rail',
  })

  renderWithProviders(
    <EditorStateProvider>
      <ChatModeSessionContext value={chatModeSession(dispatched)}>
        <StageHeader
          contextUsage={null}
          projectTitle='platform'
          session={sessionRailItem(summary, 'platform', undefined)}
        />
      </ChatModeSessionContext>
    </EditorStateProvider>,
  )

  return dispatched
}
