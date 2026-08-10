import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import {
  activeSession,
  activeSessionShowsComposer,
  type SessionSelection,
} from '@/features/chat-mode/utils/active-session'
import { expect, test } from '../../../../../test/fixtures'

const projectId = v.parse(projectIdSchema, 'project-1')
const otherProjectId = v.parse(projectIdSchema, 'project-2')
const threadA = v.parse(threadIdSchema, 'thread-a')
const threadB = v.parse(threadIdSchema, 'thread-b')

test('falls back to the newest session when nothing is picked', () => {
  const session = resolve({ selection: { kind: 'auto' }, threadIds: [threadA, threadB] })

  expect(session).toEqual({ status: 'auto', threadId: threadA })
  expect(activeSessionShowsComposer(session)).toBe(false)
})

test('shows the composer when the project has no sessions', () => {
  const session = resolve({ selection: { kind: 'auto' }, threadIds: [] })

  expect(session.threadId).toBeNull()
  expect(activeSessionShowsComposer(session)).toBe(true)
})

test('keeps the composer open for a draft started in the open project', () => {
  const session = resolve({ selection: { kind: 'draft', projectId }, threadIds: [threadA] })

  expect(session.status).toBe('draft')
  expect(activeSessionShowsComposer(session)).toBe(true)
})

test('resolves a picked session that belongs to the open project', () => {
  const session = resolve({
    selection: { kind: 'session', projectId, threadId: threadB },
    threadIds: [threadA, threadB],
  })

  expect(session).toEqual({ status: 'ready', threadId: threadB })
})

test('waits while a freshly created session has not landed in the projection', () => {
  const session = resolve({
    selection: { kind: 'session', projectId, threadId: threadB },
    threadIds: [threadA],
  })

  expect(session.status).toBe('resolving')
})

test('falls back to the active project when the pick names another one', () => {
  const session = resolve({
    selection: { kind: 'session', projectId: otherProjectId, threadId: threadB },
    threadIds: [threadA],
  })

  expect(session).toEqual({ status: 'auto', threadId: threadA })
})

test('abandons a stale foreign draft instead of stranding the stage', () => {
  const session = resolve({
    selection: { kind: 'draft', projectId: otherProjectId },
    threadIds: [],
  })

  expect(session).toEqual({ status: 'auto', threadId: null })
  expect(activeSessionShowsComposer(session)).toBe(true)
})

test('reports a restored pick whose session no longer exists as gone', () => {
  const session = resolve({
    restored: true,
    selection: { kind: 'session', projectId, threadId: threadB },
    threadIds: [threadA],
  })

  // Not `resolving`: nothing is on its way, and a spinner here is an app that hangs.
  expect(session).toEqual({ status: 'missing', threadId: null })
})

test('waits on a restored pick until its project has loaded', () => {
  const session = activeSession({
    projectId: null,
    restored: true,
    selection: { kind: 'session', projectId, threadId: threadB },
    threadIds: [],
  })

  expect(session.status).toBe('resolving')
})

function resolve({
  restored = false,
  selection,
  threadIds,
}: {
  restored?: boolean
  selection: SessionSelection
  threadIds: readonly ReturnType<typeof v.parse<typeof threadIdSchema>>[]
}) {
  return activeSession({ projectId, restored, selection, threadIds })
}
