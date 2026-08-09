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

test('waits on a pick from another project while its root is being opened', () => {
  const pending = resolve({
    selection: { kind: 'session', projectId: otherProjectId, threadId: threadA },
    switchingProject: true,
    threadIds: [threadA],
  })
  const pendingDraft = resolve({
    selection: { kind: 'draft', projectId: otherProjectId },
    switchingProject: true,
    threadIds: [threadA],
  })

  expect(pending.status).toBe('resolving')
  expect(pendingDraft.status).toBe('resolving')
  expect(activeSessionShowsComposer(pendingDraft)).toBe(false)
})

test('abandons a pick from another project once no root swap is in flight', () => {
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

function resolve({
  selection,
  switchingProject = false,
  threadIds,
}: {
  selection: SessionSelection
  switchingProject?: boolean
  threadIds: readonly ReturnType<typeof v.parse<typeof threadIdSchema>>[]
}) {
  return activeSession({ projectId, selection, switchingProject, threadIds })
}
