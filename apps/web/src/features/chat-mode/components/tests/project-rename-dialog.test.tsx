import type { ClientOrchestrationCommand } from '@workspace/contracts'
import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as v from 'valibot'
import { vi } from 'vitest'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import { ProjectRenameDialog } from '@/features/chat-mode/components/project-rename-dialog'
import {
  ChatModeSessionContext,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { useProjectRenameRequestStore } from '@/features/chat-mode/state/project-rename-request-store'
import { chatProject } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

// `sonner` is third-party and is the only mock this plan permits — same shape
// as `features/git/tests/notify-mutation-error.test.ts`.
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const projectId = v.parse(projectIdSchema, 'project-platform')
const threadId = v.parse(threadIdSchema, 'thread-platform')

function renderDialog(dispatchCommand: ChatEnvironment['dispatchCommand']) {
  toastError.mockReset()
  useProjectRenameRequestStore.setState({ request: { projectId, title: 'platform' } })

  // Copied from `project-menu.test.tsx`, with `environment` swapped for the
  // injected dispatch.
  const session: ChatModeSession = {
    activeSession: { status: 'ready', threadId },
    addProject: () => {},
    environment: { dispatchCommand } as ChatEnvironment,
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
    <ChatModeSessionContext value={session}>
      <ProjectRenameDialog />
    </ChatModeSessionContext>,
  )
}

async function rename(next: string) {
  const input = await screen.findByLabelText('Project name')
  await userEvent.clear(input)
  await userEvent.type(input, next)
  await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
}

test('a refused rename keeps the dialog open and says why', async () => {
  renderDialog((async () => {
    throw new Error('socket closed')
  }) as ChatEnvironment['dispatchCommand'])

  await rename('platform-two')

  await waitFor(() =>
    expect(toastError).toHaveBeenCalledWith('Could not rename the project', {
      description: 'socket closed',
    }),
  )
  // The dialog is the user's only way back to the rename; dismissing on
  // dispatch told them it landed when it had not.
  expect(useProjectRenameRequestStore.getState().request).not.toBeNull()
  expect(screen.getByRole('button', { name: 'Rename' })).toBeVisible()
})

test('an accepted rename closes the dialog', async () => {
  renderDialog((async (_command: ClientOrchestrationCommand) => ({
    deduped: false,
    sequence: 1,
  })) as ChatEnvironment['dispatchCommand'])

  await rename('platform-two')

  await waitFor(() => expect(useProjectRenameRequestStore.getState().request).toBeNull())
  expect(toastError).not.toHaveBeenCalled()
})
