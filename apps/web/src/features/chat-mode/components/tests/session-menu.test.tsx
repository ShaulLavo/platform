import type { ClientOrchestrationCommand, OrchestrationThreadShell } from '@workspace/contracts'
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
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import { chatProject, shellSnapshot, threadShell } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

const projectId = v.parse(projectIdSchema, 'project-platform')
const threadId = v.parse(threadIdSchema, 'thread-platform')

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

test('archiving a session dispatches the archive command and releases the stage', async () => {
  useSessionSelectionStore.getState().selectSession(projectId, threadId)
  const dispatched = renderRail()
  await openRowMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }))

  expect(dispatched.map((command) => command.type)).toEqual(['thread.archive'])
  // The rail hides archived sessions, so the stage must not stay pinned to it.
  expect(useSessionSelectionStore.getState().selection).toEqual({ kind: 'auto' })
})

test('offers to stop the agent while a provider session is running', async () => {
  const dispatched = renderRail()
  await openRowMenu()

  await userEvent.click(await screen.findByRole('menuitem', { name: 'Stop Agent Session' }))

  expect(dispatched.map((command) => command.type)).toEqual(['thread.session.stop'])
})

test('a thread with no live agent session offers nothing to stop', async () => {
  renderRail({ session: null })
  await openRowMenu()

  await screen.findByRole('menuitem', { name: 'Rename' })
  expect(screen.queryByRole('menuitem', { name: 'Stop Agent Session' })).toBeNull()
})

async function openRowMenu() {
  await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByTitle('Ship the rail') })
}

function renderRail(threadOverrides: Partial<OrchestrationThreadShell> = {}) {
  const dispatched: ClientOrchestrationCommand[] = []

  useSessionSelectionStore.setState({ selection: { kind: 'auto' } })
  useChatProjectionStore.getState().resetChatProjection()
  useChatProjectionStore.getState().syncShellSnapshot(
    shellSnapshot({
      projects: [
        chatProject({ id: projectId, title: 'platform', workspaceRoot: '/repo/platform' }),
      ],
      threads: [
        threadShell({ id: threadId, projectId, title: 'Ship the rail', ...threadOverrides }),
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
    rootPath: '/repo/platform',
    selectSession: () => {},
    startDraft: () => {},
    threads: [],
  }

  renderWithProviders(
    <EditorStateProvider>
      <ChatModeSessionContext value={session}>
        <SessionRail />
      </ChatModeSessionContext>
    </EditorStateProvider>,
  )

  return dispatched
}
