import {
  jumpToSession,
  selectAdjacentSession,
  startScopedSessionDraft,
} from '@/features/chat-mode/state/session-commands'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import {
  SESSION_JUMP_POSITIONS,
  sessionJumpCommandId,
  type PlatformCommandId,
} from '@/keymap/types'
import { createRailHarness } from '../../../test/factories/rail-harness'
import { expect, test } from '../../../test/fixtures'
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

test('jumping selects the requested scoped row only after its real root opens', async ({
  client,
  server,
}) => {
  const h = await createRailHarness(client, server, ['First', 'Second', 'Third'])
  expect(await jumpToSession(2)).toBe(true)
  expect(selectedSessionId()).toBe(h.sessionIds[1])
  expect(h.application.getSnapshot().editor.workspaceStore.getState().rootFolder?.path).toBe(
    h.context.worktree!.path,
  )
})
test('jumping past the end preserves selection', async ({ client, server }) => {
  const h = await createRailHarness(client, server)
  await jumpToSession(1)
  const selected = selectedSessionId()
  expect(await jumpToSession(3)).toBe(false)
  expect(selectedSessionId()).toBe(selected)
  expect(h.sessionIds).toContain(selected)
})
test('next and previous traverse the visible order and wrap', async ({ client, server }) => {
  await createRailHarness(client, server, ['First', 'Second', 'Third'])
  await jumpToSession(1)
  const first = selectedSessionId()
  await selectAdjacentSession('next')
  const second = selectedSessionId()
  expect(second).not.toBe(first)
  await selectAdjacentSession('previous')
  expect(selectedSessionId()).toBe(first)
  await selectAdjacentSession('previous')
  expect(selectedSessionId()).not.toBe(first)
  await selectAdjacentSession('next')
  expect(selectedSessionId()).toBe(first)
})
test('traversal uses the same filtered rows as the rail', async ({ client, server }) => {
  const h = await createRailHarness(client, server)
  useSessionRailStore.getState().setQuery('Second')
  expect(await jumpToSession(1)).toBe(true)
  expect(selectedSessionId()).toBe(h.sessionIds[1])
  await selectAdjacentSession('next')
  expect(selectedSessionId()).toBe(h.sessionIds[1])
})
test('new session uses the scoped project and leaves the archive view', async ({
  client,
  server,
}) => {
  const h = await createRailHarness(client, server)
  useSessionRailStore.getState().setScope(h.projectId)
  useSessionRailStore.getState().setView('archived')
  expect(await startScopedSessionDraft()).toBe(true)
  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'draft',
    environmentId: h.environmentId,
    projectId: h.projectId,
  })
  expect(useSessionRailStore.getState().view).toBe('active')
})
function selectedSessionId() {
  const { selection } = useSessionSelectionStore.getState()
  return selection.kind === 'session' ? selection.sessionId : null
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
