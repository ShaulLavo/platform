import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import {
  jumpToSession,
  selectAdjacentSession,
  setSessionProjectOpener,
  startScopedSessionDraft,
} from '@/features/chat-mode/state/session-commands'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { resetSessionReadStore } from '@/features/chat-mode/state/session-read-store'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { useActiveProjectStore } from '@/features/workspace/state/active-project'
import { chatProject, shellSnapshot, threadShell } from '../../../test/factories/chat'
import { expect, test } from '../../../test/fixtures'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import { SESSION_JUMP_POSITIONS, sessionJumpCommandId } from '@/keymap/types'
import type { PlatformCommandId } from '@/keymap/types'

const platformId = v.parse(projectIdSchema, 'project-platform')
const siteId = v.parse(projectIdSchema, 'project-site')
const first = v.parse(threadIdSchema, 'thread-first')
const second = v.parse(threadIdSchema, 'thread-second')
const third = v.parse(threadIdSchema, 'thread-third')

test('every session command is reachable from the keyboard', () => {
  const bound = boundCommands()

  expect(bound.get('workspace.newSession')).toEqual(['Mod+Alt+N'])
  expect(bound.get('workspace.toggleSessionRail')).toEqual(['Mod+Alt+B'])
  expect(bound.get('workspace.previousSession')).toEqual(['Mod+Alt+['])
  expect(bound.get('workspace.nextSession')).toEqual(['Mod+Alt+]'])
  expect(
    SESSION_JUMP_POSITIONS.map((position) => bound.get(sessionJumpCommandId(position))),
  ).toEqual([
    ['Mod+Alt+1'],
    ['Mod+Alt+2'],
    ['Mod+Alt+3'],
    ['Mod+Alt+4'],
    ['Mod+Alt+5'],
    ['Mod+Alt+6'],
    ['Mod+Alt+7'],
    ['Mod+Alt+8'],
    ['Mod+Alt+9'],
  ])
})

test('jumping by position selects the nth row the rail is drawing', () => {
  seedSessions()

  expect(jumpToSession(2)).toBe(true)
  expect(selectedThreadId()).toBe(second)

  expect(jumpToSession(3)).toBe(true)
  expect(selectedThreadId()).toBe(third)
})

test('jumping past the end of the list selects nothing', () => {
  seedSessions()
  jumpToSession(1)

  expect(jumpToSession(4)).toBe(false)
  expect(selectedThreadId()).toBe(first)
})

test('next and previous walk the list and wrap at both ends', () => {
  seedSessions()
  jumpToSession(1)

  selectAdjacentSession('next')
  expect(selectedThreadId()).toBe(second)

  selectAdjacentSession('previous')
  expect(selectedThreadId()).toBe(first)

  // Off the top comes back round the bottom, so the keys never dead-end.
  selectAdjacentSession('previous')
  expect(selectedThreadId()).toBe(third)
})

test('traversal counts the rows the user can see, not every thread', () => {
  seedSessions()
  useSessionRailStore.getState().setQuery('second')

  expect(jumpToSession(1)).toBe(true)
  expect(selectedThreadId()).toBe(second)
  // The filtered list holds one row: there is nowhere else to step to.
  selectAdjacentSession('next')
  expect(selectedThreadId()).toBe(second)
})

test('jumping to a session in another project activates that project first', () => {
  const opened: string[] = []
  seedSessions()
  setSessionProjectOpener((workspaceRoot) => opened.push(workspaceRoot))

  jumpToSession(3)

  expect(opened).toEqual(['/repo/site'])
})

test('a new session goes to the scoped project when the list is narrowed to one', () => {
  seedSessions()
  useSessionRailStore.getState().setScope(siteId)

  expect(startScopedSessionDraft()).toBe(true)
  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'draft',
    projectId: siteId,
  })
})

test('a new session leaves the archive browser, which could never show it', () => {
  seedSessions()
  useSessionRailStore.getState().setView('archived')

  startScopedSessionDraft()

  expect(useSessionRailStore.getState().view).toBe('active')
})

function selectedThreadId() {
  const { selection } = useSessionSelectionStore.getState()

  return selection.kind === 'session' ? selection.threadId : null
}

function boundCommands() {
  const commands = new Map<PlatformCommandId, string[]>()
  for (const binding of defaultPlatformKeyBindings('mac')) {
    if (!binding.command) continue
    const keys = commands.get(binding.command) ?? []
    keys.push(binding.keys)
    commands.set(binding.command, keys)
  }
  return commands
}

function seedSessions() {
  useSessionRailStore.setState({ query: '', renaming: null, scope: null, view: 'active' })
  useSessionSelectionStore.setState({ selection: { kind: 'auto' } })
  useActiveProjectStore.setState({ workspaceRoot: '/repo/platform' })
  setSessionProjectOpener(null)
  resetSessionReadStore()
  useChatProjectionStore.getState().resetChatProjection()
  useChatProjectionStore.getState().syncShellSnapshot(
    shellSnapshot({
      projects: [
        chatProject({ id: platformId, title: 'platform', workspaceRoot: '/repo/platform' }),
        chatProject({ id: siteId, title: 'site', workspaceRoot: '/repo/site' }),
      ],
      threads: [
        threadShell({
          createdAt: '2026-05-09T00:00:00.000Z',
          id: first,
          projectId: platformId,
          title: 'First session',
        }),
        threadShell({
          createdAt: '2026-05-05T00:00:00.000Z',
          id: second,
          projectId: platformId,
          title: 'Second session',
        }),
        threadShell({
          createdAt: '2026-05-01T00:00:00.000Z',
          id: third,
          projectId: siteId,
          title: 'Third session',
        }),
      ],
    }),
  )
}
