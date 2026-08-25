import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import * as v from 'valibot'
import { vi } from 'vitest'

import {
  quickAccessFilter,
  quickAccessMode,
} from '@/features/command-palette/command-palette-utils'
import {
  CommandPaletteActionsContext,
  type CommandPaletteActions,
} from '@/features/command-palette/providers/actions-context'
import { SessionGroups } from '@/features/command-palette/session-groups'
import type {
  SessionRailItem,
  SessionRailProject,
} from '@/features/chat-mode/utils/session-rail-model'
import { Command, CommandInput, CommandList } from '@workspace/ui/components/command'
import { expect, test } from '../../../../test/fixtures'

const platformId = v.parse(projectIdSchema, 'project-platform')
const siteId = v.parse(projectIdSchema, 'project-site')
const railThreadId = v.parse(threadIdSchema, 'thread-rail')
const footerThreadId = v.parse(threadIdSchema, 'thread-footer')

test('the sess prefix puts the palette in session mode', () => {
  expect(quickAccessMode('sess footer')).toBe('sessions')
})

test('finds a session by its title and opens it', async () => {
  const actions = renderSessionPalette()

  await userEvent.type(screen.getByRole('combobox'), 'sess footer')

  expect(screen.getByText('Fix the footer')).toBeVisible()
  expect(screen.queryByText('Ship the rail')).toBeNull()

  await userEvent.click(screen.getByText('Fix the footer'))

  expect(actions.selectSession).toHaveBeenCalledWith(
    expect.objectContaining({ id: footerThreadId }),
  )
})

test('offers a new session in a project the query names', async () => {
  const actions = renderSessionPalette()

  await userEvent.type(screen.getByRole('combobox'), 'sess site')

  // The project row is the one carrying the workspace root.
  await userEvent.click(screen.getByText('/repo/site'))

  expect(actions.startSessionDraft).toHaveBeenCalledWith(siteId)
})

function renderSessionPalette() {
  const actions = commandPaletteActions()

  render(
    <CommandPaletteActionsProvider actions={actions}>
      {/* The real palette's own filter and prefix handling — a stubbed filter here
          would prove nothing about whether typing a title finds the session. */}
      <Command filter={quickAccessFilter} shouldFilter>
        <CommandInput />
        <CommandList>
          <SessionGroups projects={sessionProjects()} sessions={sessionItems()} />
        </CommandList>
      </Command>
    </CommandPaletteActionsProvider>,
  )

  return actions
}

function CommandPaletteActionsProvider({
  actions,
  children,
}: {
  readonly actions: CommandPaletteActions
  readonly children: ReactNode
}) {
  return <CommandPaletteActionsContext value={actions}>{children}</CommandPaletteActionsContext>
}

function commandPaletteActions(): CommandPaletteActions {
  return {
    disabledReasonForCommand: vi.fn(() => null),
    previewColorTheme: vi.fn(),
    selectColorTheme: vi.fn(),
    selectFile: vi.fn(),
    selectPlatformCommand: vi.fn(),
    selectScript: vi.fn(),
    selectSession: vi.fn(),
    selectGotoLine: vi.fn(),
    selectSymbol: vi.fn(),
    startSessionDraft: vi.fn(),
  }
}

function sessionItems(): readonly SessionRailItem[] {
  return [
    sessionItem(railThreadId, 'Ship the rail', platformId, 'platform'),
    sessionItem(footerThreadId, 'Fix the footer', siteId, 'site'),
  ]
}

function sessionItem(
  id: typeof railThreadId,
  title: string,
  projectId: typeof platformId,
  projectTitle: string,
): SessionRailItem {
  return {
    activityAt: '2026-05-09T00:00:00.000Z',
    archived: false,
    branch: null,
    createdAt: '2026-05-09T00:00:00.000Z',
    id,
    pinOrderKey: null,
    planProgress: null,
    projectId,
    projectTitle,
    status: 'idle',
    title,
    unread: false,
    worktreePath: null,
  }
}

function sessionProjects(): readonly SessionRailProject[] {
  return [
    {
      active: true,
      id: platformId,
      orderKey: null,
      qualifier: null,
      sessionCount: 1,
      status: 'idle',
      title: 'platform',
      unreadCount: 0,
      workspaceRoot: '/repo/platform',
    },
    {
      active: false,
      id: siteId,
      orderKey: null,
      qualifier: null,
      sessionCount: 1,
      status: 'idle',
      title: 'site',
      unreadCount: 0,
      workspaceRoot: '/repo/site',
    },
  ]
}
